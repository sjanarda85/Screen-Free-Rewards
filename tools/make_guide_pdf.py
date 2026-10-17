#!/usr/bin/env python3
"""Builds the parent guide PDF (dark and light). Needs: pip install reportlab
    python3 tools/make_guide_pdf.py 1.5.0 out_dir
"""
import sys, os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
VERSION = sys.argv[1] if len(sys.argv) > 1 else "1.5.0"
OUT = sys.argv[2] if len(sys.argv) > 2 else "."
THEMES = {
 "dark": dict(bg="#161719", card="#202226", chip="#2b2d31", chipT="#d9cfb8", ink="#eeece7", mut="#9c9da0", line="#33363b", gold="#d6b260", warnbg="#2a2418", warn="#f2b45a"),
 "light": dict(bg="#f6f3ec", card="#ffffff", chip="#ebe4d3", chipT="#6b5a2e", ink="#1c1c1a", mut="#6f6e68", line="#e4ded0", gold="#b48a2c", warnbg="#fbf1da", warn="#8a5a05"),
}
def build(theme):
    t = THEMES[theme]; C = lambda k: HexColor(t[k])
    W, H = A4; M = 18 * mm
    st = {
      "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=30, leading=34, textColor=C("ink"), spaceAfter=6),
      "sub": ParagraphStyle("sub", fontName="Helvetica", fontSize=12, leading=17, textColor=C("mut"), spaceAfter=14),
      "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=C("ink"), spaceBefore=14, spaceAfter=6, keepWithNext=1),
      "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=C("gold"), spaceBefore=10, spaceAfter=3, keepWithNext=1),
      "p": ParagraphStyle("p", fontName="Helvetica", fontSize=10, leading=14.5, textColor=C("ink"), spaceAfter=5),
      "b": ParagraphStyle("b", fontName="Helvetica", fontSize=10, leading=14.2, textColor=C("ink"), leftIndent=12, bulletIndent=2, spaceAfter=2.5),
      "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=9.2, leading=12.6, textColor=C("ink")),
      "cellb": ParagraphStyle("cellb", fontName="Helvetica-Bold", fontSize=9.2, leading=12.6, textColor=C("ink")),
      "cellh": ParagraphStyle("cellh", fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=C("chipT")),
      "note": ParagraphStyle("note", fontName="Helvetica", fontSize=9.6, leading=13.6, textColor=C("ink")),
    }
    def P(x): return Paragraph(x, st["p"])
    def B(items): return [Paragraph(i, st["b"], bulletText="-") for i in items]
    def H1(x): return Paragraph(x, st["h1"])
    def H2(x): return Paragraph(x, st["h2"])
    def TB(rows, widths, head=None):
        data = []
        if head: data.append([Paragraph(h.upper(), st["cellh"]) for h in head])
        for r in rows: data.append([Paragraph(r[0], st["cellb"])] + [Paragraph(c, st["cell"]) for c in r[1:]])
        tb = Table(data, colWidths=widths, repeatRows=1 if head else 0)
        sty = [("BACKGROUND", (0, 0), (-1, -1), C("card")), ("LINEBELOW", (0, 0), (-1, -2), .4, C("line")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
               ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
               ("BOX", (0, 0), (-1, -1), .5, C("line"))]
        if head: sty += [("BACKGROUND", (0, 0), (-1, 0), C("chip")), ("LINEBELOW", (0, 0), (-1, 0), .4, C("line"))]
        tb.setStyle(TableStyle(sty)); return tb
    def NOTE(x, warn=False):
        tb = Table([[Paragraph(x, st["note"])]], colWidths=[W - 2 * M])
        tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), C("warnbg") if warn else C("card")), ("BOX", (0, 0), (-1, -1), .6, C("warn") if warn else C("line")),
            ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
        return tb
    CW = W - 2 * M
    s = []
    # ---- cover
    s += [Spacer(1, 38 * mm), Paragraph("Screen Free Rewards", st["title"]), Paragraph("Parent guide. Every screen, every control, and what the app can and cannot do.", st["sub"]),
          Paragraph("Version %s" % VERSION, ParagraphStyle("v", fontName="Helvetica-Bold", fontSize=10, textColor=C("gold"), spaceAfter=18)),
          NOTE("<b>What this app does.</b> Children earn points for time away from screens. Parents set the earning windows, approve points, decide reward requests, read a daily summary by email and see screen time. You can edit or delete every piece of information the app stores."),
          Spacer(1, 8),
          NOTE("<b>An important limit.</b> Screen Free Rewards is a web app. A web app can track time spent in itself and apps a parent logs by hand, and it can lock itself. It cannot see or block other apps or lock the whole phone: phones only allow that to a native companion app with special permissions. This guide marks clearly what works now and what needs the companion.", warn=True),
          Spacer(1, 10), H2("In this guide"),
          ] + B(["1. Getting started and connecting the parents' phones", "2. The child's screen", "3. Parent controls, tab by tab", "4. Emails and notifications", "5. Screen time, app tracking and remote lock", "6. Editing and deleting your information", "7. Privacy and where data lives", "8. Troubleshooting"]) + [PageBreak()]
    # ---- 1 getting started
    s += [H1("1. Getting started"),
          P("There are two ways to open the app. Choose at the top of the first screen."),
          H2("On the child's device: Child's device"),
          ] + B(["Enter your name, your email (every notification goes here) and, if you like, a second parent's email and your mobile number.", "Choose a parent PIN (4 to 8 digits). It opens Parent controls on the child's device. Keep it secret.", "Enter the child's name, age and their own PIN (4 to 8 digits). The two PINs must be different.", "Press Start. Each parent email is confirmed once: the app emails a 6-digit code and you type it in. Only confirmed emails receive notifications.", "A pairing code appears so you can connect your own phone straight away (see below). You can skip it and do it later in Parent controls, Apps."]) + [
          H2("On the parent's own phone: My phone (parent)"),
          ] + B(["On the child's device open Parent controls, then Apps, then Show pairing code. The code looks like K7QM-4TXD and works for 15 minutes.", "On your phone open the app, choose My phone (parent), type your name and the code, and press Connect. You only do this once.", "Your phone now shows the child's screen time and app list, and can lock the device or apps. Up to 4 parent phones can connect to one child's device, and one phone can follow several children."]) + [
          Spacer(1, 6), NOTE("<b>Siblings.</b> Add more children in Parent controls, Siblings. Each child has their own points, tasks, rewards, requests and PIN. They share the same device and the same parent emails."),
          Spacer(1, 12)]
    # ---- 2 child
    s += [H1("2. The child's screen"),
          TB([("Timer ring", "Shows the time of the current session. The ring fills as the day's screen-free minutes use up the scheduled window."),
              ("Start / Stop", "Starts the screen-free timer. It only starts inside an earning window set by the parent. Stopping collects the points: 1 point per full minute. The points wait for a parent to approve them."),
              ("Screen time today", "The total shown under the ring. With the companion app it is all apps on the phone. Without it, it is time in this app plus apps a parent logged by hand. The note under the number says which."),
              ("Redeem points", "The child picks a reward the parent added. The points are held, the parents get an email, and the parent approves or declines. Declining refunds the points."),
              ("Ask parents / Suggest reward", "Sends a free-text request. A suggested reward becomes a real reward when a parent approves it and sets its cost."),
              ("Tasks", "Tasks assigned by a parent appear under the buttons. Tapping Done adds the points straight away and emails the parents."),
              ("Parent controls", "Opens with the parent PIN only.")],
             [38 * mm, CW - 38 * mm], head=["Item", "What it does"]), Spacer(1, 8),
          NOTE("<b>Locked screen.</b> When a parent locks the device the child sees a full-screen lock with the parent's message. It can only be removed from a parent phone or with the parent PIN on the device."),
          Spacer(1, 12)]
    # ---- 3 tabs
    s += [H1("3. Parent controls, tab by tab"), P("Open with the Parent controls button and the parent PIN. Every list has Edit and Delete buttons.")]
    s += [TB([("Overview", "Balance, pending points (with an Approve points button), minutes screen free today, open requests, a 7-day chart and recent activity."),
              ("Schedule", "Earning windows by day type and time. Edit or delete any window. With no windows the timer works at any time."),
              ("Reconciliation", "Compares the scheduled minutes with the minutes actually timed. Log time in other apps by hand here; each entry can be edited or deleted and counts toward the screen time totals."),
              ("Tasks", "Add tasks with points. Edit the title, points or status, or delete a task."),
              ("Requests", "Approve or decline asks, suggestions and redeems. Each request can be deleted. A redeem that is still waiting is refunded if you delete it."),
              ("Rewards", "The rewards a child can redeem. Add, edit (name, cost, description) or delete."),
              ("Siblings", "Add children, switch between them, edit a name, age or PIN, or delete a child and all of their data."),
              ("Profile", "Parent names, emails, mobile numbers, who gets emails, notification choices, the daily or weekly summary, email confirmation status and the Send test email button."),
              ("Reports", "Email today's summary now, preview it, download the summary PDF, or the activity and points PDFs."),
              ("Apps", "Screen time today and for 7 days, the app list with Lock buttons, the device lock, and the pairing code for parent phones."),
              ("Data", "This guide, a file with all your data, adjust points, delete sessions or log entries, change the parent PIN, and erase everything.")],
             [30 * mm, CW - 30 * mm], head=["Tab", "What you can do"]), Spacer(1, 12)]
    # ---- 4 email
    s += [H1("4. Emails and notifications"),
          P("Each family receives its own emails, only at the addresses its parents entered and confirmed. Emails are sent by the mail relay that the app owner runs, from one Google account, so the sender is the same for every family."),
          TB([("Points earned", "Sent when a timer session ends with points. Can be switched off in Profile."),
              ("Task completed", "Sent when the child taps Done on a task. Can be switched off in Profile."),
              ("Requests and redeems", "Always sent, with the PDF report attached."),
              ("Daily summary", "Set Send log every to Daily or Weekly. It is sent after 20:00 while the app is open on the device. You can also press Email today's summary at any time."),
              ("Verification code", "Sent once per parent email when you set up or press Verify in Profile.")],
             [38 * mm, CW - 38 * mm], head=["Email", "When"]), Spacer(1, 8),
          H2("What is in the PDF report"),
          P("One A4 page in the same layout as the email: balance, pending, earned today and screen free minutes, then Child, Points, Screen-free time, open requests and tasks, activity and a short commentary."),
          NOTE("<b>Limits.</b> A free Google account can send about 100 emails a day for all families together (about 1,500 with Google Workspace). That suits a small first group. For many families the owner should move the relay to an email service; the app does not change.", warn=True),
          Spacer(1, 12)]
    # ---- 5 screen time
    s += [H1("5. Screen time, app tracking and remote lock"),
          P("This is the part where being clear matters. The table shows what is built and tested in this version and what needs the companion app."),
          TB([("Total screen time in this app", "Works now", "Counted while the child's home screen of the app is open and visible."),
              ("Time in other apps, logged by a parent", "Works now", "Parent logs the minutes in Reconciliation. They appear in the totals and the app list."),
              ("Screen time shown to the child", "Works now", "Under the timer ring, labelled with its source."),
              ("Pairing parent phones, once", "Works now", "Code from the child's device, typed on the parent phone."),
              ("See usage from the parent phone", "Works now", "Refreshes every 30 seconds while the parent phone app is open."),
              ("Lock the app on the child's device", "Works now", "Full-screen lock, applied within about 30 seconds while the app is open on the child's device."),
              ("Lock list for other apps", "Saved now", "Choices are stored and sent. Blocking happens only with the companion app."),
              ("Time in every app on the phone", "Needs companion", "Phones only share this with a native app that has Usage Access (Android) or Screen Time (iPhone)."),
              ("Block other apps, lock the whole phone", "Needs companion", "Needs Accessibility and Device Admin on Android, or Screen Time controls on iPhone.")],
             [52 * mm, 24 * mm, CW - 76 * mm], head=["Capability", "Status", "Notes"]), Spacer(1, 8),
          H2("How the lock works on the child's device"),
          ] + B(["From your phone or the Apps tab press Lock device now. You can add a message.", "The child's device checks for changes every 30 seconds while the app is open and visible, then shows the lock.", "If the app is closed on the child's device it cannot receive the lock until it is opened again. Only a native companion can lock a closed phone.", "To unlock: press Unlock device on your phone, or enter the parent PIN on the lock screen."]) + [
          H2("The companion app"),
          P("The companion is a small native app on the child's phone. It reads which apps were used and for how long, reports totals to the same sync link, and enforces the locks you choose. The sync link already accepts its reports and returns the lock settings, so adding it later needs no change to the family's setup. It is a separate project and is not part of this release."),
          Spacer(1, 12)]
    # ---- 6 edit delete
    s += [H1("6. Editing and deleting your information"),
          TB([("Parent details", "Profile: change names, emails, mobile numbers and options, then Save profile."),
              ("Parent PIN", "Data, Parent PIN: enter the current PIN and a new one."),
              ("A child", "Siblings: Edit changes name, age and PIN. Delete removes the child and all of their data (not available for the only child)."),
              ("Points", "Data, Adjust points: add or remove points with a reason. The change is written to the activity log."),
              ("Tasks, rewards, windows", "Their tabs: Edit or Delete on each item."),
              ("Requests", "Requests: Delete on any item."),
              ("Logged app time", "Reconciliation: Edit or Delete on each entry."),
              ("Sessions", "Data, Sessions: delete a session from the history. Points already earned stay; use Adjust points to change the balance."),
              ("Activity log", "Data, Activity log: delete single entries or clear the whole log."),
              ("Everything", "Data, Erase everything on this device. Needs the parent PIN. It also disconnects the parent phones."),
              ("A copy of your data", "Data, Download my data: a file with everything stored on this device.")],
             [40 * mm, CW - 40 * mm], head=["Information", "How to change or delete it"]), Spacer(1, 12)]
    # ---- 7 privacy
    s += [H1("7. Privacy and where data lives"),
          ] + B(["Children, points, tasks, rewards, requests, history and settings are stored on the device where you set up the app. They are not copied to a server.", "Emails go through the owner's mail relay to the addresses you confirmed. The relay does not store the message, but the Sent folder of the Google account that sends the mail may keep a copy.", "For parent phones the relay stores only: a random room, the child's first name, the last 7 days of screen time numbers, the lock settings, and when the device was last seen. Disconnect all parent phones, or Erase everything, deletes that room.", "A relay link is needed for emails and phone pairing. If you use a family-specific link, only you can see this data.", "Anyone who knows the parent PIN can open Parent controls. Choose a PIN the children cannot guess and change it if it leaks."]) + [Spacer(1, 12)]
    # ---- 8 trouble
    s += [H1("8. Troubleshooting"),
          TB([("I did not get the verification code", "Check the spam folder. Codes last 10 minutes and you can ask for 4 a day per address. Use Verify in Profile to ask again."),
              ("Emails stopped", "Open Profile and check both emails show Verified. If the owner's daily email limit is reached, emails resume the next day."),
              ("The parent phone says not connected", "The child's device may have disconnected it. On the child's device press Show pairing code and connect again."),
              ("The lock did not appear", "The app must be open and visible on the child's device. Wait up to 30 seconds. Closed apps cannot receive a lock."),
              ("Screen time looks too low", "Without the companion it counts only this app and what you log. Log other apps in Reconciliation."),
              ("The timer will not start", "The child must be inside an earning window. Check Schedule."),
              ("PDF buttons fail", "The Activity and Points PDFs need an internet connection. The summary and this guide work offline."),
              ("I forgot the parent PIN", "On the sign-in screen choose Forgot PIN: it asks for the parent PIN, so write it down. If it is lost, clearing this site's data in the browser settings deletes everything and lets you set up again.")],
             [48 * mm, CW - 48 * mm], head=["Problem", "What to do"]), Spacer(1, 10),
          Paragraph("Screen Free Rewards v%s. This guide describes this version only." % VERSION, ParagraphStyle("f", fontName="Helvetica", fontSize=8.5, textColor=C("mut")))]
    def decorate(c, doc):
        c.saveState(); c.setFillColor(C("bg")); c.rect(0, 0, W, H, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 8); c.setFillColor(C("chipT")); c.drawString(M, H - 11 * mm, "SCREEN FREE REWARDS  |  PARENT GUIDE")
        c.setFillColor(C("mut")); c.setFont("Helvetica", 8); c.drawRightString(W - M, H - 11 * mm, "v" + VERSION)
        c.setStrokeColor(C("gold")); c.setLineWidth(1.2); c.line(M, H - 13.5 * mm, W - M, H - 13.5 * mm)
        c.setFillColor(C("mut")); c.drawString(M, 10 * mm, "Screen Free Rewards"); c.drawRightString(W - M, 10 * mm, "Page %d" % doc.page); c.restoreState()
    name = os.path.join(OUT, "guide-%s.pdf" % theme)
    doc = BaseDocTemplate(name, pagesize=A4, leftMargin=M, rightMargin=M, topMargin=22 * mm, bottomMargin=18 * mm, title="Screen Free Rewards parent guide v" + VERSION, author="Screen Free Rewards")
    doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(M, 18 * mm, W - 2 * M, H - 40 * mm, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=decorate)])
    doc.build(s); return name
if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for th in ("dark", "light"): print(build(th), os.path.getsize(os.path.join(OUT, "guide-%s.pdf" % th)))
