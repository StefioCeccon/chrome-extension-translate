const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { SubscriptionModel } = require('../models/database');

const router = express.Router();

// Webhook endpoint - must use raw body
router.use(express.raw({ type: 'application/json' }));

router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Received webhook event:', event.type);

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle subscription created
async function handleSubscriptionCreated(subscription) {
  console.log('Subscription created:', subscription.id);
  
  try {
    // Get customer to find userId
    const customer = await stripe.customers.retrieve(subscription.customer);
    const userId = customer.metadata?.userId;

    if (!userId) {
      console.error('No userId found in customer metadata for subscription:', subscription.id);
      return;
    }

    // Update subscription in database
    await SubscriptionModel.updateSubscription(userId, {
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end
    });

    console.log(`Updated subscription for user ${userId}: ${subscription.status}`);
  } catch (error) {
    console.error('Error handling subscription created:', error);
  }
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription) {
  console.log('Subscription updated:', subscription.id, 'Status:', subscription.status);
  
  try {
    // Get customer to find userId
    const customer = await stripe.customers.retrieve(subscription.customer);
    const userId = customer.metadata?.userId;

    if (!userId) {
      console.error('No userId found in customer metadata for subscription:', subscription.id);
      return;
    }

    // Update subscription in database
    await SubscriptionModel.updateSubscription(userId, {
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end
    });

    console.log(`Updated subscription for user ${userId}: ${subscription.status}`);
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

// Handle subscription deleted/canceled
async function handleSubscriptionDeleted(subscription) {
  console.log('Subscription deleted:', subscription.id);
  
  try {
    // Get customer to find userId
    const customer = await stripe.customers.retrieve(subscription.customer);
    const userId = customer.metadata?.userId;

    if (!userId) {
      console.error('No userId found in customer metadata for subscription:', subscription.id);
      return;
    }

    // Update subscription status to canceled
    await SubscriptionModel.updateSubscription(userId, {
      status: 'canceled'
    });

    console.log(`Canceled subscription for user ${userId}`);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
  console.log('Payment succeeded for invoice:', invoice.id);
  
  try {
    // Get subscription
    if (invoice.subscription) {
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      const customer = await stripe.customers.retrieve(subscription.customer);
      const userId = customer.metadata?.userId;

      if (!userId) {
        console.error('No userId found in customer metadata for invoice:', invoice.id);
        return;
      }

      // Ensure subscription is active
      await SubscriptionModel.updateSubscription(userId, {
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end
      });

      console.log(`Payment succeeded for user ${userId}, subscription active until:`, 
        new Date(subscription.current_period_end * 1000));
    }
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
  }
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
  console.log('Payment failed for invoice:', invoice.id);
  
  try {
    // Get subscription
    if (invoice.subscription) {
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      const customer = await stripe.customers.retrieve(subscription.customer);
      const userId = customer.metadata?.userId;

      if (!userId) {
        console.error('No userId found in customer metadata for invoice:', invoice.id);
        return;
      }

      // Update subscription status
      await SubscriptionModel.updateSubscription(userId, {
        status: subscription.status
      });

      console.log(`Payment failed for user ${userId}, subscription status: ${subscription.status}`);
      
      // Here you could implement logic to:
      // - Send notification to user about failed payment
      // - Implement grace period before disabling service
      // - Retry payment logic
    }
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

// Handle trial ending soon
async function handleTrialWillEnd(subscription) {
  console.log('Trial will end for subscription:', subscription.id);
  
  try {
    const customer = await stripe.customers.retrieve(subscription.customer);
    const userId = customer.metadata?.userId;

    if (!userId) {
      console.error('No userId found in customer metadata for subscription:', subscription.id);
      return;
    }

    console.log(`Trial ending soon for user ${userId}`);
    
    // Here you could implement logic to:
    // - Send notification to user about trial ending
    // - Offer upgrade prompts
    // - Prepare for transition to paid plan
  } catch (error) {
    console.error('Error handling trial will end:', error);
  }
}

module.exports = router;
