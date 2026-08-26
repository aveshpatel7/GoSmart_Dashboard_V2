# Go Smart Dashboard V2

A Flask + MQTT fleet dashboard designed around the existing Go Smart ESP32 firmware.
**ESP32 firmware is not modified by this project.**

## Features
- Fleet overview and device health
- Live MQTT status/telemetry/logs
- Relay 1-4 control
- Fan OFF / speed 1-4
- All ON / All OFF
- Local HTTP `/state` and `/control` support
- OTA firmware upload and OTA command
- OTA status/progress
- Firmware library
- Device search/filter
- Runtime/toggle/RSSI/boot/crash analytics
- Alerts
- Device activity log
- CSV export
- Browser WebSerial firmware flashing UI
- Rooms/groups metadata stored by dashboard

## Important firmware compatibility
The dashboard sends the command shapes already supported by the firmware:
- `{"channel": 1..4, "status": "ON"/"OFF"}`
- `{"channel": 5, "speed": 0..4}`
- `{"channel": 6, "status": "ON"}` for ALL ON
- `{"channel": 7, "status": "OFF"}` for ALL OFF
- `{"action": "OTA_UPDATE", "firmware_url": "..."}`
- local HTTP GET `/state`
- local HTTP GET `/control?...`

## Setup in VS Code

1. Create a virtual environment:
   `python -m venv .venv`
2. Activate it.
3. Install:
   `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and fill credentials.
5. Run:
   `python app.py`
6. Open:
   `http://localhost:5000`

## GitHub

Do NOT commit `.env`, passwords, or firmware binaries. The included `.gitignore` protects them.

## Production note
This is a dashboard foundation, not a hardened internet-facing production deployment. Use HTTPS, a proper WSGI server, strong credentials, CSRF protection, a database, and secret management before exposing it publicly.
