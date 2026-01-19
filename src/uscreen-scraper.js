/**
 * Uscreen Scraper
 * Uses Puppeteer to:
 * 1. Login to Uscreen admin
 * 2. Trigger People export
 * 3. Trigger Sales/Payments export
 * 4. Download both CSV files from Exported Files page
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

class UscreenScraper {
  constructor(config) {
    this.loginUrl = config.loginUrl;
    this.email = config.email;
    this.password = config.password;
    this.downloadPath = path.join(__dirname, '../downloads');
    this.browser = null;
    this.page = null;
  }

  async scrapeAll() {
    try {
      // Ensure download directory exists
      if (!fs.existsSync(this.downloadPath)) {
        fs.mkdirSync(this.downloadPath, { recursive: true });
      }

      await this.launchBrowser();
      await this.login();
      
      // Trigger exports
      await this.triggerPeopleExport();
      await this.triggerSalesExport();
      
      // Wait for exports to be ready
      console.log('   ⏳ Waiting 30s for exports to generate...');
      await this.delay(30000);
      
      // Download from Exported Files page
      const files = await this.downloadExports();
      
      // Parse CSV files
      const users = await this.parseCSV(files.users);
      const payments = await this.parseCSV(files.payments);
      
      await this.closeBrowser();
      
      return { users, payments };
      
    } catch (error) {
      await this.closeBrowser();
      throw error;
    }
  }

  async launchBrowser() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    
    // Set download behavior
    const client = await this.page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: this.downloadPath
    });
    
    await this.page.setViewport({ width: 1280, height: 800 });
  }

  async login() {
    console.log('   🔐 Logging into Uscreen...');
    
    await this.page.goto(this.loginUrl, { waitUntil: 'networkidle2' });
    
    // Wait for login form
    await this.page.waitForSelector('input[type="email"], input[placeholder*="email"]', { timeout: 10000 });
    
    // Enter credentials - find and type into email field
    const emailInput = await this.page.$('input[type="email"]') || await this.page.$('input[placeholder*="email"]');
    if (emailInput) {
      await emailInput.type(this.email);
    }
    
    const passwordInput = await this.page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.type(this.password);
    }
    
    // Small delay to ensure form is ready
    await this.delay(500);
    
    // Click login button via JavaScript (more reliable than Puppeteer click)
    await this.page.evaluate(() => {
      // Try submit button first
      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.click();
        return;
      }
      // Then try input submit
      const inputSubmit = document.querySelector('input[type="submit"]');
      if (inputSubmit) {
        inputSubmit.click();
        return;
      }
      // Finally try finding by text
      const buttons = Array.from(document.querySelectorAll('button'));
      const loginBtn = buttons.find(b => 
        b.textContent.toLowerCase().includes('log in') || 
        b.textContent.toLowerCase().includes('login') ||
        b.textContent.toLowerCase().includes('sign in')
      );
      if (loginBtn) loginBtn.click();
    });
    
    // Wait for dashboard to load
    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    
    console.log('   ✅ Logged in successfully');
  }

  async triggerPeopleExport() {
    console.log('   📋 Triggering People export...');
    
    // Navigate to People page
    await this.page.goto(`${this.loginUrl}/people`, { waitUntil: 'networkidle2' });
    await this.delay(2000);
    
    // Click Export button - find by data-testid or text content
    const exportButton = await this.page.$('[data-testid="export-button"]');
    if (exportButton) {
      await exportButton.click();
      await this.delay(2000);
    } else {
      // Try finding by text content
      await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const exportBtn = buttons.find(b => b.textContent.includes('Export'));
        if (exportBtn) exportBtn.click();
      });
    }
    
    console.log('   ✅ People export triggered');
  }

  async triggerSalesExport() {
    console.log('   💰 Triggering Sales export...');
    
    // Navigate to Sales page
    await this.page.goto(`${this.loginUrl}/sales`, { waitUntil: 'networkidle2' });
    await this.delay(2000);
    
    // Click Export button
    await this.page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const exportBtn = buttons.find(b => b.textContent.includes('Export'));
      if (exportBtn) exportBtn.click();
    });
    
    await this.delay(2000);
    console.log('   ✅ Sales export triggered');
  }

  async downloadExports() {
    console.log('   📥 Downloading from Exported Files page...');
    
    // Navigate to Settings > Exported Files
    await this.page.goto(`${this.loginUrl}/settings/exported-files`, { waitUntil: 'networkidle2' });
    await this.delay(3000);
    
    // Find and click download links for the most recent exports
    // This may need adjustment based on actual UI
    const downloads = await this.page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[download], a[href*=".csv"]'));
      return links.slice(0, 2).map(l => l.href);
    });
    
    // Download the files
    for (const url of downloads) {
      await this.page.goto(url);
      await this.delay(3000);
    }
    
    // Find downloaded files
    const files = fs.readdirSync(this.downloadPath);
    const csvFiles = files.filter(f => f.endsWith('.csv')).sort((a, b) => {
      return fs.statSync(path.join(this.downloadPath, b)).mtime - 
             fs.statSync(path.join(this.downloadPath, a)).mtime;
    });
    
    return {
      users: path.join(this.downloadPath, csvFiles[0] || 'users.csv'),
      payments: path.join(this.downloadPath, csvFiles[1] || 'payments.csv')
    };
  }

  async parseCSV(filePath) {
    if (!fs.existsSync(filePath)) {
      console.warn(`   ⚠️ File not found: ${filePath}`);
      return [];
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    return records;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = UscreenScraper;
