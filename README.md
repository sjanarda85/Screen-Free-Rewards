# Screen Free Rewards

Premium grained-charcoal dashboard for screen-free time. Children earn points for time away from screens. Parents set rewards, schedules, and approve points and requests.

## Open the app

Open [index.html](index.html) in a browser. No install step. It is always the latest version (see `VERSION` and [CHANGELOG.md](CHANGELOG.md)). Every version is kept as its own file in `releases/app/`, named `screen-free-rewards_app_v{version}_{date}_{label}.html`. The version also shows inside the app on the sign-in screen and the parent dashboard.

## Rule: daily summary at midnight

Every day at 00:00 each parent gets an email with the summary of the day that just ended and the PDF report. It is always on. The app sends it when it is open at midnight and catches up (up to 3 days) when opened later. For families whose app is closed, the mail relay (version 4) sends it from the last numbers the child's device synced, after the owner runs `installMidnightTrigger` once. See `apps-script/SETUP.md`.

## Install on a phone

- **Android and iPhone, no store:** open the app link in the phone browser, then Android Chrome menu, Install app, or iPhone Safari Share, Add to Home Screen. It opens full screen and works offline.
- **Real apps (APK and iOS project):** see [mobile/README.md](mobile/README.md). On GitHub, Actions, Build mobile apps, Run workflow gives an installable Android APK.
- **Family file:** a saved family (children, points, tasks, both parents) loads from the setup screen or Data tab. `releases/family/` has the Vidyut family.

## Files and versions

| Where | What |
|---|---|
| `index.html`, `public/screen-free.html` | Latest app (same file) |
| `releases/app/` | Every app version, never edited after release |
| `releases/guide/` | Parent guide PDF (dark and light) |
| `mobile/` | Android and iOS projects and the build steps |
| `releases/family/` | Ready family file (Vidyut) |
| `docs/` | Companion app interface and platform notes |
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

## Screen time, app tracking and remote lock

- The child sees **Screen time today** under the timer. It counts time in this app plus apps a parent logs by hand. With the native companion it is every app on the phone.
- Parent controls, **Apps**: screen time today and for 7 days, the app list with Lock buttons, a device lock with a message, and the pairing code.
- **One-time pairing:** show the code on the child's device, type it on the parent's phone (choose My phone (parent)). The parent phone then shows the child's screen time and can lock the device or apps from anywhere.
- A web app cannot see other apps or lock the whole phone. That needs a native companion app. What works now and what needs the companion is in the guide and in [docs/COMPANION.md](docs/COMPANION.md), which also defines the interface the companion plugs into. `tools/companion-simulator.mjs` demonstrates it.

## Edit and delete everything

Every task, reward, earning window, child, request, logged app time, session and log entry has Edit and Delete. **Data** also has Adjust points, Change parent PIN, Download my data, Erase everything, and the parent guide PDF (also in `releases/guide/`).
