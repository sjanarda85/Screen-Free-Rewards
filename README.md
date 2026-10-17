# Screen Free Rewards

Premium grained-charcoal dashboard for screen-free time. Children earn points for time away from screens. Parents set rewards, schedules, and approve points and requests.

## Open the app

Open [index.html](index.html) in a browser. No install step. It is always the latest version (see `VERSION` and [CHANGELOG.md](CHANGELOG.md)). Every version is kept as its own file in `releases/app/`, named `screen-free-rewards_app_v{version}_{date}_{label}.html`. The version also shows inside the app on the sign-in screen and the parent dashboard.

## Files and versions

| Where | What |
|---|---|
| `index.html`, `public/screen-free.html` | Latest app (same file) |
| `releases/app/` | Every app version, never edited after release |
| `releases/email/` | Sample daily summary email (HTML, text, preview image) and the PDF report in dark and light |
| `apps-script/` | Mail link script and setup steps |
| `tools/` | Optional Python script that draws the same PDF |
| `releases/screenshots/vX.Y.Z/` | Screenshots of each version |
| `archive/` | Design explorations that are not used in the app |
| `CHANGELOG.md`, `VERSION`, `CLAUDE.md` | History, current version, and the release rules |

## Child

- Start and stop the no-screen timer.
- **Redeem points** spends points on rewards a parent added and sends the request to both parents.
- **Ask parents** sends any request. **Suggest reward** does the same, and an approval adds it to the reward list.

## Parents

Parent PIN defaults to `1234`. In Profile, add both parents' name, email, and mobile, and turn on "both at work". Requests show up immediately under Requests. Approve or decline there. Approving a suggestion adds it to Rewards. Declining a redeem refunds the points.

## Email to parents (one click)

Emails work the same way as the Thakazhi Peedika daily summary: the app builds the PDF report itself and posts it to a Google Apps Script mail link that sends it from your Google account. No activation, no mail app.

One-time setup (about 3 minutes): follow [apps-script/SETUP.md](apps-script/SETUP.md), then paste the link under Parent controls, Profile, Mail link. After that **Send test email**, **Email today's summary** and every child request email both parents on one click, with the PDF attached. If no link is saved yet, pressing **Send test email** asks for it once.

Set **Send log every** to Daily or Weekly to send the summary automatically after 20:00 while the app is open. **Download summary PDF** saves the report directly. **Preview summary** shows the HTML version.
