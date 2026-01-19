/**
 * Data Comparer
 * Compares Uscreen data with Salesforce data
 * Identifies: matches, new payments to update, new users, cancelled users
 */

class DataComparer {
  constructor() {
    // Build lookup maps
    this.sfByUscreenId = new Map();
    this.sfByEmail = new Map();
  }

  compare(uscreenData, sfData) {
    const { users: uscreenUsers, payments: uscreenPayments } = uscreenData;

    // Build SF lookup maps
    for (const sf of sfData) {
      if (sf.uscreenMemberId) {
        this.sfByUscreenId.set(String(sf.uscreenMemberId), sf);
      }
      if (sf.contactEmail) {
        this.sfByEmail.set(sf.contactEmail.toLowerCase(), sf);
      }
    }

    const results = {
      matched: [],      // Users that exist in both systems
      needsUpdate: [],  // Matched users with new payment data
      newUsers: [],     // Uscreen users not in SF (paid only)
      cancelled: [],    // Users whose status changed to cancelled
      noMatch: []       // Unmatched for review
    };

    // Process each Uscreen user
    for (const user of uscreenUsers) {
      const uscreenId = user['User ID'] || user.user_id || user.id;
      const email = (user.email || user['User email'] || '').toLowerCase();
      const status = (user.Status || user.status || '').toLowerCase();
      const lifetime = parseFloat(user['Lifetime'] || user.lifetime || 0);
      
      // Try to match by Uscreen ID first, then by email
      let sfRecord = this.sfByUscreenId.get(String(uscreenId));
      if (!sfRecord && email) {
        sfRecord = this.sfByEmail.get(email);
      }

      if (sfRecord) {
        // Matched!
        const matchData = {
          uscreenUser: user,
          sfRecord: sfRecord,
          uscreenId: uscreenId,
          email: email
        };

        results.matched.push(matchData);

        // Check if cancelled
        if (status === 'cancelled' || status === 'churned' || 
            (user.Segment || '').toLowerCase().includes('churned')) {
          results.cancelled.push({
            ...matchData,
            previousStatus: sfRecord.uscreenSubscriptionStatus,
            newStatus: 'cancelled'
          });
        }

        // Check if there's new payment data to update
        const latestPayment = this.findLatestPayment(uscreenPayments, email, uscreenId);
        if (latestPayment) {
          const sfLastPaymentDate = sfRecord.uscreenLastPaymentDate ? 
            new Date(sfRecord.uscreenLastPaymentDate) : null;
          const uscreenPaymentDate = latestPayment.chargeDate ? 
            new Date(latestPayment.chargeDate) : null;

          if (uscreenPaymentDate && (!sfLastPaymentDate || uscreenPaymentDate > sfLastPaymentDate)) {
            results.needsUpdate.push({
              ...matchData,
              latestPayment: latestPayment,
              sfLastPaymentDate: sfLastPaymentDate,
              uscreenLastPaymentDate: uscreenPaymentDate
            });
          }
        }
      } else {
        // No SF match
        // Only flag if they have paid (lifetime > 0)
        if (lifetime > 0) {
          results.newUsers.push({
            uscreenUser: user,
            uscreenId: uscreenId,
            email: email,
            lifetime: lifetime,
            status: status
          });
        } else {
          results.noMatch.push({
            uscreenUser: user,
            uscreenId: uscreenId,
            email: email,
            reason: 'No SF match, $0 lifetime'
          });
        }
      }
    }

    return results;
  }

  findLatestPayment(payments, email, uscreenId) {
    // Filter payments by email or user ID
    const userPayments = payments.filter(p => {
      const pEmail = (p.email || p.Email || '').toLowerCase();
      const pUserId = p['User ID'] || p.user_id || '';
      const amount = parseFloat(p['Charge Amount'] || p.charge_amount || p.amount || 0);
      
      // Exclude $0 payments
      if (amount <= 0) return false;
      
      return pEmail === email || String(pUserId) === String(uscreenId);
    });

    if (userPayments.length === 0) return null;

    // Sort by date descending and return most recent
    userPayments.sort((a, b) => {
      const dateA = new Date(a['Charge Date'] || a.charge_date || 0);
      const dateB = new Date(b['Charge Date'] || b.charge_date || 0);
      return dateB - dateA;
    });

    const latest = userPayments[0];
    return {
      email: latest.email || latest.Email,
      amount: parseFloat(latest['Charge Amount'] || latest.charge_amount || latest.amount || 0),
      chargeDate: latest['Charge Date'] || latest.charge_date,
      subscription: latest.Subscription || latest.subscription,
      paymentId: latest['Payment ID'] || latest.payment_id
    };
  }
}

module.exports = DataComparer;
