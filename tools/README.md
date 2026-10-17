# tools

`make_summary_pdf.py` draws the daily summary as a small A4 vector PDF (about 6 KB, standard fonts) in the dark or light theme. Needs `pip install reportlab`.

    python3 make_summary_pdf.py data.json dark out.pdf

`data.json` is the output of the app's `summaryData()` (name, age, date, balance, pending, earned, mins, scheduled, unused, redeemed, open, tasks, log with time). The app's own **Download summary PDF** button prints the same layout from the browser.

`bake_mail_link.py` makes the customer build with your mail relay link built in (see `apps-script/SETUP.md`).

`test-relay.mjs` runs the relay script (`apps-script/Code.gs`) in Node against stand-ins for the Google services and checks verification codes, tokens, limits and attachment rules: `node tools/test-relay.mjs`.

`make_guide_pdf.py` builds the parent guide PDF (dark and light): `python3 tools/make_guide_pdf.py 1.6.0 out_dir`. The dark one is embedded in the app.

`local-relay.mjs` runs the relay script as a local web server (no Google needed) and `companion-simulator.mjs` plays the native companion against it or against the real relay. See `docs/COMPANION.md`.
