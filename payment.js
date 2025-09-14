// Payment handling for the Call Subtitle Translator extension
// This file handles Stripe integration for subscription management

class PaymentManager {
  constructor() {
    this.stripe = null;
    this.elements = null;
    this.cardElement = null;
    this.isInitialized = false;
    this.apiBaseUrl = 'https://chrome-extension-translate-backend-ce42z5mupq-uc.a.run.app'; // Your actual Cloud Run URL
    this.userId = null;
    
    // Initialize Stripe and user ID
    this.initStripe();
    this.initUserId();
  }
  
  async initStripe() {
    try {
      // Load Stripe.js dynamically
      if (!window.Stripe) {
        await this.loadStripeScript();
      }
      
      // Initialize Stripe with your publishable key
      // Replace 'pk_test_your_key_here' with your actual Stripe publishable key
      this.stripe = Stripe('pk_live_51S7OwrBICWKfko2pZ8DAMDCLGlO2ho7pMd8ILiGQBeHj51d5rwKSdqBWbnppLFDWTedVlokcwBmOYfoooGAjhVuE008CXtyTwc');
      
      // Create card element
      this.elements = this.stripe.elements();
      this.cardElement = this.elements.create('card', {
        style: {
          base: {
            fontSize: '16px',
            color: '#424770',
            '::placeholder': {
              color: '#aab7c4',
            },
          },
          invalid: {
            color: '#9e2146',
          },
        },
      });
      
      this.isInitialized = true;
      console.log('PaymentManager: Stripe initialized successfully');
    } catch (error) {
      console.error('PaymentManager: Error initializing Stripe:', error);
    }
  }
  
  async loadStripeScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
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
    if (!this.isInitialized) {
      throw new Error('Stripe not initialized');
    }
    
    if (!this.userId) {
      throw new Error('User ID not initialized');
    }
    
    try {
      // Create payment method
      const { paymentMethod, error } = await this.stripe.createPaymentMethod({
        type: 'card',
        card: this.cardElement,
        billing_details: {
          name: 'Extension User',
          email: email
        },
      });
      
      if (error) {
        throw new Error(error.message);
      }
      
      console.log('PaymentManager: Payment method created:', paymentMethod.id);
      
      // Send payment method to backend to create subscription
      const response = await fetch(`${this.apiBaseUrl}/api/subscriptions/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
          email: email,
          userId: this.userId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create subscription');
      }
      
      const subscriptionData = await response.json();
      
      // Handle 3D Secure if required
      if (subscriptionData.requiresAction && subscriptionData.clientSecret) {
        const { error: confirmError } = await this.stripe.confirmCardPayment(
          subscriptionData.clientSecret
        );
        
        if (confirmError) {
          throw new Error(confirmError.message);
        }
      }
      
      // Store subscription info locally
      await chrome.storage.local.set({
        subscriptionId: subscriptionData.subscriptionId,
        customerId: subscriptionData.customerId,
        subscriptionStatus: subscriptionData.status
      });
      
      return {
        success: true,
        subscriptionId: subscriptionData.subscriptionId,
        customerId: subscriptionData.customerId,
        status: subscriptionData.status
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
  
  // Method to mount card element to a container
  mountCardElement(container) {
    if (this.cardElement && container) {
      this.cardElement.mount(container);
    }
  }
  
  // Method to unmount card element
  unmountCardElement() {
    if (this.cardElement) {
      this.cardElement.unmount();
    }
  }
  
  // Method to clear card element
  clearCardElement() {
    if (this.cardElement) {
      this.cardElement.clear();
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PaymentManager;
} else {
  window.PaymentManager = PaymentManager;
}
