# Free HTTPS Hosting With Google Apps Script

Use this version when the election app must stay online even when your laptop is off.

Google Apps Script gives you a free HTTPS web app URL like:

```text
https://script.google.com/macros/s/.../exec
```

Data is saved in a Google Sheet created under your Google account.

## Files

- `Code.gs` - server logic and Google Sheets storage.
- `App.html` - mobile-friendly voter, results, and admin interface.

## Setup Steps

1. Go to `https://script.google.com/`.
2. Sign in with your Google account.
3. Click **New project**.
4. Rename the project to `NACO 94 Election`.
5. Delete any starter code in `Code.gs`.
6. Copy everything from `Code.gs` in this folder and paste it into Google Apps Script `Code.gs`.
7. Click the **+** beside **Files**, choose **HTML**, name it `App`, then paste everything from `App.html`.
8. In the function dropdown near the top, choose `setupElectionStorage`.
9. Click **Run**.
10. Google will ask for permission. Approve it.
11. After it runs, a Google Sheet named `NACO 94 Executive Committee Election Data` will be created in your Drive.
12. Click **Deploy** > **New deployment**.
13. Choose type **Web app**.
14. Set **Execute as** to **Me**.
15. Set **Who has access** to **Anyone**.
16. Click **Deploy**.
17. Copy the web app URL ending in `/exec`.

## Admin Login

Open:

```text
YOUR_WEB_APP_URL?page=admin
```

Default admin password:

```text
test-admin-password
```

Change it from the admin page before the real election.

## WhatsApp Links

Post this public voting page in the WhatsApp group:

```text
YOUR_WEB_APP_URL
```

Post this public live result page if desired:

```text
YOUR_WEB_APP_URL?page=results
```

Send private voter links individually by WhatsApp direct message after generating codes from the admin page.

## Election Flow

1. Add or import registered voters.
2. Mark ELECO members and other ineligible people as ineligible.
3. Add offices.
4. Add candidates.
5. Generate voting codes for eligible voters.
6. Send each voter their own code or private link by WhatsApp direct message.
7. Set election status to `open`.
8. Watch live public totals.
9. Use the admin report for ELECO-only confidential records.
10. Set election status to `closed` when voting ends.

## Notes

- The public results page shows totals only.
- The admin confidential report shows voter-by-voter choices.
- Voters do not need email accounts.
- Voters only need the web link and their private code.
- The app runs from Google servers, not your laptop.
