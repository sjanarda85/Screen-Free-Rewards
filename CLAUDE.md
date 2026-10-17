# Working rules for this repository

## Versioning (follow after EVERY change request)
1. Bump the version in `VERSION` and `APP_VERSION` inside `index.html`: new feature or redesign = minor (1.1.0 to 1.2.0), fix or tweak = patch (1.1.0 to 1.1.1), breaking rewrite = major.
2. Save a copy of the finished app as `releases/app/screen-free-rewards_app_v{X.Y.Z}_{YYYY-MM-DD}_{short-label}.html`. Never edit an old release file.
3. Add a row at the top of `CHANGELOG.md` (version, date, label, what changed, file path).
4. Refresh `public/screen-free.html` so it equals `index.html`.
5. Run the browser checks, store screenshots in `releases/screenshots/v{X.Y.Z}/`, and the sample email in `releases/email/` when the email changed.
6. Commit, push to the working branch, and send the new files to the user in chat (the app file, plus screenshots or other files that changed).

## File naming
`screen-free-rewards_{type}_v{X.Y.Z}_{YYYY-MM-DD}_{label}.{ext}`
Types: `app`, `email-summary`, `screenshot`. Design explorations go in `archive/{name}_v{X.Y.Z}_{date}/` with every top-level file carrying the same tag.
