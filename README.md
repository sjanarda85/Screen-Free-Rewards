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

## Email to parents (every notification, per family)

This is a product: each parent installs it on their child's device and sets their own email. On first start the app asks for the family details (parent and optional second parent email, parent PIN, child name, child PIN) and confirms each parent's email once with a 6-digit code. After that every notification goes to that family's emails only: points earned, tasks completed, reward and redeem requests, and a daily summary with a PDF report. Parents can switch off the points and task emails under Profile.

Emails are sent by one mail relay that the app owner runs (about 5 minutes to set up, then every customer works with no setup): see [apps-script/SETUP.md](apps-script/SETUP.md). `tools/bake_mail_link.py` makes the customer build with the relay link built in. Open any build with `?demo=1` to see sample data.
