# Relay setup (you do this once, for all customers)

The same relay also pairs parents' phones to the child's device (screen time and remote lock) and is the link a future native companion app reports to. Screen Free Rewards emails parents about everything their child does: points earned, tasks, reward requests and the daily summary with a PDF report. Each family only enters their own email in the app. The emails are sent by one mail relay that **you** run. This is the same model as the Thakazhi Peedika daily summary.

## What a customer does
1. Installs the app on their child's device and fills in the family setup: parent name, email (and a second parent if they like), parent PIN, child name and age, child PIN.
2. Types the 6-digit code that arrives in their inbox, once per parent email.
3. That is all. From then on every notification goes to that family's emails, and to nobody else. Each family's data stays on its own device.

## What you do once (about 5 minutes)
1. Open https://script.google.com signed in with the Google account the emails should come from. Choose **New project**.
2. Delete the sample code and paste the whole of `apps-script/Code.gs`.
3. Click **Deploy**, then **New deployment**, type **Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Click **Deploy** and approve the permission request (it only sends email).
4. Copy the **Web app URL** (starts with `https://script.google.com/macros/s/`, ends with `/exec`).
5. Make the customer build, which has your link built in so customers never see it:

       python3 tools/bake_mail_link.py "PASTE-YOUR-LINK" index.html customer-build.html

   Or send me the link and I will make it. Give customers `customer-build.html`.
6. To test as the owner, open the app with `?admin=1` on the end of the address to see the mail link field.

If you change `Code.gs` later, use **Deploy, Manage deployments, Edit, New version** so the same link keeps working.

## How the relay protects you and your customers
- Only addresses that proved ownership with a 6-digit code can receive mail, so it cannot be used to spam strangers.
- The sender name is fixed, only a PDF attachment is accepted, and message sizes are capped.
- Limits per address and per day (`MAX_SENDS_PER_ADDRESS_PER_DAY`, `MAX_CODES_PER_ADDRESS_PER_DAY`, `MAX_EMAILS_PER_DAY`) are at the top of `Code.gs`.

## Updating to this version
If you already deployed an older `Code.gs`, replace its code with the new one and use **Deploy, Manage deployments, Edit, New version** (the link stays the same). Version 3 adds pairing, usage sync and remote controls.

## Remote controls: what to expect
- Parent phones and the child's device check in every 30 seconds while the app is open. Each family therefore uses roughly 240 relay calls an hour while both phones are open, and each call counts toward Apps Script's daily run-time quota for your account. That is fine for a first group of families, not for hundreds.
- The relay stores a small room per child (name, last 7 days of screen time numbers, lock settings). It holds about 150 children in Apps Script storage. `cleanup()` removes rooms unused for 60 days.
- The lock covers the app itself. Locking other apps or the whole phone needs the native companion: see `docs/COMPANION.md`.

## Know the limit before you sell widely
A Google Apps Script relay sends from a normal Google account, which Google caps at about **100 emails a day** (about 1,500 with Google Workspace). Each family can generate many emails a day, so this is right for testing and a small first group of customers, not for hundreds of families. For wide sale, move the same relay to a transactional email service (for example Resend, Postmark or Amazon SES) behind a small server endpoint. The app does not change: it only needs a different link. Tell me when you are ready and I will build that endpoint.
