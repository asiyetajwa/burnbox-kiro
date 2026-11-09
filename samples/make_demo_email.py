"""Builds samples/invoice_overdue.eml, the demo phishing email: a fake sender, a lying link and the test attachment.
Run: python3 samples/make_demo_email.py   (everything in it is a Burn Box test asset on reserved .test names)
"""
from email.message import EmailMessage
from pathlib import Path

here = Path(__file__).parent
msg = EmailMessage()
msg["From"] = '"Northwind Payables" <billing@northwind-payables.lab.test>'
msg["Reply-To"] = "payments@northwind-paybles.lab.test"
msg["Return-Path"] = "<bounce@mailer-7731.lab.test>"
msg["To"] = "accounts@yourcompany.example"
msg["Subject"] = "URGENT: Invoice #88213 is 14 days overdue"
msg["Date"] = "Tue, 04 Nov 2026 08:41:00 +0000"
msg["Message-ID"] = "<88213.overdue@mailer-7731.lab.test>"
msg["Authentication-Results"] = "mx.yourcompany.example; spf=fail smtp.mailfrom=mailer-7731.lab.test; dkim=none; dmarc=fail header.from=northwind-payables.lab.test"
msg.set_content(
    "Hello,\n\nOur records show invoice #88213 for $4,860.00 is now 14 days overdue. A late fee of 8% will be added after 5:00 PM today.\n\n"
    "View the invoice: https://northwind-payables.lab.test/invoices/88213\n\nOr open the attached invoice helper.\n\nAccounts Receivable\nNorthwind Payables\n"
)
msg.add_alternative(
    """<html><body style="font-family:Arial,sans-serif">
<p>Hello,</p>
<p>Our records show invoice <b>#88213</b> for <b>$4,860.00</b> is now 14 days overdue. A late fee of 8% will be added after 5:00 PM today.</p>
<p><a href="http://invoices-portal.lab.test/view?inv=88213">https://northwind-payables.lab.test/invoices/88213</a></p>
<p>Or open the attached invoice helper, which prepares the payment details for you.</p>
<p>Accounts Receivable<br>Northwind Payables</p>
</body></html>""",
    subtype="html",
)
msg.add_attachment((here / "invoice_sample.py").read_bytes(), maintype="text", subtype="x-python", filename="invoice_sample.py")
(here / "invoice_overdue.eml").write_bytes(bytes(msg))
print("wrote", here / "invoice_overdue.eml")
