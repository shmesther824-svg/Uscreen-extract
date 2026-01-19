# Uscreen + Salesforce Sync

Automated weekly sync that:
1. **Scrapes Uscreen exports** (Users + Payments via browser automation)
2. **Pulls Salesforce data** (Program_Roles__c via API)
3. **Compares and identifies changes**
4. **Writes results to Google Sheets**

## Google Sheets Output

The script creates/updates these tabs:

| Tab | Purpose |
|-----|---------|
| **Uscreen Users** | All users from Uscreen export |
| **Uscreen Payments** | All payments > $0 from Uscreen |
| **Salesforce Data** | Current Program_Roles__c records |
| **Needs Update** | Users with new payments → update SF |
| **New Users (Review)** | Paid users not in SF → manual review |
| **Cancelled** | Users whose status changed to cancelled |

---

## Setup Instructions

### 1. Create Google Sheet

1. Create a new Google Sheet
2. Create these tabs (exact names):
   - `Uscreen Users`
   - `Uscreen Payments`
   - `Salesforce Data`
   - `Needs Update`
   - `New Users (Review)`
   - `Cancelled`
3. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/[THIS-IS-THE-ID]/edit`

### 2. Create Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable **Google Sheets API**
4. Go to **IAM & Admin → Service Accounts**
5. Create a new service account
6. Create a key (JSON format) and download it
7. Share your Google Sheet with the service account email (Editor access)

### 3. Get Salesforce Security Token

1. Log into Salesforce
2. Go to **Settings → My Personal Information → Reset My Security Token**
3. Check your email for the new token

### 4. Configure GitHub Repository

1. Create a new GitHub repository
2. Push this code to the repository
3. Go to **Settings → Secrets and variables → Actions**
4. Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `USCREEN_EMAIL` | Your Uscreen admin email |
| `USCREEN_PASSWORD` | Your Uscreen password |
| `SF_LOGIN_URL` | `https://login.salesforce.com` (or sandbox URL) |
| `SF_USERNAME` | Your Salesforce username |
| `SF_PASSWORD` | Your Salesforce password |
| `SF_SECURITY_TOKEN` | Your Salesforce security token |
| `GOOGLE_SHEET_ID` | Your Google Sheet ID |
| `GOOGLE_CREDENTIALS` | Contents of your Google service account JSON file |

### 5. Test the Workflow

1. Go to **Actions** tab in GitHub
2. Select "Weekly Uscreen + Salesforce Sync"
3. Click "Run workflow" to test manually

---

## Local Development

```bash
# Clone and install
git clone [your-repo]
cd uscreen-sf-sync
npm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your credentials

# Place your Google credentials.json in project root

# Run sync
npm run sync

# Dry run (no write to sheets)
npm test
```

---

## Schedule

By default, runs **every Monday at 6 AM Eastern**.

To change the schedule, edit `.github/workflows/weekly-sync.yml`:
```yaml
schedule:
  - cron: '0 11 * * 1'  # UTC time
```

Common cron patterns:
- `'0 11 * * 1'` = Monday 6 AM Eastern (11 AM UTC)
- `'0 11 * * *'` = Daily at 6 AM Eastern
- `'0 11 * * 0'` = Sunday at 6 AM Eastern

---

## Troubleshooting

### Uscreen login fails
- Check credentials in GitHub Secrets
- Uscreen may have changed their login page - may need to update selectors in `uscreen-scraper.js`

### Salesforce connection fails
- Verify security token is current (reset if needed)
- Check login URL (production vs sandbox)
- Ensure API access is enabled for your user

### Google Sheets not updating
- Verify the service account has Editor access to the sheet
- Check that sheet names match exactly
- Verify GOOGLE_CREDENTIALS secret contains valid JSON

---

## Files

```
uscreen-sf-sync/
├── .github/
│   └── workflows/
│       └── weekly-sync.yml    # GitHub Actions schedule
├── src/
│   ├── index.js               # Main orchestrator
│   ├── uscreen-scraper.js     # Puppeteer browser automation
│   ├── salesforce-client.js   # Salesforce API client
│   ├── sheets-client.js       # Google Sheets client
│   └── data-comparer.js       # Comparison logic
├── .env.example               # Environment template
├── package.json
└── README.md
```
