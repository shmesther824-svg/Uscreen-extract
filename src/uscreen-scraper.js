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
      
      // Wait for exports to be ready (may take a while)
      console.log('   ⏳ Waiting 60s for exports to generate...');
      await this.delay(60000);
      
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
    
    // Debug: log the page title and URL
    console.log(`   📍 Current URL: ${this.page.url()}`);
    console.log(`   📍 Page title: ${await this.page.title()}`);
    
    // Wait for login form - use exact Uscreen field names
    await this.page.waitForSelector('input[name="user[email]"], input[type="email"]', { timeout: 10000 });
    
    // Enter credentials - find and type into email field using exact name
    const emailInput = await this.page.$('input[name="user[email]"]') || await this.page.$('input[type="email"]');
    if (emailInput) {
      await emailInput.type(this.email);
      console.log('   ✅ Entered email');
    } else {
      console.log('   ❌ Email field not found');
    }
    
    // Password field - try exact name first
    const passwordInput = await this.page.$('input[name="user[password]"]') || await this.page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.type(this.password);
      console.log('   ✅ Entered password');
    } else {
      console.log('   ❌ Password field not found');
    }
    
    // Small delay to ensure form is ready
    await this.delay(1000);
    
    // Debug: List all buttons on the page
    const buttons = await this.page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      return allBtns.map(b => ({
        text: b.textContent?.trim().substring(0, 50),
        type: b.type,
        tagName: b.tagName,
        className: b.className?.substring(0, 50)
      }));
    });
    console.log(`   📍 Found buttons: ${JSON.stringify(buttons)}`);
    
    // Click the login form submit - AVOID Google buttons
    const clickResult = await this.page.evaluate(() => {
      // Look for the form that contains the email/password fields
      const emailField = document.querySelector('input[name="user[email]"]');
      if (emailField) {
        // Find the form this field belongs to
        const form = emailField.closest('form');
        if (form) {
          // Try to submit the form directly
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
          if (submitBtn && !submitBtn.textContent?.toLowerCase().includes('google')) {
            submitBtn.click();
            return `Clicked form submit: ${submitBtn.textContent?.trim()}`;
          }
          // Or submit the form
          form.submit();
          return 'Submitted form directly';
        }
      }
      
      // Fallback: find any submit button that's NOT Google
      const allButtons = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"]'));
      const nonGoogleBtn = allButtons.find(b => 
        !b.textContent?.toLowerCase().includes('google') && 
        !b.className?.toLowerCase().includes('google')
      );
      if (nonGoogleBtn) {
        nonGoogleBtn.click();
        return `Clicked non-Google button: ${nonGoogleBtn.textContent?.trim()}`;
      }
      
      return 'No suitable button found';
    });
    console.log(`   📍 Click result: ${clickResult}`);
    
    // Wait for dashboard to load
    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    
    // Debug: log the page after login
    console.log(`   📍 After login URL: ${this.page.url()}`);
    console.log(`   📍 After login title: ${await this.page.title()}`);
    
    // Check if we're actually logged in by looking for a logout link or username
    const isLoggedIn = await this.page.evaluate(() => {
      // Look for signs we're logged in
      const body = document.body.innerHTML.toLowerCase();
      return body.includes('logout') || body.includes('sign out') || body.includes('dashboard');
    });
    console.log(`   📍 Appears logged in: ${isLoggedIn}`);
    
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
    
    // Click download links to trigger downloads (don't navigate)
    for (let i = 0; i < Math.min(2, pageInfo.links.length); i++) {
      const link = pageInfo.links[i];
      if (link.href && link.href.includes('.csv')) {
        const filename = link.href.split('/').pop();
        console.log(`   ⬇️ Downloading file ${i+1}: ${filename}`);
        try {
          // Click the link element in the page context
          await this.page.evaluate((index) => {
            const allLinks = Array.from(document.querySelectorAll('a'));
            const downloadLinks = allLinks.filter(a => 
              a.href.includes('.csv') || 
              a.textContent.toLowerCase().includes('download')
            );
            if (downloadLinks[index]) {
              downloadLinks[index].click();
            }
          }, i);
          // Wait for download to start and complete
          await this.delay(10000);
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
