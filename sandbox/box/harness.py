"""Burn Box harness: runs inside the detonation box.

Reads the sample from stdin, plants canary secrets, runs the sample under strace with a process
sampler beside it, diffs the writable folders, and prints one JSON report after a marker line.
Settings come from environment variables set by the host:
  BB_NAME       the sample's file name
  BB_CANARIES   JSON {"aws_key_id", "aws_secret", "wallet_seed", "password"}
  BB_TIMEOUT    wall-clock seconds for the sample (the host also enforces its own limit)
"""
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import threading
import time
import zipfile

MARKER = "===BURNBOX-REPORT==="
HOME = "/home/sandbox"
WORK = "/work"
TRACE_DIR = "/tmp/.bb"
WATCHED = [WORK, HOME, "/tmp"]
MAX_OUT = 8000

CANARY_FILES = {
    "cloud_key": f"{HOME}/.aws/credentials",
    "wallet": f"{HOME}/wallet/keystore.json",
    "password": f"{HOME}/.config/passwords.txt",
}


def now():
    return time.time()


def safe_name(name):
    name = os.path.basename(name or "sample")
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)[:80]
    return name or "sample"


def plant_canaries(values):
    os.makedirs(f"{HOME}/.aws", exist_ok=True)
    os.makedirs(f"{HOME}/wallet", exist_ok=True)
    os.makedirs(f"{HOME}/.config", exist_ok=True)
    with open(CANARY_FILES["cloud_key"], "w") as f:
        f.write(f"[default]\naws_access_key_id = {values['aws_key_id']}\naws_secret_access_key = {values['aws_secret']}\n")
    with open(CANARY_FILES["wallet"], "w") as f:
        json.dump({"version": 3, "seed": values["wallet_seed"], "note": "main wallet"}, f)
    with open(CANARY_FILES["password"], "w") as f:
        f.write(f"bank: {values['password']}\nemail: {values['password']}!\n")


def snapshot():
    out = {}
    for root in WATCHED:
        for d, dirs, files in os.walk(root):
            if d.startswith(TRACE_DIR):
                dirs[:] = []
                continue
            for fn in files:
                p = os.path.join(d, fn)
                try:
                    st = os.lstat(p)
                    if not stat.S_ISREG(st.st_mode):
                        continue
                    h = hashlib.sha256()
                    with open(p, "rb") as f:
                        h.update(f.read(1 << 20))
                    out[p] = [st.st_size, h.hexdigest()[:16]]
                except OSError:
                    pass
    return out


def diff(before, after):
    added = sorted(p for p in after if p not in before)
    removed = sorted(p for p in before if p not in after)
    changed = sorted(p for p in after if p in before and after[p] != before[p])
    return {"added": added, "removed": removed, "changed": changed}


def kind_of(path, data):
    head = data[:8]
    low = path.lower()
    if head.startswith(b"\x7fELF"):
        return "elf"
    if head.startswith(b"#!"):
        line = data.split(b"\n", 1)[0]
        return "python" if b"python" in line else "shell"
    if low.endswith(".py"):
        return "python"
    if low.endswith((".sh", ".bash")):
        return "shell"
    if head.startswith(b"PK"):
        return "zip"
    if head.startswith(b"\xd0\xcf\x11\xe0"):
        return "ole"
    if head.startswith(b"%PDF"):
        return "pdf"
    return "data"


INDICATORS = [
    (rb"https?://[^\s'\"<>]{4,120}", "url"),
    (rb"(?i)powershell|cmd\.exe|wscript|mshta", "shell launcher"),
    (rb"(?i)AutoOpen|Document_Open|Workbook_Open", "macro runs on open"),
    (rb"(?i)/JavaScript|/OpenAction|/Launch", "pdf active content"),
    (rb"(?i)CreateObject|Shell\(|WScript\.Shell", "macro shell call"),
]


def static_triage(data):
    found = []
    for rx, label in INDICATORS:
        for m in re.finditer(rx, data[: 4 << 20]):
            found.append({"what": label, "text": m.group(0)[:120].decode("latin-1")})
            if len(found) > 30:
                return found
    return found


def zip_triage(path):
    notes = []
    try:
        with zipfile.ZipFile(path) as z:
            for n in z.namelist()[:200]:
                notes.append(n)
    except zipfile.BadZipFile:
        pass
    return notes


class Sampler(threading.Thread):
    """Lists every process in the box every 100 ms, so short-lived children are caught too."""

    def __init__(self):
        super().__init__(daemon=True)
        self.seen = {}
        self.stop = threading.Event()
        self.me = os.getpid()

    def run(self):
        while not self.stop.is_set():
            for pid in os.listdir("/proc"):
                if not pid.isdigit() or int(pid) == self.me or pid in self.seen:
                    continue
                try:
                    with open(f"/proc/{pid}/cmdline", "rb") as f:
                        cmd = f.read().replace(b"\0", b" ").decode("utf-8", "replace").strip()
                except OSError:
                    continue
                if cmd and not cmd.startswith("strace "):
                    self.seen[pid] = {"pid": int(pid), "cmd": cmd[:200], "t": now()}
            time.sleep(0.1)


# strace line: 123 12:00:00.123456 openat(AT_FDCWD, "/x", O_RDONLY) = -1 ENOENT (No such file or directory)
LINE = re.compile(r"^(\d+)\s+(\d\d:\d\d:\d\d\.\d+)\s+(\w+)\((.*)\)\s+=\s+(-?\d+|\?)\s*(\w+)?")
ADDR4 = re.compile(r'sin_port=htons\((\d+)\).*?sin_addr=inet_addr\("([\d.]+)"\)')
ADDR6 = re.compile(r'sin6_port=htons\((\d+)\).*?inet_pton\(AF_INET6, "([0-9a-f:.]+)"')
FIRST_STR = re.compile(r'"((?:[^"\\]|\\.)*)"')
WRITE_FLAGS = ("O_WRONLY", "O_RDWR", "O_CREAT", "O_TRUNC")
PY_NOISE = re.compile(r"^/usr/(local/)?lib/|^/usr/(local/)?(bin|share)/|^/etc/(ld\.so|localtime|nsswitch|host\.conf|gai\.conf)|^/proc/|^/sys/|^/dev/|^/opt/burnbox/|^/tmp/\.bb/|\.pyc$|__pycache__")


def unescape(s):
    try:
        return bytes(s, "latin-1").decode("unicode_escape").encode("latin-1")
    except Exception:
        return s.encode("latin-1", "replace")


def dns_name(payload):
    """Decode the question name from a DNS query strace printed as an escaped string."""
    b = unescape(payload)
    if len(b) < 13:
        return None
    i, parts = 12, []
    while i < len(b) and b[i] != 0 and len(parts) < 20:
        n = b[i]
        parts.append(b[i + 1:i + 1 + n].decode("ascii", "replace"))
        i += 1 + n
    return ".".join(parts) or None


class TraceParser:
    """Turns strace lines into Burn Box events. Fed line by line while the sample runs."""

    def __init__(self, canary_paths):
        self.rev = {v: k for k, v in canary_paths.items()}
        self.events = []
        self.canaries = {}

    def feed(self, raw):
        m = LINE.match(raw)
        if not m:
            return None
        pid, ts, call, args, ret, err = m.groups()
        pid = int(pid)
        failed = ret == "-1"
        s = FIRST_STR.search(args)
        p = s.group(1) if s else ""
        ev = None
        if call == "execve":
            if "/opt/burnbox/" in p:
                return None
            argv = re.findall(r'"((?:[^"\\]|\\.)*)"', args)[1:6]
            ev = {"type": "exec", "pid": pid, "ts": ts, "path": p, "argv": argv, "ok": not failed, "err": err}
        elif call in ("open", "openat", "creat"):
            ap = p if p.startswith("/") else os.path.normpath(os.path.join(WORK, p))
            if ap in self.rev:
                c = self.rev[ap]
                if c in self.canaries:
                    return None
                self.canaries[c] = {"canary": c, "path": ap, "ts": ts, "pid": pid}
                ev = {"type": "canary", "pid": pid, "ts": ts, "canary": c, "path": ap}
            else:
                writing = call == "creat" or any(f in args for f in WRITE_FLAGS)
                if writing and failed:
                    ev = {"type": "write_denied", "pid": pid, "ts": ts, "path": ap, "err": err}
                elif writing and not PY_NOISE.search(ap):
                    ev = {"type": "write", "pid": pid, "ts": ts, "path": ap, "ok": not failed}
                elif failed and err in ("EACCES", "EPERM") and not PY_NOISE.search(ap):
                    ev = {"type": "read_denied", "pid": pid, "ts": ts, "path": ap, "err": err}
        elif call in ("unlink", "unlinkat", "rmdir", "rename", "renameat", "renameat2"):
            ap = p if p.startswith("/") else os.path.normpath(os.path.join(WORK, p))
            ev = {"type": "delete_denied" if failed else "delete", "pid": pid, "ts": ts, "path": ap, "call": call, "err": err}
        elif call in ("connect", "sendto"):
            a4, a6 = ADDR4.search(args), ADDR6.search(args)
            if not (a4 or a6):
                return None
            port, host = (a4 or a6).groups()
            ev = {"type": "egress", "pid": pid, "ts": ts, "host": host, "port": int(port), "call": call, "blocked": failed, "err": err}
            if int(port) == 53 and call == "sendto" and s:
                ev["dns"] = dns_name(s.group(1))
        if ev:
            self.events.append(ev)
        return ev


def emit(ev):
    """Live event for the host, one JSON object per line on the harness's own stdout."""
    sys.stdout.write("BB-EVENT " + json.dumps(ev) + "\n")
    sys.stdout.flush()


IP_RE = re.compile(r"^[\d.]+$|:")


class LookupParser:
    """Reads the Python audit log and reports the host names a sample looks up."""

    def __init__(self):
        self.events = []

    def feed(self, line):
        try:
            a = json.loads(line)
        except ValueError:
            return None
        if a.get("event") not in ("socket.getaddrinfo", "socket.gethostbyname"):
            return None
        host = (a.get("args") or ["''"])[0].strip("'\"")
        if not host or IP_RE.search(host) or host in ("localhost",):
            return None
        ev = {"type": "lookup", "host": host[:120], "ts": time.strftime("%H:%M:%S", time.gmtime(a.get("t", now()))) + f".{int((a.get('t', 0) % 1) * 1e6):06d}"}
        self.events.append(ev)
        return ev


class Tailer(threading.Thread):
    """Follows the strace output file while the sample runs and emits each event as it lands."""

    def __init__(self, path, feed):
        super().__init__(daemon=True)
        self.path, self.feed = path, feed
        self.stop = threading.Event()
        self.pos = 0
        self.buf = ""

    def drain(self):
        try:
            with open(self.path, encoding="utf-8", errors="replace") as f:
                f.seek(self.pos)
                chunk = f.read()
                self.pos = f.tell()
        except OSError:
            return
        self.buf += chunk
        *lines, self.buf = self.buf.split("\n")
        for line in lines:
            ev = self.feed(line)
            if ev:
                emit(ev)

    def run(self):
        while not self.stop.is_set():
            self.drain()
            time.sleep(0.05)
        self.drain()
        if self.buf:
            ev = self.feed(self.buf)
            if ev:
                emit(ev)


def read_audit():
    out = []
    try:
        with open(f"{TRACE_DIR}/audit.jsonl") as f:
            for line in f:
                try:
                    out.append(json.loads(line))
                except ValueError:
                    pass
    except OSError:
        pass
    return out


def main():
    started = now()
    name = safe_name(os.environ.get("BB_NAME"))
    timeout = float(os.environ.get("BB_TIMEOUT", "20"))
    canary_values = json.loads(os.environ.get("BB_CANARIES", "{}"))
    data = sys.stdin.buffer.read()
    os.makedirs(TRACE_DIR, mode=0o700, exist_ok=True)
    sample = os.path.join(WORK, name)
    with open(sample, "wb") as f:
        f.write(data)
    os.chmod(sample, 0o755)
    plant_canaries(canary_values)
    emit({"type": "stage", "stage": "canaries", "planted": list(CANARY_FILES)})

    if os.environ.get("BB_MODE") == "email":
        sys.path.insert(0, "/opt/burnbox")
        from email_reader import read_email
        emit({"type": "stage", "stage": "detonate", "cmd": f"open email {name}"})
        report = read_email(data, emit)
        report.update({"name": name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest(), "finished": now()})
        sys.stdout.write("\n" + MARKER + "\n" + json.dumps(report) + "\n")
        sys.stdout.flush()
        return

    kind = kind_of(name, data)
    report = {
        "name": name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest(), "kind": kind,
        "executed": False, "started": started, "canary_paths": CANARY_FILES, "uid": os.getuid(),
    }
    if kind == "python":
        cmd = ["python3", sample]
    elif kind == "shell":
        cmd = ["sh", sample]
    elif kind == "elf":
        cmd = [sample]
    else:
        cmd = None

    report["indicators"] = static_triage(data)
    if kind == "zip":
        report["archive"] = zip_triage(sample)
        if any(n.endswith("vbaProject.bin") for n in report["archive"]):
            report["indicators"].append({"what": "office macros", "text": "vbaProject.bin"})

    before = snapshot()
    if cmd:
        sampler = Sampler()
        sampler.start()
        trace_file = f"{TRACE_DIR}/trace"
        env = {"HOME": HOME, "PATH": "/usr/local/bin:/usr/bin:/bin", "PYTHONPATH": "/opt/burnbox/hook",
               "PYTHONDONTWRITEBYTECODE": "1", "BURNBOX_SANDBOX": "1", "LANG": "C.UTF-8", "USER": "sandbox"}
        st = ["strace", "-f", "-tt", "-qq", "-s", "160", "-o", trace_file,
              "-e", "trace=execve,open,openat,creat,unlink,unlinkat,rmdir,rename,renameat,renameat2,connect,sendto",
              *cmd]
        parser = TraceParser(CANARY_FILES)
        open(trace_file, "w").close()
        tailer = Tailer(trace_file, parser.feed)
        tailer.start()
        lookups = LookupParser()
        open(f"{TRACE_DIR}/audit.jsonl", "w").close()
        ltail = Tailer(f"{TRACE_DIR}/audit.jsonl", lookups.feed)
        ltail.start()
        emit({"type": "stage", "stage": "detonate", "cmd": " ".join(cmd).replace(WORK + "/", "")})
        t0 = now()
        try:
            p = subprocess.run(st, cwd=WORK, env=env, stdin=subprocess.DEVNULL, capture_output=True, timeout=timeout)
            report["exit"] = p.returncode
            out, err = p.stdout, p.stderr
            report["timed_out"] = False
        except subprocess.TimeoutExpired as e:
            report["exit"] = None
            report["timed_out"] = True
            out, err = e.stdout or b"", e.stderr or b""
        report["duration"] = round(now() - t0, 2)
        sampler.stop.set()
        sampler.join(1)
        tailer.stop.set()
        ltail.stop.set()
        tailer.join(2)
        ltail.join(2)
        report["executed"] = True
        report["stdout"] = out[:MAX_OUT].decode("utf-8", "replace")
        report["stderr"] = err[:MAX_OUT].decode("utf-8", "replace")
        report["processes"] = sorted(sampler.seen.values(), key=lambda x: x["t"])
        for line in report["stdout"].splitlines()[:20]:
            emit({"type": "stdout", "text": line[:200]})
        report["events"] = sorted(parser.events + lookups.events, key=lambda e: e["ts"])
        report["canaries"] = parser.canaries
        report["audit"] = read_audit()[:200]
    else:
        report["note"] = f"Not executed: a {kind} file has nothing the box can run. Static checks only."
        report["events"], report["canaries"], report["processes"] = [], {}, []
    report["fs"] = diff(before, snapshot())
    report["fs"]["added"] = [p for p in report["fs"]["added"] if not p.startswith(TRACE_DIR)]
    report["finished"] = now()
    sys.stdout.write("\n" + MARKER + "\n" + json.dumps(report) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
