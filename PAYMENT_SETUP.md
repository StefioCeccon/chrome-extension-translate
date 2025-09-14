# Payment Setup Guide for Call Subtitle Translator

This guide explains how to set up the payment system for the freemium model.

## Overview

The extension now includes a freemium model where users get 50 free translations, then must subscribe for $0.99/month for unlimited access.

## Current Implementation

The current implementation simulates the payment flow. To make it production-ready, you'll need to:

1. Set up a Stripe account
2. Create a backend server
3. Update the payment.js file with real Stripe keys
4. Handle webhook events

## Step 1: Stripe Account Setup

1. Go to [stripe.com](https://stripe.com) and create an account
2. Get your API keys from the Stripe Dashboard
3. Create a product and price for the $0.99/month subscription

## Step 2: Backend Server Requirements

You'll need a backend server (Node.js, Python, etc.) that can:

1. Create Stripe customers
2. Create subscriptions
3. Handle webhook events for subscription updates
4. Store subscription status in a database

## Step 3: Update payment.js

Replace the placeholder Stripe key in `payment.js`:

```javascript
// Replace this line:
this.stripe = Stripe('pk_test_your_key_here');

// With your actual publishable key:
this.stripe = Stripe('pk_test_51ABC123...');
```

## Step 4: Backend Integration

The `createSubscription()` method in `payment.js` currently simulates success. You'll need to:

1. Send the payment method ID to your backend
2. Create a customer and subscription in Stripe
3. Return the real subscription ID

Example backend endpoint:

```javascript
// POST /api/create-subscription
app.post('/api/create-subscription', async (req, res) => {
  try {
    const { paymentMethodId } = req.body;
    
    // Create customer
    const customer = await stripe.customers.create({
      payment_method: paymentMethodId,
      email: req.body.email,
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
    
    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: 'price_1234567890' }], // Your price ID
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });
    
    res.json({ subscriptionId: subscription.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

## Step 5: Webhook Handling

Set up webhooks to handle subscription lifecycle events:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Step 6: Database Schema

You'll need to store subscription data:

```sql
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  status VARCHAR(50) NOT NULL,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Step 7: Testing

1. Use Stripe test keys for development
2. Test the complete flow with test card numbers
3. Verify webhook handling
4. Test subscription cancellation

## Security Considerations

1. Never expose your Stripe secret key in frontend code
2. Always verify webhook signatures
3. Implement proper authentication for your backend
4. Use HTTPS for all API calls

## Cost Structure

- **Free Tier**: 50 translations per user
- **Premium Tier**: $0.99/month for unlimited translations
- **Stripe Fees**: ~2.9% + $0.30 per transaction

## Monitoring

Track these metrics:
- Free tier conversion rate
- Subscription churn rate
- Revenue per user
- API usage patterns

## Support

For issues with:
- **Extension**: Check the console logs
- **Stripe**: Check Stripe Dashboard and logs
- **Backend**: Check your server logs

## Next Steps

1. Set up your Stripe account
2. Create a backend server
3. Update the payment.js file
4. Test the complete flow
5. Deploy to production
6. Monitor and optimize
