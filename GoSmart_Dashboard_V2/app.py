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

app = Flask(__name__, template_folder="app/templates", static_folder="app/static")
app.secret_key = os.getenv("FLASK_SECRET_KEY", "change-me-in-production")

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "change-me")

# Keep the working test MQTT configuration exactly on the dashboard side.
MQTT_BROKER = "i26a1c71.ala.asia-southeast1.emqxsl.com"
MQTT_PORT = 8883
MQTT_USER = "smartnest_client"
MQTT_PASS = "D2m9ga8JynJDEM6"

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


def update_node(node_id, online=True):
    if not node_id:
        return
    nodes = set(load_json(NODES_FILE, []))
    # active_nodes.json is a discovery registry. Offline devices remain known.
    if online is not None:
        nodes.add(node_id)
    save_json(NODES_FILE, sorted(nodes))


def ensure_record(telemetry, node_id):
    rec = telemetry.setdefault(node_id, {})
    if not isinstance(rec.get("channels"), dict):
        rec["channels"] = {}
    return rec


def merge_status(node_id, data):
    """Merge the ESP32 retained /status payload without destroying usage telemetry."""
    telemetry = load_json(TELEMETRY_FILE, {})
    rec = ensure_record(telemetry, node_id)
    now = int(time.time())

    for key in ("fw_version", "version", "rssi", "uptime", "local_ip", "name", "device_name", "node_name"):
        if key in data:
            rec[key] = data[key]

    if "is_online" in data:
        rec["reported_online"] = bool(data.get("is_online"))

    if "channel" in data:
        ch = str(data.get("channel"))
        channel = rec["channels"].setdefault(ch, {})
        status = str(data.get("status", data.get("state", ""))).upper()
        if status in ("ON", "OFF"):
            channel["state"] = status
            channel["status"] = status
        channel["state_updated_at"] = now

        if ch == "5":
            raw_speed = data.get("speed", data.get("value", rec.get("fan_speed_memory", 1)))
            try:
                raw_speed = int(raw_speed)
            except Exception:
                raw_speed = 0
            if raw_speed in (1, 2, 3, 4):
                rec["fan_speed_memory"] = raw_speed
            # Firmware intentionally reports remembered speed even when fan is OFF.
            # Effective dashboard speed must therefore follow status.
            rec["speed"] = 0 if status == "OFF" else max(0, min(4, raw_speed))
            rec["fan_power"] = status == "ON"
            channel["speed"] = rec["speed"]

    rec["last_seen"] = now
    save_json(TELEMETRY_FILE, telemetry)
    update_node(node_id, True)


def merge_telemetry(node_id, data):
    """Merge usage telemetry while preserving live state learned from /status."""
    telemetry = load_json(TELEMETRY_FILE, {})
    rec = ensure_record(telemetry, node_id)
    now = int(time.time())
    ch = str(data.get("channel", "0"))
    channel = rec["channels"].setdefault(ch, {})

    if "toggles" in data:
        channel["toggles"] = data.get("toggles", 0)
    if "on_hours" in data:
        channel["on_hours"] = data.get("on_hours", "0.00")
    channel["telemetry_updated_at"] = now

    for key in ("boot_count", "crash_count", "rssi", "fw_version", "version", "uptime", "local_ip", "name", "device_name", "node_name"):
        if key in data:
            rec[key] = data[key]

    rec["last_seen"] = now
    save_json(TELEMETRY_FILE, telemetry)
    update_node(node_id, True)


def on_connect(client, userdata, flags, reason_code, properties=None):
    try:
        ok = int(reason_code) == 0
    except Exception:
        ok = str(reason_code).lower() in ("success", "0")
    if ok:
        client.subscribe([
            ("home/device/+/status", 0),
            ("home/device/+/telemetry", 0),
            ("home/device/+/info", 0),
            ("smartnest/devices/+/ota/status", 0),
            ("smartnest/devices/+/logs", 0),
        ])
        add_event("mqtt", "", "MQTT connected")
    else:
        add_event("error", "", f"MQTT connection failed: {reason_code}")


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
                merge_status(node_id, data)
                add_event("status", node_id, f"Channel {data.get('channel', 'heartbeat')} state", data)
            elif kind == "telemetry":
                merge_telemetry(node_id, data)
                add_event("telemetry", node_id, f"Channel {data.get('channel', '?')} telemetry", data)
            elif kind == "info":
                telemetry = load_json(TELEMETRY_FILE, {})
                rec = ensure_record(telemetry, node_id)
                rec.update(data)
                rec["last_seen"] = int(time.time())
                save_json(TELEMETRY_FILE, telemetry)
                update_node(node_id, True)
                add_event("info", node_id, "Device info received", data)
            return

        if topic.startswith("smartnest/devices/") and len(parts) >= 4:
            node_id = parts[2]
            if "/ota/status" in topic:
                add_event("ota", node_id, f"OTA: {data.get('status', payload)}", data)
            elif topic.endswith("/logs"):
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
    if not mqtt_client.is_connected():
        raise RuntimeError("MQTT is not connected")
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
    if not filename or not filename.lower().endswith(".bin"):
        return jsonify(status="error", message="Select a .bin firmware file"), 400
    file.save(FIRMWARE_DIR / filename)
    add_event("firmware", "", f"Firmware uploaded: {filename}")
    return jsonify(status="success", filename=filename, message=f"{filename} uploaded")


@app.post("/api/device/control")
def device_control():
    if not login_required():
        return jsonify(status="error", message="Unauthorized"), 401
    data = request.get_json(silent=True) or {}
    node = str(data.get("node_id", "")).strip()
    try:
        channel = int(data.get("channel", 0))
    except Exception:
        return jsonify(status="error", message="Invalid channel"), 400

    if not node:
        return jsonify(status="error", message="node_id required"), 400

    payload = {"channel": channel}

    if channel in (1, 2, 3, 4):
        status = str(data.get("status", "")).upper()
        if status not in ("ON", "OFF"):
            return jsonify(status="error", message="status must be ON/OFF"), 400
        payload["status"] = status

    elif channel == 5:
        # ESP32 mqtt_callback requires channel + status/state even for fan speed.
        try:
            speed = int(data.get("speed"))
        except Exception:
            return jsonify(status="error", message="speed must be 0..4"), 400
        if speed not in range(0, 5):
            return jsonify(status="error", message="speed must be 0..4"), 400
        payload["speed"] = speed
        payload["status"] = "OFF" if speed == 0 else "ON"

    elif channel in (6, 7):
        status = str(data.get("status", "ON" if channel == 6 else "OFF")).upper()
        payload["status"] = "ON" if channel == 6 else "OFF"

    else:
        return jsonify(status="error", message="Unsupported channel"), 400

    try:
        publish_control(node, payload)
        return jsonify(status="success", payload=payload)
    except Exception as exc:
        return jsonify(status="error", message=str(exc)), 503


@app.post("/api/ota")
def ota():
    if not login_required():
        return jsonify(status="error", message="Unauthorized"), 401
    data = request.get_json(silent=True) or {}
    node = str(data.get("node_id", "")).strip()
    filename = secure_filename(str(data.get("filename", "")))
    if not filename or not (FIRMWARE_DIR / filename).exists():
        return jsonify(status="error", message="Firmware file not found"), 404
    scheme = request.headers.get("X-Forwarded-Proto", request.scheme)
    base = f"{scheme}://{request.host}"
    firmware_url = f"{base}{url_for('serve_firmware', filename=quote(filename))}"
    targets = get_online_nodes() if node == "ALL_ONLINE" else [node]
    sent = 0
    failed = []
    for target in targets:
        try:
            publish_control(target, {"action": "OTA_UPDATE", "firmware_url": firmware_url})
            sent += 1
        except Exception as exc:
            failed.append(target)
            add_event("error", target, f"OTA command failed: {exc}")
    if failed and sent == 0:
        return jsonify(status="error", message="OTA command could not be sent", failed=failed), 503
    return jsonify(status="success", message=f"OTA sent to {sent} device(s)", failed=failed, url=firmware_url)


@app.get("/firmware/<path:filename>")
def serve_firmware(filename):
    return send_from_directory(FIRMWARE_DIR, filename, as_attachment=False)


def get_online_nodes():
    telemetry = load_json(TELEMETRY_FILE, {})
    now = int(time.time())
    online = []
    # ESP32 heartbeat is every 60 seconds; 150 seconds allows one missed heartbeat.
    for node, rec in telemetry.items():
        last_seen = int(rec.get("last_seen", 0) or 0)
        if last_seen and now - last_seen <= 150 and rec.get("reported_online", True) is not False:
            online.append(node)
    return sorted(online)


@app.get("/api/data")
def api_data():
    if not login_required():
        return jsonify(status="error", message="Unauthorized"), 401

    registry = load_json(NODES_FILE, [])
    telemetry = load_json(TELEMETRY_FILE, {})
    meta = load_json(META_FILE, {})
    online = get_online_nodes()
    all_nodes = sorted(set(registry) | set(telemetry.keys()) | set(meta.keys()))
    devices = {}

    for node in all_nodes:
        record = dict(telemetry.get(node, {}))
        m = meta.get(node, {})
        display_name = m.get("name") or m.get("device_name") or record.get("name") or record.get("device_name") or record.get("node_name") or node
        devices[node] = {
            "node_id": node,
            "name": display_name,
            "online": node in online,
            "last_seen": record.get("last_seen", 0),
            "firmware": record.get("fw_version", record.get("version", "Unknown")),
            "rssi": record.get("rssi", 0),
            "uptime": record.get("uptime", 0),
            "local_ip": record.get("local_ip", ""),
            "boot_count": record.get("boot_count", 0),
            "crash_count": record.get("crash_count", 0),
            "telemetry": record,
            "meta": m,
        }

    return jsonify({
        "nodes": online,
        "all_nodes": all_nodes,
        "devices": devices,
        "telemetry": telemetry,
        "logs": live_logs[-100:],
        "events": load_json(EVENTS_FILE, [])[-100:],
        "firmware": sorted([p.name for p in FIRMWARE_DIR.iterdir() if p.is_file()]),
        "meta": meta,
        "server_time": int(time.time()),
        "mqtt_connected": mqtt_client.is_connected(),
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
        r.raise_for_status()
        return jsonify(status="success", data=r.json())
    except Exception as exc:
        return jsonify(status="error", message=str(exc)), 502


@app.post("/api/local/control")
def local_control():
    if not login_required():
        return jsonify(status="error", message="Unauthorized"), 401
    data = request.get_json(silent=True) or {}
    ip = str(data.get("ip", "")).strip()
    params = dict(data.get("params") or {})
    if not ip:
        return jsonify(status="error", message="IP required"), 400
    # ESP32 local endpoint requires channel + state/status. Match the MQTT rules.
    if "channel" in params:
        try:
            ch = int(params["channel"])
            if ch == 5 and "speed" in params and "status" not in params and "state" not in params:
                params["status"] = "OFF" if int(params["speed"]) == 0 else "ON"
        except Exception:
            pass
    import requests
    try:
        r = requests.get(f"http://{ip}/control", params=params, timeout=2)
        r.raise_for_status()
        ctype = r.headers.get("content-type", "")
        return jsonify(status="success", data=r.json() if ctype.startswith("application/json") else r.text)
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
            node, data.get("fw_version", data.get("version", "N/A")), data.get("boot_count", 0), data.get("crash_count", 0), data.get("rssi", 0),
            channels.get("1", {}).get("on_hours", 0), channels.get("2", {}).get("on_hours", 0), channels.get("3", {}).get("on_hours", 0),
            channels.get("4", {}).get("on_hours", 0), channels.get("5", {}).get("on_hours", 0),
            sum(int(channels.get(str(i), {}).get("toggles", 0)) for i in range(1, 6)),
        ])
    return app.response_class(out.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=GoSmart_Fleet_Report.csv"})


@app.get("/health")
def health_route():
    return jsonify(ok=True, mqtt=mqtt_client.is_connected(), devices=len(load_json(TELEMETRY_FILE, {})), online=len(get_online_nodes()))


if __name__ == "__main__":
    app.run(host=os.getenv("HOST", "0.0.0.0"), port=int(os.getenv("PORT", "5000")), debug=False)
