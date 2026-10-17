#!/usr/bin/env python3
"""Make the customer build: bakes your relay link into the app so families never see or enter it.

    python3 tools/bake_mail_link.py "https://script.google.com/macros/s/XXXX/exec" index.html out.html
"""
import re, sys
link, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
if not re.fullmatch(r"https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec", link):
    sys.exit("That is not a Google Apps Script web app link (https://script.google.com/macros/s/.../exec)")
html = open(src, encoding="utf-8").read()
new, n = re.subn(r"const DEFAULT_MAIL_LINK='[^']*';", "const DEFAULT_MAIL_LINK='%s';" % link, html, count=1)
if n != 1:
    sys.exit("DEFAULT_MAIL_LINK not found in " + src)
open(dst, "w", encoding="utf-8").write(new)
print("Wrote", dst)
