"""The ML service: retrains the win-probability model as matches come in.

    python -m cs2ml.server        # PORT (default 8765), DATABASE_URL

- GET  /health          → {"ok": true, "training": bool, "last": {...}}
- POST /train           → retrain now when there is new data (?force=1: even without)

It also retrains on its own every ML_TRAIN_INTERVAL_S seconds (default 30
minutes) when matches were added. The parse worker pings /train after every
analysis when ML_SERVICE_URL is set; without the service the worker runs
`python -m cs2ml.train --if-new-data` itself (src/lib/winprob/train-trigger.ts).
Standard library only, besides the trainer's own dependencies.
"""
from __future__ import annotations

import json
import os
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from .train import _plain_url, run

DATABASE_URL = _plain_url(os.environ.get("DATABASE_URL", ""))
INTERVAL_S = int(os.environ.get("ML_TRAIN_INTERVAL_S", 1800))

_lock = threading.Lock()
_state: dict = {"training": False, "last": None}


def train_once(force: bool = False) -> dict:
    if not _lock.acquire(blocking=False):
        return {"status": "busy"}
    _state["training"] = True
    try:
        out = run(DATABASE_URL, if_new_data=not force, log=lambda m: print(f"[ml] {m}", flush=True))
        _state["last"] = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **{k: v for k, v in out.items() if k != "evaluation"}}
        return out
    except Exception as err:  # noqa: BLE001 - the service must keep running
        traceback.print_exc()
        _state["last"] = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "status": "error", "error": str(err)}
        return _state["last"]
    finally:
        _state["training"] = False
        _lock.release()


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, body: dict) -> None:
        data = json.dumps(body, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        if urlsplit(self.path).path == "/health":
            self._json(200, {"ok": True, **_state})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        url = urlsplit(self.path)
        if url.path != "/train":
            self._json(404, {"error": "not found"})
            return
        force = parse_qs(url.query).get("force", ["0"])[0] == "1"
        if _state["training"]:
            self._json(202, {"status": "busy"})
            return
        # Answer at once; training can take minutes.
        threading.Thread(target=train_once, kwargs={"force": force}, daemon=True).start()
        self._json(202, {"status": "started"})

    def log_message(self, fmt: str, *args) -> None:  # quieter than the default
        pass


def _loop() -> None:
    while True:
        time.sleep(INTERVAL_S)
        train_once()


def main() -> None:
    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL is not set")
    port = int(os.environ.get("PORT", 8765))
    threading.Thread(target=_loop, daemon=True).start()
    threading.Thread(target=train_once, daemon=True).start()
    print(f"[ml] listening on :{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
