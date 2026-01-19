/**
 * Salesforce Client
 * Connects to Salesforce via jsforce and queries Program_Roles__c
 */

const jsforce = require('jsforce');

class SalesforceClient {
  constructor(config) {
    this.config = config;
    this.conn = null;
  }

  async connect() {
    this.conn = new jsforce.Connection({
      loginUrl: this.config.loginUrl
    });

    // Login with username/password + security token
    await this.conn.login(
      this.config.username,
      this.config.password + (this.config.securityToken || '')
    );

    console.log('   ✅ Connected to Salesforce');
  }

  async getProgramRoles() {
    if (!this.conn) {
      await this.connect();
    }

    // Query all Program_Roles__c records with Uscreen fields
    const query = `
      SELECT 
        Id,
        Name,
        Account__c,
        Contact__c,
        Program_Role_Location__c,
        Program_Role_Type__c,
        Subscription__c,
        Installment_Frequency__c,
        Subscription_Cost__c,
        Active__c,
        Subscription_Start_Date__c,
        Uscreen_Member_ID__c,
        Uscreen_Subscription_Status__c,
        Uscreen_Last_Payment_Date__c,
        Contact__r.Email,
        Contact__r.Name
      FROM Program_Roles__c
      WHERE Uscreen_Member_ID__c != null
      ORDER BY CreatedDate DESC
    `;

    const result = await this.conn.query(query);
    
    // Transform to flat structure
    const records = result.records.map(r => ({
      sfId: r.Id,
      name: r.Name,
      accountId: r.Account__c,
      contactId: r.Contact__c,
      contactEmail: r.Contact__r?.Email || '',
      contactName: r.Contact__r?.Name || '',
      location: r.Program_Role_Location__c,
      roleType: r.Program_Role_Type__c,
      subscription: r.Subscription__c,
      installmentFrequency: r.Installment_Frequency__c,
      subscriptionCost: r.Subscription_Cost__c,
      active: r.Active__c,
      subscriptionStartDate: r.Subscription_Start_Date__c,
      uscreenMemberId: r.Uscreen_Member_ID__c,
      uscreenSubscriptionStatus: r.Uscreen_Subscription_Status__c,
      uscreenLastPaymentDate: r.Uscreen_Last_Payment_Date__c
    }));

    return records;
  }

  async updateProgramRole(sfId, updates) {
    if (!this.conn) {
      await this.connect();
    }

    const result = await this.conn.sobject('Program_Roles__c').update({
      Id: sfId,
      ...updates
    });

    return result;
  }

  async bulkUpdateProgramRoles(updates) {
    if (!this.conn) {
      await this.connect();
    }

    // updates is array of { Id, field1, field2, ... }
    const result = await this.conn.sobject('Program_Roles__c').update(updates);
    
    return result;
  }
}

module.exports = SalesforceClient;
