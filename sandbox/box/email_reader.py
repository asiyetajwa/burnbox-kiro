"""Burn Box email reader: opens a suspicious email inside the box, so nothing about it touches a real inbox.

It reads the envelope (who really sent it, whether the sender's domain vouched for it, a reply-to that
points somewhere else, lookalike domains, pressure language, links whose text and target disagree) and
pulls out every link and attachment, so the host can detonate each one in a box of its own.
An email forwarded as an attachment is unwrapped first, so the original message is the one examined.
"""
import base64
import email
import hashlib
import re
from email import policy
from email.utils import getaddresses, parseaddr
from html.parser import HTMLParser
from urllib.parse import urlsplit

BRANDS = ["microsoft.com", "office.com", "outlook.com", "live.com", "google.com", "gmail.com", "apple.com", "icloud.com",
          "amazon.com", "paypal.com", "docusign.net", "dropbox.com", "adobe.com", "intuit.com", "quickbooks.com",
          "stripe.com", "chase.com", "wellsfargo.com", "bankofamerica.com", "dhl.com", "fedex.com", "ups.com", "linkedin.com"]
URGENCY = ["urgent", "overdue", "immediately", "late fee", "final notice", "suspended", "verify your account",
           "within 24 hours", "today", "action required", "unusual activity", "password expires"]
RISKY_EXT = (".exe", ".scr", ".js", ".jse", ".vbs", ".py", ".sh", ".bat", ".cmd", ".ps1", ".hta", ".html", ".htm",
             ".iso", ".img", ".lnk", ".docm", ".xlsm", ".pptm", ".zip", ".rar", ".7z", ".jar", ".msi")
MAX_LINKS = 4
MAX_ATTACH = 4


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self._href, self._text = [], None, []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href:
            self.links.append({"href": self._href.strip(), "text": " ".join("".join(self._text).split())[:200]})
            self._href = None


def domain_of(addr):
    return (addr.rsplit("@", 1)[-1] if "@" in addr else "").lower().strip(">").strip()


def host_of(url):
    try:
        return (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""


SUFFIXES = {"lab.test", "co.uk", "org.uk", "ac.uk", "com.au", "co.nz", "co.za", "com.br", "co.jp", "co.ke", "or.ke", "co.in"}


def base_domain(host):
    """The registrable part: example.com, example.co.uk, or for the demo lab, northwind-payables.lab.test."""
    parts = host.split(".")
    n = 3 if len(parts) >= 3 and ".".join(parts[-2:]) in SUFFIXES else 2
    return ".".join(parts[-n:]) if len(parts) >= n else host


def skeleton(s):
    """Fold the tricks lookalike domains use, so rnicrosoft and rn1crosoft compare equal to microsoft."""
    s = s.lower()
    for a, b in (("rn", "m"), ("vv", "w"), ("0", "o"), ("1", "l"), ("3", "e"), ("5", "s"), ("|", "l"), ("i", "l")):
        s = s.replace(a, b)
    return s


def distance(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def lookalike(domain, against):
    """The trusted domain this one imitates, if any: close, but not the same."""
    d = base_domain(domain)
    name = d.split(".")[0]
    for t in against:
        tb = base_domain(t)
        tn = tb.split(".")[0]
        if not tn or d == tb:
            continue
        if skeleton(name) == skeleton(tn) or (len(tn) >= 5 and distance(name, tn) <= 2) or (len(tn) >= 6 and tn in name and name != tn):
            return tb
    return None


def auth_results(msg):
    """The verdicts the user's own mail provider stamped on the message (we cannot re-check DNS from a sealed box)."""
    text = " ".join(str(v) for v in msg.get_all("Authentication-Results", []) + msg.get_all("ARC-Authentication-Results", []))
    out = {}
    for k in ("spf", "dkim", "dmarc"):
        m = re.search(rf"\b{k}=(\w+)", text, re.I)
        out[k] = m.group(1).lower() if m else None
    if not out["spf"]:
        r = msg.get("Received-SPF")
        if r:
            out["spf"] = str(r).split()[0].lower()
    return out


def unwrap(msg):
    """If the user forwarded the email as an attachment, examine the original inside it."""
    for part in msg.walk():
        if part.get_content_type() == "message/rfc822":
            inner = part.get_payload()
            inner = inner[0] if isinstance(inner, list) and inner else inner
            if isinstance(inner, email.message.Message):
                return inner, str(msg.get("From", ""))
    return msg, None


def read_email(raw, emit):
    outer = email.message_from_bytes(raw, policy=policy.default)
    msg, forwarded_by = unwrap(outer)
    from_name, from_addr = parseaddr(str(msg.get("From", "")))
    reply_to = [a for _, a in getaddresses([str(v) for v in msg.get_all("Reply-To", [])])]
    return_path = parseaddr(str(msg.get("Return-Path", "")))[1]
    subject = str(msg.get("Subject", ""))[:200]
    sender_domain = domain_of(from_addr)
    emit({"type": "envelope", "from": f"{from_name} <{from_addr}>".strip(), "subject": subject, "forwardedBy": forwarded_by})

    findings = []

    def find(what, detail, severity):
        f = {"type": "finding", "what": what, "detail": detail, "severity": severity}
        findings.append(f)
        emit(f)

    auth = auth_results(msg)
    failed = [k.upper() for k, v in auth.items() if v in ("fail", "softfail", "none", "permerror", "temperror")]
    if failed:
        find("Sender not vouched for", f"{', '.join(failed)} did not pass for {sender_domain or 'the sender'}", "high" if "DMARC" in failed else "medium")
    elif all(v is None for v in auth.values()):
        find("No sender checks recorded", "The message carries no SPF, DKIM or DMARC results", "low")
    else:
        find("Sender checks passed", f"SPF {auth['spf']}, DKIM {auth['dkim']}, DMARC {auth['dmarc']}", "ok")

    for r in reply_to:
        rd = domain_of(r)
        if rd and rd != sender_domain:
            near = lookalike(rd, [sender_domain]) if sender_domain else None
            find("Replies go somewhere else", f"Reply-To is {r}{', a lookalike of ' + sender_domain if near else ''}", "high" if near else "medium")
    if return_path and sender_domain and domain_of(return_path) and base_domain(domain_of(return_path)) != base_domain(sender_domain):
        find("Bounce address differs", f"Return-Path is {return_path}", "low")

    brand = lookalike(sender_domain, BRANDS) if sender_domain else None
    if brand:
        find("Lookalike sender", f"{sender_domain} imitates {brand}", "high")
    claimed = next((b for b in BRANDS if b.split(".")[0] in from_name.lower().replace(" ", "")), None)
    if claimed and base_domain(sender_domain) != claimed:
        find("Name and address disagree", f'Shows "{from_name}" but sends from {sender_domain}', "high")

    # Body text and links.
    html_parts, text_parts, attachments = [], [], []
    for part in msg.walk():
        if part.is_multipart() or part.get_content_type() == "message/rfc822":
            continue
        fname = part.get_filename()
        disp = (part.get_content_disposition() or "").lower()
        if fname or disp == "attachment":
            data = part.get_payload(decode=True) or b""
            attachments.append({"name": (fname or "attachment.bin")[:120], "size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                                "type": part.get_content_type(), "risky": (fname or "").lower().endswith(RISKY_EXT),
                                "data": base64.b64encode(data).decode() if len(data) <= 25 * 1024 * 1024 else None})
            continue
        try:
            body = part.get_content()
        except (LookupError, ValueError):
            body = (part.get_payload(decode=True) or b"").decode("utf-8", "replace")
        (html_parts if part.get_content_type() == "text/html" else text_parts).append(str(body))

    lp = Links()
    for h in html_parts:
        try:
            lp.feed(h)
        except Exception:
            pass
    links = lp.links
    # The plain-text copy repeats what the HTML shows, so read it only when there is no HTML.
    for t in ([] if html_parts else text_parts):
        for u in re.findall(r"https?://[^\s<>\"')]+", t):
            links.append({"href": u, "text": ""})
    seen, uniq = set(), []
    for l in links:
        if not l["href"].lower().startswith(("http://", "https://")) or l["href"] in seen:
            continue
        seen.add(l["href"])
        uniq.append(l)
        shown = re.search(r"(?:https?://)?([a-z0-9.-]+\.[a-z]{2,})", l["text"] or "", re.I)
        if shown and host_of(l["href"]) and base_domain(shown.group(1).lower()) != base_domain(host_of(l["href"])):
            find("Link text lies", f'Shows {shown.group(1)} but goes to {host_of(l["href"])}', "high")
        near = lookalike(host_of(l["href"]), BRANDS + ([sender_domain] if sender_domain else []))
        if near:
            find("Lookalike link", f"{host_of(l['href'])} imitates {near}", "high")

    plain = " ".join([subject] + text_parts + [re.sub(r"<[^>]+>", " ", h) for h in html_parts]).lower()
    pressure = [w for w in URGENCY if w in plain]
    if pressure:
        find("Pressure to act now", ", ".join(pressure[:4]), "medium")
    for a in attachments:
        if a["risky"]:
            find("Attachment that runs code", f"{a['name']} ({a['type']})", "medium")

    for a in attachments[:MAX_ATTACH]:
        emit({"type": "extract", "kind": "file", "name": a["name"], "size": a["size"]})
    for l in uniq[:MAX_LINKS]:
        emit({"type": "extract", "kind": "link", "name": l["href"][:200]})

    return {
        "kind": "email", "executed": True, "subject": subject, "from": from_addr, "fromName": from_name,
        "replyTo": reply_to, "returnPath": return_path, "auth": auth, "forwardedBy": forwarded_by,
        "findings": findings, "links": uniq[:MAX_LINKS], "attachments": attachments[:MAX_ATTACH],
        "linksTotal": len(uniq), "attachmentsTotal": len(attachments), "events": [],
        "fs": {"added": [], "removed": [], "changed": []},
    }
