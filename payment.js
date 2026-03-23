// Payment handling for the Call Subtitle Translator extension
// This file handles Stripe integration for subscription management

class PaymentManager {
  constructor() {
    this.isInitialized = true;
    // Set EXTENSION_BACKEND_BASE_URL in config.js; optional override if this script loads without config.js
    this.apiBaseUrl =
      typeof EXTENSION_BACKEND_BASE_URL !== 'undefined'
        ? EXTENSION_BACKEND_BASE_URL
        : 'https://chrome-extension-translate-backend-ce42z5mupq-uc.a.run.app';
    this.userId = null;
    
    // Initialize user ID for backend subscription tracking.
    this.initUserId();
  }
  
  async initUserId() {
    try {
      // Get or create user ID from Chrome storage
      const result = await chrome.storage.local.get(['userId']);
      if (result.userId) {
        this.userId = result.userId;
      } else {
        // Generate new user ID
        this.userId = 'user_' + Math.random().toString(36).substr(2, 16);
        await chrome.storage.local.set({ userId: this.userId });
      }
      console.log('PaymentManager: User ID initialized:', this.userId);
    } catch (error) {
      console.error('PaymentManager: Error initializing user ID:', error);
    }
  }
  
  async createSubscription(email) {
    if (!this.userId) {
      throw new Error('User ID not initialized');
    }
    
    try {
      // Hosted Checkout flow: no Stripe.js in extension popup.
      const response = await fetch(`${this.apiBaseUrl}/api/subscriptions/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          userId: this.userId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create subscription');
      }
      
      const checkoutData = await response.json();
      if (!checkoutData.checkoutUrl) {
        throw new Error('Checkout URL missing from backend response');
      }

      await chrome.tabs.create({ url: checkoutData.checkoutUrl });

      return {
        success: true,
        userId: checkoutData.userId,
        status: 'checkout_started'
      };
      
    } catch (error) {
      console.error('PaymentManager: Error creating subscription:', error);
      throw error;
    }
  }
  
  async cancelSubscription(subscriptionId) {
    try {
      if (!this.userId) {
        throw new Error('User ID not initialized');
      }
      
      console.log('PaymentManager: Cancelling subscription:', subscriptionId);
      
      const response = await fetch(`${this.apiBaseUrl}/api/subscriptions/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.userId,
          subscriptionId: subscriptionId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to cancel subscription');
      }
      
      const result = await response.json();
      
      // Update local storage
      await chrome.storage.local.set({
        subscriptionStatus: result.status
      });
      
      return result;
      
    } catch (error) {
      console.error('PaymentManager: Error cancelling subscription:', error);
      throw error;
    }
  }
  
  async getSubscriptionStatus() {
    try {
      if (!this.userId) {
        throw new Error('User ID not initialized');
      }
      
      console.log('PaymentManager: Getting subscription status for user:', this.userId);
      
      const response = await fetch(`${this.apiBaseUrl}/api/subscriptions/status/${this.userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get subscription status');
      }
      
      const statusData = await response.json();
      
      // Update local storage with latest status
      await chrome.storage.local.set({
        subscriptionStatus: statusData.status,
        translationCount: statusData.translationCount,
        hasActiveSubscription: statusData.hasActiveSubscription,
        remainingFreeTranslations: statusData.remainingFreeTranslations
      });
      
      return statusData;
      
    } catch (error) {
      console.error('PaymentManager: Error getting subscription status:', error);
      throw error;
    }
  }
  
  async trackTranslationUsage(translationData = {}) {
    try {
      if (!this.userId) {
        throw new Error('User ID not initialized');
      }
      
      const response = await fetch(`${this.apiBaseUrl}/api/subscriptions/track-usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.userId,
          translationData: translationData
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to track usage');
      }
      
      const result = await response.json();
      
      // Update local storage
      await chrome.storage.local.set({
        translationCount: result.translationCount,
        hasActiveSubscription: result.hasActiveSubscription,
        remainingFreeTranslations: result.remainingFreeTranslations
      });
      
      return result;
      
    } catch (error) {
      console.error('PaymentManager: Error tracking usage:', error);
      throw error;
    }
  }
  
  // Legacy no-op: kept for compatibility with popup.js.
  mountCardElement(container) {
    return container;
  }
  
  // Legacy no-op
  unmountCardElement() {
    return;
  }
  
  // Legacy no-op
  clearCardElement() {
    return;
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PaymentManager;
} else {
  window.PaymentManager = PaymentManager;
}
