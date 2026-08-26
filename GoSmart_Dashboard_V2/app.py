import csv
import io
import json
import os
import secrets
import threading
import time
from pathlib import Path
from urllib.parse import quote

from flask import Flask, jsonify, redirect, render_template, request, send_from_directory, session, url_for
import paho.mqtt.client as mqtt
from werkzeug.utils import secure_filename

BASE = Path(__file__).resolve().parent
DATA_DIR = BASE / "data"
FIRMWARE_DIR = BASE / "firmwarev2"
DATA_DIR.mkdir(exist_ok=True)
FIRMWARE_DIR.mkdir(exist_ok=True)

app = Flask(
    __name__,
    template_folder="app/templates",
    static_folder="app/static",
)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "change-me-in-production")

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "change-me")

const char* mqtt_server = "i26a1c71.ala.asia-southeast1.emqxsl.com";
const int mqtt_port = 8883;
const char* mqtt_user = "smartnest_client";
const char* mqtt_pass = "D2m9ga8JynJDEM6";

NODES_FILE = DATA_DIR / "active_nodes.json"
TELEMETRY_FILE = DATA_DIR / "telemetry_data.json"
META_FILE = DATA_DIR / "device_meta.json"
EVENTS_FILE = DATA_DIR / "events.json"

state_lock = threading.RLock()
live_logs = []
MAX_LOGS = 100

def load_json(path, default):
    with state_lock:
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return default

def save_json(path, data):
    tmp = path.with_suffix(path.suffix + ".tmp")
    with state_lock:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)

def add_event(kind, node_id, message, extra=None):
    event = {
        "ts": int(time.time()),
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "kind": kind,
        "node_id": node_id or "",
        "message": message,
        "extra": extra or {},
    }
    with state_lock:
        live_logs.append(event)
        del live_logs[:-MAX_LOGS]
        events = load_json(EVENTS_FILE, [])
        events.append(event)
        save_json(EVENTS_FILE, events[-1000:])

def update_node(node_id, online=None):
    nodes = set(load_json(NODES_FILE, []))
    if online is True:
        nodes.add(node_id)
    elif online is False:
        nodes.discard(node_id)
    save_json(NODES_FILE, sorted(nodes))

def update_telemetry(node_id, data):
    telemetry = load_json(TELEMETRY_FILE, {})
    record = telemetry.setdefault(node_id, {"channels": {}})
    ch = str(data.get("channel", "0"))
    record["channels"][ch] = {
        "toggles": data.get("toggles", 0),
        "on_hours": data.get("on_hours", "0.00"),
        "updated_at": int(time.time()),
    }
    for key in ("boot_count", "crash_count", "rssi", "fw_version", "uptime", "local_ip"):
        if key in data:
            record[key] = data[key]
    record["last_seen"] = int(time.time())
    save_json(TELEMETRY_FILE, telemetry)
    update_node(node_id, True)

def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        topics = [
            ("home/device/+/status", 0),
            ("home/device/+/telemetry", 0),
            ("home/device/+/info", 0),
            ("smartnest/devices/+/ota/status", 0),
            ("smartnest/devices/+/logs", 0),
        ]
        client.subscribe(topics)
        add_event("mqtt", "", "MQTT connected")
    else:
        add_event("error", "", f"MQTT connection failed: {rc}")

def on_disconnect(client, userdata, disconnect_flags, reason_code, properties=None):
    add_event("mqtt", "", f"MQTT disconnected: {reason_code}")

def on_message(client, userdata, msg):
    try:
        topic = msg.topic
        payload = msg.payload.decode("utf-8", errors="replace")
        parts = topic.split("/")
        data = json.loads(payload) if payload.lstrip().startswith("{") else {"raw": payload}

        if topic.startswith("home/device/") and len(parts) >= 4:
            node_id = parts[2]
            kind = parts[3]
            if kind == "status":
                if data.get("is_online") is True or "channel" in data:
                    update_node(node_id, True)
                elif data.get("is_online") is False:
                    update_node(node_id, False)
                add_event("status", node_id, "Status received", data)
            elif kind == "telemetry":
                update_telemetry(node_id, data)
                add_event("telemetry", node_id, f"Channel {data.get('channel', '?')} telemetry", data)
            elif kind == "info":
                update_node(node_id, True)
                tele = load_json(TELEMETRY_FILE, {})
                rec = tele.setdefault(node_id, {"channels": {}})
                rec.update(data)
                rec["last_seen"] = int(time.time())
                save_json(TELEMETRY_FILE, tele)
                add_event("info", node_id, "Device info received", data)
            return

        if topic.startswith("smartnest/devices/") and len(parts) >= 4:
            node_id = parts[2]
            kind = parts[3]
            if kind == "ota":
                add_event("ota", node_id, f"OTA: {data.get('status', payload)}", data)
            elif kind == "logs":
                add_event("log", node_id, payload, data)
    except Exception as exc:
        add_event("error", "", f"MQTT message parse error: {exc}")

mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
mqtt_client.username_pw_set(MQTT_USER, MQTT_PASS)
mqtt_client.tls_set()
mqtt_client.on_connect = on_connect
mqtt_client.on_disconnect = on_disconnect
mqtt_client.on_message = on_message

try:
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()
except Exception as exc:
    add_event("error", "", f"MQTT startup error: {exc}")

def login_required():
    return bool(session.get("logged_in"))

def publish_control(node_id, payload):
    if not node_id:
        raise ValueError("node_id is required")
    topic = f"home/device/{node_id}/control"
    info = mqtt_client.publish(topic, json.dumps(payload), qos=1)
    if info.rc != mqtt.MQTT_ERR_SUCCESS:
        raise RuntimeError(f"MQTT publish failed: {info.rc}")
    add_event("command", node_id, "Command sent", payload)

@app.route("/", methods=["GET", "POST"])
def index():
    error = None
    if request.method == "POST":
        if secrets.compare_digest(request.form.get("username", ""), ADMIN_USERNAME) and secrets.compare_digest(request.form.get("password", ""), ADMIN_PASSWORD):
            session["logged_in"] = True
            session.permanent = True
            return redirect(url_for("index"))
        error = "Wrong username or password."
    if not login_required():
        return render_template("index.html", error=error, logged_in=False)
    return render_template("index.html", logged_in=True)

@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

@app.post("/api/upload")
def upload():
    if not login_required():
        return jsonify(status="error", message="Unauthorized"), 401
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify(status="error", message="No file selected"), 400
    filename = secure_filename(file.filename)
    if not filename:
        return jsonify(status="error", message="Invalid filename"), 400
    file.save(FIRMWARE_DIR / filename)
    add_event("firmware", "", f"Firmware uploaded: {filename}")
    return jsonify(status="success", filename=filename)

@app.post("/api/device/control")
def device_control():
    if not login_required():
        return jsonify(status="error", message="Unauthorized"), 401
    data = request.get_json(silent=True) or {}
    node = str(data.get("node_id", "")).strip()
    channel = int(data.get("channel", 0))
    status = data.get("status")
    speed = data.get("speed")
    if not node:
        return jsonify(status="error", message="node_id required"), 400

    payload = {"channel": channel}
    if channel in (1, 2, 3, 4, 6, 7):
        if status not in ("ON", "OFF"):
            return jsonify(status="error", message="status must be ON/OFF"), 400
        payload["status"] = status
    elif channel == 5:
        if speed is None or int(speed) not in range(0, 5):
            return jsonify(status="error", message="speed must be 0..4"), 400
        payload["speed"] = int(speed)
    else:
        return jsonify(status="error", message="Unsupported channel"), 400

    try:
        publish_control(node, payload)
        return jsonify(status="success", payload=payload)
    except Exception as exc:
        return jsonify(status="error", message=str(exc)), 500

@app.post("/api/ota")
def ota():
    if not login_required():
        return jsonify(status="error", message="Unauthorized"), 401
    data = request.get_json(silent=True) or {}
    node = str(data.get("node_id", "")).strip()
    filename = secure_filename(str(data.get("filename", "")))
    if not filename or not (FIRMWARE_DIR / filename).exists():
        return jsonify(status="error", message="Firmware file not found"), 404
    host = request.host_url.rstrip("/")
    # Prefer the same scheme the browser used; ESP32 must be able to reach this URL.
    scheme = request.headers.get("X-Forwarded-Proto", request.scheme)
    base = f"{scheme}://{request.host}"
    firmware_url = f"{base}{url_for('serve_firmware', filename=quote(filename))}"
    targets = load_json(NODES_FILE, []) if node == "ALL_ONLINE" else [node]
    sent = 0
    for target in targets:
        try:
            publish_control(target, {"action": "OTA_UPDATE", "firmware_url": firmware_url})
            sent += 1
        except Exception as exc:
            add_event("error", target, f"OTA command failed: {exc}")
    return jsonify(status="success", message=f"OTA sent to {sent} device(s)", url=firmware_url)

@app.get("/firmware/<path:filename>")
def serve_firmware(filename):
    return send_from_directory(FIRMWARE_DIR, filename, as_attachment=False)

@app.get("/api/data")
def api_data():
    if not login_required():
        return jsonify(status="error", message="Unauthorized"), 401
    nodes = load_json(NODES_FILE, [])
    telemetry = load_json(TELEMETRY_FILE, {})
    now = int(time.time())
    # MQTT status messages do not necessarily persist forever; mark stale devices offline.
    stale_after = 150
    online = []
    for node in nodes:
        last_seen = telemetry.get(node, {}).get("last_seen", now)
        if now - last_seen <= stale_after:
            online.append(node)
    return jsonify({
        "nodes": online,
        "all_nodes": nodes,
        "telemetry": telemetry,
        "logs": live_logs[-100:],
        "events": load_json(EVENTS_FILE, [])[-100:],
        "firmware": sorted([p.name for p in FIRMWARE_DIR.iterdir() if p.is_file()]),
        "meta": load_json(META_FILE, {}),
        "server_time": now,
    })

@app.get("/api/firmware")
def firmware():
    if not login_required():
        return jsonify(status="error", message="Unauthorized"), 401
    return jsonify(files=sorted([p.name for p in FIRMWARE_DIR.iterdir() if p.is_file()]))

@app.post("/api/meta")
def meta():
    if not login_required():
        return jsonify(status="error", message="Unauthorized"), 401
    data = request.get_json(silent=True) or {}
    node = str(data.pop("node_id", "")).strip()
    if not node:
        return jsonify(status="error", message="node_id required"), 400
    current = load_json(META_FILE, {})
    current[node] = {**current.get(node, {}), **data}
    save_json(META_FILE, current)
    add_event("meta", node, "Device metadata updated", data)
    return jsonify(status="success", meta=current[node])

@app.post("/api/local/state")
def local_state():
    if not login_required():
        return jsonify(status="error", message="Unauthorized"), 401
    data = request.get_json(silent=True) or {}
    ip = str(data.get("ip", "")).strip()
    if not ip:
        return jsonify(status="error", message="IP required"), 400
    import requests
    try:
        r = requests.get(f"http://{ip}/state", timeout=2)
        return jsonify(status="success", data=r.json())
    except Exception as exc:
        return jsonify(status="error", message=str(exc)), 502

@app.post("/api/local/control")
def local_control():
    if not login_required():
        return jsonify(status="error", message="Unauthorized"), 401
    data = request.get_json(silent=True) or {}
    ip = str(data.get("ip", "")).strip()
    path = str(data.get("path", "")).strip()
    if not ip or path != "/control":
        return jsonify(status="error", message="ip and path=/control required"), 400
    import requests
    params = data.get("params", {})
    try:
        r = requests.get(f"http://{ip}/control", params=params, timeout=2)
        return jsonify(status="success", data=r.json() if r.headers.get("content-type","").startswith("application/json") else r.text)
    except Exception as exc:
        return jsonify(status="error", message=str(exc)), 502

@app.get("/api/export.csv")
def export_csv():
    if not login_required():
        return "Unauthorized", 401
    telemetry = load_json(TELEMETRY_FILE, {})
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Node ID", "Firmware", "Boot Count", "Crash Count", "RSSI", "Ch1 Hrs", "Ch2 Hrs", "Ch3 Hrs", "Ch4 Hrs", "Fan Hrs", "Total Toggles"])
    for node, data in telemetry.items():
        channels = data.get("channels", {})
        writer.writerow([
            node, data.get("fw_version", "N/A"), data.get("boot_count", 0),
            data.get("crash_count", 0), data.get("rssi", 0),
            channels.get("1", {}).get("on_hours", 0),
            channels.get("2", {}).get("on_hours", 0),
            channels.get("3", {}).get("on_hours", 0),
            channels.get("4", {}).get("on_hours", 0),
            channels.get("5", {}).get("on_hours", 0),
            sum(int(channels.get(str(i), {}).get("toggles", 0)) for i in range(1, 6)),
        ])
    return app.response_class(out.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=GoSmart_Fleet_Report.csv"})

@app.route("/health")
def health():
    return jsonify(ok=True, mqtt=mqtt_client.is_connected())

if __name__ == "__main__":
    app.run(host=os.getenv("HOST", "0.0.0.0"), port=int(os.getenv("PORT", "5000")), debug=False)
