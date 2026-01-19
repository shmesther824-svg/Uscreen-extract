/**
 * Uscreen + Salesforce Sync Script
 * 
 * Weekly automation that:
 * 1. Scrapes Uscreen exports (People + Payments)
 * 2. Pulls current data from Salesforce
 * 3. Compares and identifies changes
 * 4. Writes results to Google Sheets
 */

require('dotenv').config();

const UscreenScraper = require('./uscreen-scraper');
const SalesforceClient = require('./salesforce-client');
const GoogleSheetsClient = require('./sheets-client');
const DataComparer = require('./data-comparer');

const CONFIG = {
  uscreen: {
    loginUrl: 'https://app.uscreen.tv',
    email: process.env.USCREEN_EMAIL,
    password: process.env.USCREEN_PASSWORD
  },
  salesforce: {
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
    username: process.env.SF_USERNAME,
    password: process.env.SF_PASSWORD,
    securityToken: process.env.SF_SECURITY_TOKEN
  },
  sheets: {
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json'
  }
};

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`\n🚀 Starting Uscreen + Salesforce Sync ${isDryRun ? '(DRY RUN)' : ''}\n`);
  console.log('=' .repeat(50));

  try {
    // Step 1: Scrape Uscreen data
    console.log('\n📥 Step 1: Scraping Uscreen exports...');
    const uscreen = new UscreenScraper(CONFIG.uscreen);
    const uscreenData = await uscreen.scrapeAll();
    console.log(`   ✅ Users: ${uscreenData.users.length} records`);
    console.log(`   ✅ Payments: ${uscreenData.payments.length} records`);

    // Step 2: Pull Salesforce data
    console.log('\n📥 Step 2: Pulling Salesforce Program Roles...');
    const salesforce = new SalesforceClient(CONFIG.salesforce);
    const sfData = await salesforce.getProgramRoles();
    console.log(`   ✅ SF Records: ${sfData.length} records`);

    // Step 3: Compare data
    console.log('\n🔍 Step 3: Comparing data...');
    const comparer = new DataComparer();
    const comparison = comparer.compare(uscreenData, sfData);
    console.log(`   ✅ Matched: ${comparison.matched.length}`);
    console.log(`   ⚠️  New payments to update: ${comparison.needsUpdate.length}`);
    console.log(`   🆕 New Uscreen users (no SF match): ${comparison.newUsers.length}`);
    console.log(`   🔴 Cancelled: ${comparison.cancelled.length}`);

    // Step 4: Write to Google Sheets
    if (!isDryRun) {
      console.log('\n📤 Step 4: Writing to Google Sheets...');
      const sheets = new GoogleSheetsClient(CONFIG.sheets);
      await sheets.writeResults({
        uscreenUsers: uscreenData.users,
        uscreenPayments: uscreenData.payments,
        sfData: sfData,
        comparison: comparison
      });
      console.log('   ✅ Google Sheets updated!');
    } else {
      console.log('\n📤 Step 4: (Skipped - Dry Run)');
    }

    console.log('\n' + '=' .repeat(50));
    console.log('✅ Sync completed successfully!');
    console.log('=' .repeat(50) + '\n');

  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
