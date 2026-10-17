# tools

`make_summary_pdf.py` draws the daily summary as a small A4 vector PDF (about 6 KB, standard fonts) in the dark or light theme. Needs `pip install reportlab`.

    python3 make_summary_pdf.py data.json dark out.pdf

`data.json` is the output of the app's `summaryData()` (name, age, date, balance, pending, earned, mins, scheduled, unused, redeemed, open, tasks, log with time). The app's own **Download summary PDF** button prints the same layout from the browser.
