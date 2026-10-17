# Mail link setup (one time, about 3 minutes)

This gives Screen Free Rewards its own mail sender, the same way the Thakazhi Peedika daily summary works. After this, the **Send test email**, **Email today's summary** buttons and every child request email both parents on one click, with the PDF report attached. Nothing to open or confirm.

1. Open https://script.google.com and sign in with the Google account the emails should come from. Choose **New project**.
2. Delete the sample code and paste the whole of `apps-script/Code.gs`.
3. Near the top, put both parent emails in `ALLOWED_RECIPIENTS`, for example `['sam@example.com', 'alex@example.com']`. This stops anyone else using your link to email other people.
4. Click **Deploy**, then **New deployment**. Choose type **Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Click **Deploy** and approve the permission request (it only needs to send email).
5. Copy the **Web app URL**. It starts with `https://script.google.com/macros/s/` and ends with `/exec`.
6. In the app: Parent controls, Profile, paste it into **Mail link**, add the parent emails, and press **Save profile**. (Or just press **Send test email** and paste the link when asked.)
7. Press **Send test email**. It should arrive within a few seconds.

If you change `Code.gs` later, use **Deploy, Manage deployments, Edit, New version** so the same link keeps working.

Privacy: the link lets anyone who knows it ask the script to send mail to the allowed addresses only. Keep the link private and keep `ALLOWED_RECIPIENTS` filled in.
