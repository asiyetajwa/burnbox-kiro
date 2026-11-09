# Loaded into every Python process the sample starts (PYTHONPATH points here).
# It records the names a Python sample looks up and the calls it makes; strace sees only addresses.
import json
import sys
import time

_LOG = "/tmp/.bb/audit.jsonl"
_WATCH = {"socket.getaddrinfo", "socket.gethostbyname", "socket.gethostbyaddr", "socket.connect", "urllib.Request", "http.client.connect",
          "subprocess.Popen", "os.system", "os.remove", "os.rename", "shutil.rmtree", "os.exec"}


def _hook(event, args):
    if event not in _WATCH:
        return
    try:
        with open(_LOG, "a") as f:
            f.write(json.dumps({"t": time.time(), "event": event, "args": [repr(a)[:200] for a in args]}) + "\n")
    except Exception:
        pass


sys.addaudithook(_hook)
