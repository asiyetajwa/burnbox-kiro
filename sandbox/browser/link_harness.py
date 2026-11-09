"""Burn Box link harness: runs inside the link box.

Visits BB_URL in headless Chromium, records every request the page makes, screenshots it, and, if
the page asks for a login, types fake (canary) details and traces where the form sends them.
Nothing real is ever typed. Sites outside the lab can only be read: every request that would send
data out (POST, PUT, form submits, uploads) and every download is stopped and logged.
"""
import base64
import glob
import json
import os
import sys
import time
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, Error as PWError

MARKER = "===BURNBOX-REPORT==="
LAB_SUFFIX = ".lab.test"


def emit(ev):
    sys.stdout.write("BB-EVENT " + json.dumps(ev) + "\n")
    sys.stdout.flush()


def ts():
    t = time.time()
    return time.strftime("%H:%M:%S", time.gmtime(t)) + f".{int((t % 1) * 1e6):06d}"


def host_of(url):
    try:
        return (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""


def is_lab(url):
    h = host_of(url)
    return h.endswith(LAB_SUFFIX)


def chromium_path():
    for p in ["/usr/lib/chromium/chromium-headless-shell", "/usr/lib/chromium/headless_shell", "/usr/lib/chromium/chromium-headless-shell", "/usr/bin/chromium-headless-shell", *glob.glob("/usr/lib/chromium*/headless_shell")]:
        if os.path.exists(p):
            return p
    return None


def main():
    url = os.environ.get("BB_URL", "")
    timeout = float(os.environ.get("BB_TIMEOUT", "30"))
    proxy = os.environ.get("BB_PROXY", "")
    can = json.loads(os.environ.get("BB_CANARIES", "{}"))
    user = f"canary.{can.get('password', 'x')[:6].lower()}@burnbox.test"
    password = can.get("password", "burnbox-canary")
    deadline = time.time() + timeout

    report = {"kind": "link", "url": url, "executed": False, "requests": [], "posts": [], "pages": [], "events": [],
              "canaries": {}, "blocked": [], "fs": {"added": [], "removed": [], "changed": []}}
    events = report["events"]

    def ev(e):
        e.setdefault("ts", ts())
        events.append(e)
        emit(e)

    emit({"type": "stage", "stage": "canaries", "planted": ["login"]})
    ev({"type": "stage", "stage": "detonate", "url": url})
    page_host = host_of(url)

    with sync_playwright() as pw:
        launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--disable-extensions"]}
        exe = chromium_path()
        if exe:
            launch["executable_path"] = exe
        if proxy and not is_lab(url):
            launch["proxy"] = {"server": proxy, "bypass": f"*{LAB_SUFFIX}"}
        browser = pw.chromium.launch(**launch)
        ctx = browser.new_context(viewport={"width": 900, "height": 620}, accept_downloads=False,
                                  user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36")
        page = ctx.new_page()
        typed = {"done": False}

        def on_route(route):
            req = route.request
            rec = {"method": req.method, "url": req.url[:300], "type": req.resource_type}
            report["requests"].append(rec)
            body = req.post_data or ""
            lab = is_lab(req.url)
            carries = typed["done"] and (user in body or password in body or user.replace("@", "%40") in body)
            if carries:
                to = host_of(req.url)
                post = {"to": to, "from": page_host, "crossSite": to != page_host, "url": req.url[:300], "method": req.method, "delivered": lab}
                report["posts"].append(post)
                ev({"type": "post", **post})
            if req.method not in ("GET", "HEAD", "OPTIONS") and not lab:
                report["blocked"].append(rec)
                ev({"type": "egress", "host": host_of(req.url), "port": 443 if req.url.startswith("https") else 80, "blocked": True, "call": req.method})
                return route.abort("blockedbyclient")
            if not lab:
                ev({"type": "egress", "host": host_of(req.url), "port": 443 if req.url.startswith("https") else 80, "blocked": False, "call": req.method, "through": "gate"})
            return route.continue_()

        page.route("**/*", on_route)
        try:
            page.route_web_socket("**/*", lambda ws: (ev({"type": "egress", "host": host_of(ws.url), "port": 443, "blocked": True, "call": "websocket"}), ws.close()))
        except (AttributeError, PWError):
            pass
        page.on("requestfailed", lambda r: (not is_lab(r.url)) and r.failure and "ERR_NAME_NOT_RESOLVED" in (r.failure or "") and ev({"type": "lookup", "host": host_of(r.url)}))
        page.on("download", lambda d: ev({"type": "write_denied", "path": f"download: {d.suggested_filename}"}))

        report["executed"] = True
        t0 = time.time()
        try:
            page.goto(url, wait_until="load", timeout=min(15000, max(3000, (deadline - time.time()) * 1000)))
            title = page.title()[:120]
            report["pages"].append(page.url[:300])
            report["title"] = title
            shot = page.screenshot(type="jpeg", quality=60)
            report["screenshot"] = "data:image/jpeg;base64," + base64.b64encode(shot).decode()
            ev({"type": "page", "url": page.url[:300], "title": title})
            emit({"type": "screenshot", "data": report["screenshot"]})

            pw_input = page.query_selector("input[type=password]")
            if pw_input:
                form = page.evaluate("""() => { const p = document.querySelector('input[type=password]'); const f = p.form;
                    return { fields: f ? f.querySelectorAll('input:not([type=hidden])').length : 1, action: f ? (f.action || location.href) : location.href }; }""")
                ev({"type": "form", "fields": form["fields"], "action": host_of(form["action"]) or form["action"][:120]})
                user_sel = "input[type=email], input[name*=user i], input[name*=email i], input[name*=login i], input[type=text]"
                u = page.query_selector(user_sel)
                if u:
                    u.fill(user)
                pw_input.fill(password)
                typed["done"] = True
                report["canaries"]["login"] = {"canary": "login", "user": user, "ts": ts()}
                ev({"type": "typed", "user": user})
                ev({"type": "canary", "canary": "login", "value": user, "path": user})
                try:
                    with page.expect_navigation(timeout=6000):
                        btn = page.query_selector("button[type=submit], input[type=submit], form button")
                        if btn:
                            btn.click()
                        else:
                            pw_input.press("Enter")
                except PWError:
                    pass
                page.wait_for_timeout(800)
                if page.url[:300] not in report["pages"]:
                    report["pages"].append(page.url[:300])
                    ev({"type": "page", "url": page.url[:300], "title": page.title()[:120]})
        except PWError as e:
            report["error"] = str(e).splitlines()[0][:300]
            ev({"type": "note", "message": f"The page did not finish loading: {report['error']}"})
        report["duration"] = round(time.time() - t0, 2)
        report["final_url"] = page.url[:300]
        ctx.close()
        browser.close()

    sys.stdout.write("\n" + MARKER + "\n" + json.dumps(report) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
