# Companion app: interface and platform notes

Screen Free Rewards is a web app. It tracks time in itself, accepts apps a parent logs by hand, pairs parent phones to the child's device, and locks itself. Phones do not let a web app see other apps or lock the phone. That needs a small native companion app on the child's phone. **The companion is not part of this release.** This page is the exact contract it plugs into, so it can be built without changing the app, the relay or the parent phones. `tools/companion-simulator.mjs` already speaks this contract.

## 1. Setup the companion receives
In Parent controls, Apps, press **Copy companion setup** on the child's device. It copies:

    {"link":"https://script.google.com/macros/s/.../exec","roomId":"K3...","secret":"9f..."}

The parent pastes or scans it into the companion once. Keep the secret in the platform's secure storage (Android Keystore, iOS Keychain). Anyone holding it can read that child's usage and change the locks.

## 2. One call does everything: `sync`
POST to `link` with header `Content-Type: text/plain;charset=utf-8` (avoids a CORS pre-flight) and a JSON body. Replies are JSON `{ "ok": true, ... }` or `{ "ok": false, "error": "..." }`.

Report usage and read the controls:

    {
      "action": "sync",
      "roomId": "<roomId>", "secret": "<secret>",
      "date": "2026-10-17",
      "usage": {
        "date": "2026-10-17",          // the device's local date
        "src": "companion",            // required: marks this as the device-wide report
        "total": 132,                  // minutes the screen was on today (all apps)
        "apps": [ {"k":"com.google.android.youtube","n":"YouTube","m":70} ]   // k = package id, n = label, m = minutes today
      }
    }

Reply:

    { "ok": true,
      "controls": { "rev": 7, "deviceLocked": false, "message": "", "lockedApps": { "com.supercell.clashofclans": true }, "by": "parent phone" },
      "parents": ["Sam"], "companion": { "total": 132, "apps": [...], "at": 1792265292000 } }

Rules the relay enforces: only the newest 7 days are kept, at most 30 apps per day (largest first), names up to 60 characters, about 8.5 KB per child. At most 900 calls per child per hour. The web app writes its own fields (`inApp`, `appsApp`) and never overwrites the companion's `total` and `apps`, and the reverse.

Send `sync` about every 60 seconds while the screen is on, and on every app switch if you can batch it. Do not poll while the screen is off. Back off on errors.

## 3. Enforcing the controls
`controls.deviceLocked` true: lock the phone (or show a full-screen lock) and show `message`. `controls.lockedApps`: block the apps listed. A key is a package id (`com.android.chrome`) or `manual:<name>` when a parent typed a name; match the second kind against the app label, case-insensitively. `rev` increases on every change, so you only need to act when it changes.

An unlock sent from a parent phone arrives in the next `sync` reply. The child's device can also unlock itself with the parent PIN; the web app then writes the new controls with `ctrl-set`.

## 4. Platform notes
**Android (possible).**
- Usage: Usage Access permission (`PACKAGE_USAGE_STATS`, granted by the parent in Settings). Read foreground time per package with `UsageStatsManager.queryEvents` since local midnight, and screen-on time from `SCREEN_INTERACTIVE` / `SCREEN_NON_INTERACTIVE` events.
- Blocking apps: an `AccessibilityService` that sees the foreground package and shows a lock screen over locked apps, or run the companion as the device owner / use Lock Task mode on a dedicated child device.
- Lock the phone: `DevicePolicyManager.lockNow()` with a device administrator grant.
- Run it as a foreground service with a visible notification, and sync with `WorkManager` plus a screen-on listener.
- Google Play requires a prominent disclosure and a declaration for Accessibility and Usage Access, and the app must be honest that it monitors the child's phone.

**iPhone (very limited).** Apple only allows this through the Screen Time API (`FamilyControls`, `DeviceActivity`, `ManagedSettings`). It needs an entitlement that Apple must approve, and the parent authorises it with Family Sharing. Apps can shield (block) apps and set limits, but Apple does **not** let an app export per-app usage to its own server: usage can only be shown inside Apple's own report view. So on iPhone the realistic scope is locks and limits driven from the relay, with usage staying on the device. Apple's built-in Screen Time already covers much of this.

## 5. Try it without a phone
    node tools/local-relay.mjs                         # a local copy of the relay on http://localhost:8787
    node tools/companion-simulator.mjs '{"link":"http://localhost:8787","roomId":"...","secret":"..."}' --apps "YouTube=45,Chrome=20" --watch
Against the real relay use the setup text from **Copy companion setup**. Open the parent phone: the apps appear within 30 seconds, and locking one shows up in the simulator's next line.

## 6. Other calls you may need
`pair-start`, `pair-code`, `pair-join`, `sync-pull`, `ctrl-set`, `unpair`: documented at the top of `apps-script/Code.gs`.
