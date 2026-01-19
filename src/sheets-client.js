/**
 * Google Sheets Client
 * Writes sync results to Google Sheets with multiple tabs
 */

const { google } = require('googleapis');
const fs = require('fs');

class GoogleSheetsClient {
  constructor(config) {
    this.spreadsheetId = config.spreadsheetId;
    this.credentialsPath = config.credentialsPath;
    this.sheets = null;
  }

  async authenticate() {
    console.log(`   🔑 Authenticating with Google Sheets...`);
    console.log(`   📋 Spreadsheet ID: ${this.spreadsheetId}`);
    
    let auth;
    
    // Check if running in GitHub Actions (uses GOOGLE_CREDENTIALS env var)
    if (process.env.GOOGLE_CREDENTIALS) {
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      console.log(`   👤 Service Account: ${credentials.client_email}`);
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    } else {
      // Local development - use credentials file
      auth = new google.auth.GoogleAuth({
        keyFile: this.credentialsPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    }

    this.sheets = google.sheets({ version: 'v4', auth });
    
    // Verify access to spreadsheet
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });
      console.log(`   ✅ Connected to: "${response.data.properties.title}"`);
      
      // List existing sheets
      const sheetNames = response.data.sheets.map(s => s.properties.title);
      console.log(`   📑 Existing tabs: ${sheetNames.join(', ')}`);
    } catch (e) {
      console.error(`   ❌ Cannot access spreadsheet: ${e.message}`);
      throw e;
    }
  }

  async writeResults(data) {
    if (!this.sheets) {
      await this.authenticate();
    }

    const timestamp = new Date().toISOString();

    // Write to multiple sheets
    await this.writeUscreenUsers(data.uscreenUsers, timestamp);
    await this.writeUscreenPayments(data.uscreenPayments, timestamp);
    await this.writeSFData(data.sfData, timestamp);
    await this.writeNeedsUpdate(data.comparison.needsUpdate, timestamp);
    await this.writeNewUsers(data.comparison.newUsers, timestamp);
    await this.writeCancelled(data.comparison.cancelled, timestamp);
  }

  async writeUscreenUsers(users, timestamp) {
    const headers = ['User ID', 'Name', 'Email', 'Status', 'Lifetime', 'Segment', 'Created Date', 'Sync Time'];
    const rows = users.map(u => [
      u['User ID'] || u.user_id || '',
      u['User Name'] || u.name || '',
      u['User email'] || u.email || '',
      u.Status || u.status || '',
      u.Lifetime || u.lifetime || '',
      u.Segment || u.segment || '',
      u['Created on date'] || u.created_date || '',
      timestamp
    ]);

    await this.writeSheet('Uscreen Users', headers, rows);
  }

  async writeUscreenPayments(payments, timestamp) {
    const headers = ['Email', 'Name', 'Charge Date', 'Amount', 'Subscription', 'Coupon', 'Payment ID', 'Sync Time'];
    
    // Filter out $0 payments
    const paidPayments = payments.filter(p => {
      const amount = parseFloat(p['Charge Amount'] || p.charge_amount || p.amount || 0);
      return amount > 0;
    });

    const rows = paidPayments.map(p => [
      p.Email || p.email || '',
      p.Name || p.name || '',
      p['Charge Date'] || p.charge_date || '',
      p['Charge Amount'] || p.charge_amount || p.amount || '',
      p.Subscription || p.subscription || '',
      p.Coupon || p.coupon || '',
      p['Payment ID'] || p.payment_id || '',
      timestamp
    ]);

    await this.writeSheet('Uscreen Payments', headers, rows);
  }

  async writeSFData(sfData, timestamp) {
    const headers = ['SF ID', 'Name', 'Contact Email', 'Uscreen ID', 'Active', 'Subscription Status', 'Last Payment Date', 'Sync Time'];
    const rows = sfData.map(r => [
      r.sfId,
      r.name,
      r.contactEmail,
      r.uscreenMemberId,
      r.active ? 'Yes' : 'No',
      r.uscreenSubscriptionStatus || '',
      r.uscreenLastPaymentDate || '',
      timestamp
    ]);

    await this.writeSheet('Salesforce Data', headers, rows);
  }

  async writeNeedsUpdate(needsUpdate, timestamp) {
    const headers = ['SF ID', 'Uscreen ID', 'Email', 'SF Last Payment', 'New Payment Date', 'New Payment Amount', 'Action', 'Sync Time'];
    const rows = needsUpdate.map(r => [
      r.sfRecord.sfId,
      r.uscreenId,
      r.email,
      r.sfLastPaymentDate ? r.sfLastPaymentDate.toISOString().split('T')[0] : '',
      r.uscreenLastPaymentDate ? r.uscreenLastPaymentDate.toISOString().split('T')[0] : '',
      r.latestPayment?.amount || '',
      'UPDATE SF',
      timestamp
    ]);

    await this.writeSheet('Needs Update', headers, rows);
  }

  async writeNewUsers(newUsers, timestamp) {
    const headers = ['Uscreen ID', 'Email', 'Name', 'Status', 'Lifetime Amount', 'Action', 'Sync Time'];
    const rows = newUsers.map(r => [
      r.uscreenId,
      r.email,
      r.uscreenUser['User Name'] || r.uscreenUser.name || '',
      r.status,
      r.lifetime,
      'MANUAL REVIEW',
      timestamp
    ]);

    await this.writeSheet('New Users (Review)', headers, rows);
  }

  async writeCancelled(cancelled, timestamp) {
    const headers = ['SF ID', 'Uscreen ID', 'Email', 'Previous Status', 'New Status', 'Action', 'Sync Time'];
    const rows = cancelled.map(r => [
      r.sfRecord.sfId,
      r.uscreenId,
      r.email,
      r.previousStatus || 'Unknown',
      r.newStatus,
      'UPDATE STATUS',
      timestamp
    ]);

    await this.writeSheet('Cancelled', headers, rows);
  }

  async writeSheet(sheetName, headers, rows) {
    // Clear existing content and write new data
    const range = `${sheetName}!A1`;
    const values = [headers, ...rows];

    try {
      // First, try to clear the sheet
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`
      });
    } catch (e) {
      // Sheet might not exist, will be created with update
    }

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: { values }
    });

    console.log(`   📝 Wrote ${rows.length} rows to "${sheetName}"`);
  }
}

module.exports = GoogleSheetsClient;
