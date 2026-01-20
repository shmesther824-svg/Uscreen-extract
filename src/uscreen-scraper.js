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
    
    // Use the correct admin login URL
    const loginUrl = `${this.loginUrl}/admin/users/sign_in`;
    console.log(`   📍 Login URL: ${loginUrl}`);
    await this.page.goto(loginUrl, { waitUntil: 'networkidle2' });
    
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
    
    // Navigate to People page - correct URL
    const peopleUrl = `${this.loginUrl}/manage/people`;
    console.log(`   📍 Navigating to: ${peopleUrl}`);
    await this.page.goto(peopleUrl, { waitUntil: 'networkidle2' });
    await this.delay(3000);
    
    // Look for Export button and click it
    const clicked = await this.page.evaluate(() => {
      // Try various selectors for export button
      const selectors = [
        'button[data-testid="export-button"]',
        'button.export-button',
        '[data-action="export"]',
        'a[href*="export"]'
      ];
      
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          el.click();
          return `Found via: ${selector}`;
        }
      }
      
      // Try finding by text content
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const exportBtn = buttons.find(b => 
        b.textContent.toLowerCase().includes('export') ||
        b.textContent.toLowerCase().includes('download')
      );
      if (exportBtn) {
        exportBtn.click();
        return `Found by text: ${exportBtn.textContent.trim()}`;
      }
      
      return 'Not found';
    });
    
    console.log(`   🖱️ Export button: ${clicked}`);
    await this.delay(3000);
    console.log('   ✅ People export triggered');
  }

  async triggerSalesExport() {
    console.log('   💰 Triggering Sales export...');
    
    // Navigate to Invoices page - correct URL
    const invoicesUrl = `${this.loginUrl}/bullet/invoices`;
    console.log(`   📍 Navigating to: ${invoicesUrl}`);
    await this.page.goto(invoicesUrl, { waitUntil: 'networkidle2' });
    await this.delay(3000);
    
    // Look for Export button and click it
    const clicked = await this.page.evaluate(() => {
      // Try various selectors for export button
      const selectors = [
        'button[data-testid="export-button"]',
        'button.export-button',
        '[data-action="export"]',
        'a[href*="export"]'
      ];
      
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          el.click();
          return `Found via: ${selector}`;
        }
      }
      
      // Try finding by text content
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const exportBtn = buttons.find(b => 
        b.textContent.toLowerCase().includes('export') ||
        b.textContent.toLowerCase().includes('download')
      );
      if (exportBtn) {
        exportBtn.click();
        return `Found by text: ${exportBtn.textContent.trim()}`;
      }
      
      return 'Not found';
    });
    
    console.log(`   🖱️ Export button: ${clicked}`);
    await this.delay(3000);
    console.log('   ✅ Sales export triggered');
  }

  async downloadExports() {
    console.log('   📥 Downloading from Exported Files page...');
    
    // Navigate to Exported Files page - correct URL
    const exportedFilesUrl = `${this.loginUrl}/bullet/settings/exported_files`;
    console.log(`   📍 Navigating to: ${exportedFilesUrl}`);
    await this.page.goto(exportedFilesUrl, { waitUntil: 'networkidle2' });
    await this.delay(5000);
    
    // Find download links
    const pageInfo = await this.page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a'));
      const downloadLinks = allLinks.filter(a => 
        a.href.includes('.csv') || 
        a.href.includes('download') ||
        a.hasAttribute('download') ||
        a.textContent.toLowerCase().includes('download')
      );
      
      return {
        pageUrl: window.location.href,
        totalLinks: allLinks.length,
        downloadLinksFound: downloadLinks.length,
        links: downloadLinks.slice(0, 4).map(l => ({ 
          href: l.href, 
          text: l.textContent.trim().substring(0, 50)
        }))
      };
    });
    
    console.log(`   📍 Page URL: ${pageInfo.pageUrl}`);
    console.log(`   🔗 Total links: ${pageInfo.totalLinks}, Download links: ${pageInfo.downloadLinksFound}`);
    
    if (pageInfo.links.length > 0) {
      console.log(`   📎 Found links: ${JSON.stringify(pageInfo.links)}`);
    }
    
    // Click on download links/buttons
    for (let i = 0; i < Math.min(2, pageInfo.links.length); i++) {
      const link = pageInfo.links[i];
      if (link.href && !link.href.includes('javascript:')) {
        console.log(`   ⬇️ Downloading: ${link.text || link.href}`);
        try {
          await this.page.goto(link.href, { waitUntil: 'networkidle2' });
          await this.delay(5000);
        } catch (e) {
          console.log(`   ⚠️ Download error: ${e.message}`);
        }
      }
    }
    
    // Check for downloaded files
    const files = fs.existsSync(this.downloadPath) ? fs.readdirSync(this.downloadPath) : [];
    console.log(`   📂 Files in downloads folder: ${files.length > 0 ? files.join(', ') : 'none'}`);
    
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
