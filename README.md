# Screen Free Rewards

Premium grained-charcoal dashboard for screen-free time. Children earn points for time away from screens. Parents set rewards, schedules, and approve points and requests.

## Open the app

Open [index.html](index.html) in a browser. No install step. It is always the latest version (see `VERSION` and [CHANGELOG.md](CHANGELOG.md)). Every version is kept as its own file in `releases/app/`, named `screen-free-rewards_app_v{version}_{date}_{label}.html`. The version also shows inside the app on the sign-in screen and the parent dashboard.

## Files and versions

| Where | What |
|---|---|
| `index.html`, `public/screen-free.html` | Latest app (same file) |
| `releases/app/` | Every app version, never edited after release |
| `releases/email/` | Sample daily summary email (HTML, text and preview image) |
| `releases/screenshots/vX.Y.Z/` | Screenshots of each version |
| `archive/` | Design explorations that are not used in the app |
| `CHANGELOG.md`, `VERSION`, `CLAUDE.md` | History, current version, and the release rules |

## Child

- Start and stop the no-screen timer.
- **Redeem points** spends points on rewards a parent added and sends the request to both parents.
- **Ask parents** sends any request. **Suggest reward** does the same, and an approval adds it to the reward list.

## Parents

Parent PIN defaults to `1234`. In Profile, add both parents' name, email, and mobile, and turn on "both at work". Requests show up immediately under Requests. Approve or decline there. Approving a suggestion adds it to Rewards. Declining a redeem refunds the points.

## Email to parents

Add one or both parent emails under Profile (signing in as a parent with an email also saves it). Child requests, redeem requests, a manual **Email today's summary** (Reports) and **Send test email** (Profile) all go through FormSubmit. The first message to a new address sends an Activate email from FormSubmit: open it once and tap the button, then every later message arrives on its own. If sending fails the app offers to open your email app with the message ready. Set **Send log every** to Daily or Weekly to have the summary sent automatically after 20:00 while the app is open on a device. The summary uses the same layout as the Thakazhi Peedika daily summary (**Preview summary** shows it).
