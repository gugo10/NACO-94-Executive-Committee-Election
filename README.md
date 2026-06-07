# NACO 94 ELECO Voting App

This is a simple WhatsApp-friendly voting app for the NACO 94 ELECO process.

## What it does

- Public voting link at `/`.
- Public live result page at `/results`.
- ELECO/admin page at `/admin`.
- Private voter code or private voter link authentication.
- Codes are linked to specific registered voters.
- Voter sees a welcome page with their name before voting.
- Each eligible voter can vote only once.
- Public results show totals only.
- ELECO report is available behind admin login at `/admin/report`.
- Voter register can be locked and snapshotted before voting.
- Data is stored as JSON in `data/`.

## Start locally

```powershell
cd voting-app
$env:ADMIN_PASSWORD="choose-a-strong-password"
npm start
```

Then open:

- Voting page: `http://127.0.0.1:3000/`
- Public results: `http://127.0.0.1:3000/results`
- Admin page: `http://127.0.0.1:3000/admin`

## WhatsApp use

1. Add registered voters in the admin page.
2. Mark ELECO members and other ineligible people as ineligible.
3. Add offices and candidates.
4. Generate missing eligible voter codes.
5. Send each generated code or private link by WhatsApp direct message.
6. Post only the general voting page and public results page in the group.

## Important privacy note

The public results page does not show voter names or individual choices.

The ELECO report shows turnout lists and result totals. It does not show who voted for which candidate. Do not share the admin password or report link with the general group.

## Deployment note

For a real election, deploy this behind HTTPS on a trusted host and set:

```powershell
$env:ADMIN_PASSWORD="a-strong-password"
$env:SESSION_SECRET="a-long-random-secret"
$env:BASE_URL="https://your-public-voting-domain.example"
$env:DATA_DIR="C:\path\to\secure-election-data"
npm start
```
