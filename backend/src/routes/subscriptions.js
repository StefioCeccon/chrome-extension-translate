const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { v4: uuidv4 } = require('uuid');
const { SubscriptionModel } = require('../models/database');

const router = express.Router();

// Create hosted Stripe Checkout session (works from extension popup without Stripe.js)
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { email, userId } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Missing required field: email' });
    }

    const finalUserId = userId || uuidv4();
    await SubscriptionModel.createUser(finalUserId);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: finalUserId,
      metadata: { userId: finalUserId },
      subscription_data: {
        metadata: { userId: finalUserId }
      },
      success_url: `${baseUrl}/checkout/success`,
      cancel_url: `${baseUrl}/checkout/cancel`
    });

    res.json({
      checkoutUrl: session.url,
      userId: finalUserId,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(400).json({
      error: 'Failed to create checkout session',
      message: error.message
    });
  }
});

// Recover subscription by billing email (useful after extension reinstall/new userId)
router.post('/recover-by-email', async (req, res) => {
  try {
    const { email, userId } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Missing required field: email' });
    }

    const finalUserId = userId || uuidv4();
    await SubscriptionModel.createUser(finalUserId);

    const customers = await stripe.customers.list({ email, limit: 10 });
    if (!customers.data.length) {
      return res.status(404).json({ error: 'No customer found for this email' });
    }

    let bestMatch = null;
    for (const customer of customers.data) {
      const subs = await stripe.subscriptions.list({ customer: customer.id, limit: 20 });
      for (const sub of subs.data) {
        const statusPriority = {
          active: 4,
          trialing: 3,
          past_due: 2,
          unpaid: 1,
          canceled: 0,
          incomplete: 0,
          incomplete_expired: 0
        };
        const priority = statusPriority[sub.status] ?? 0;
        const periodEnd = sub.current_period_end || 0;
        if (
          !bestMatch ||
          priority > bestMatch.priority ||
          (priority === bestMatch.priority && periodEnd > bestMatch.periodEnd)
        ) {
          bestMatch = {
            customer,
            subscription: sub,
            priority,
            periodEnd
          };
        }
      }
    }

    if (!bestMatch || !bestMatch.subscription) {
      return res.status(404).json({ error: 'No subscription found for this email' });
    }

    // Link Stripe objects to this extension user so future webhooks map correctly.
    await stripe.customers.update(bestMatch.customer.id, {
      metadata: {
        ...(bestMatch.customer.metadata || {}),
        userId: finalUserId
      }
    });
    await stripe.subscriptions.update(bestMatch.subscription.id, {
      metadata: {
        ...(bestMatch.subscription.metadata || {}),
        userId: finalUserId
      }
    });

    await SubscriptionModel.updateSubscription(finalUserId, {
      stripe_customer_id: bestMatch.customer.id,
      stripe_subscription_id: bestMatch.subscription.id,
      status: bestMatch.subscription.status,
      current_period_start: bestMatch.subscription.current_period_start,
      current_period_end: bestMatch.subscription.current_period_end
    });

    const hasActiveSubscription =
      bestMatch.subscription.status === 'active' || bestMatch.subscription.status === 'trialing';

    res.json({
      recovered: true,
      userId: finalUserId,
      customerId: bestMatch.customer.id,
      subscriptionId: bestMatch.subscription.id,
      status: bestMatch.subscription.status,
      hasActiveSubscription,
      currentPeriodEnd: bestMatch.subscription.current_period_end
        ? new Date(bestMatch.subscription.current_period_end * 1000).toISOString()
        : null
    });
  } catch (error) {
    console.error('Error recovering subscription by email:', error);
    res.status(400).json({
      error: 'Failed to recover subscription',
      message: error.message
    });
  }
});

// Create a new subscription
router.post('/create', async (req, res) => {
  try {
    const { paymentMethodId, email, userId } = req.body;

    if (!paymentMethodId || !email) {
      return res.status(400).json({ 
        error: 'Missing required fields: paymentMethodId and email' 
      });
    }

    // Generate userId if not provided (for anonymous users)
    const finalUserId = userId || uuidv4();

    // Ensure user exists in database
    await SubscriptionModel.createUser(finalUserId);

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: email,
      payment_method: paymentMethodId,
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
      metadata: {
        userId: finalUserId
      }
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{
        price: process.env.STRIPE_PRICE_ID,
      }],
      payment_behavior: 'default_incomplete',
      payment_settings: { 
        save_default_payment_method: 'on_subscription' 
      },
      expand: ['latest_invoice.payment_intent'],
    });

    // Update database with Stripe information
    await SubscriptionModel.updateSubscription(finalUserId, {
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end
    });

    const response = {
      subscriptionId: subscription.id,
      customerId: customer.id,
      userId: finalUserId,
      status: subscription.status,
      clientSecret: subscription.latest_invoice.payment_intent?.client_secret
    };

    // If payment requires action (3D Secure, etc.)
    if (subscription.latest_invoice.payment_intent?.status === 'requires_action') {
      response.requiresAction = true;
    }

    res.json(response);

  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(400).json({ 
      error: 'Failed to create subscription', 
      message: error.message 
    });
  }
});

// Get subscription status
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get user from database
    const userSubscription = await SubscriptionModel.getUserSubscription(userId);
    
    if (!userSubscription) {
      // Create new user if doesn't exist
      await SubscriptionModel.createUser(userId);
      return res.json({
        userId: userId,
        status: 'inactive',
        translationCount: 0,
        hasActiveSubscription: false,
        canTranslate: true, // First 50 are free
        remainingFreeTranslations: 50
      });
    }

    let hasActiveSubscription = false;
    let stripeSubscription = null;

    // If user has a Stripe subscription, check its current status
    if (userSubscription.stripe_subscription_id) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(
          userSubscription.stripe_subscription_id
        );
        
        // Update local database if status changed
        if (stripeSubscription.status !== userSubscription.status) {
          await SubscriptionModel.updateSubscription(userId, {
            status: stripeSubscription.status,
            current_period_start: stripeSubscription.current_period_start,
            current_period_end: stripeSubscription.current_period_end
          });
        }
        
        hasActiveSubscription = stripeSubscription.status === 'active';
      } catch (stripeError) {
        console.error('Error fetching Stripe subscription:', stripeError);
        // Continue with database data if Stripe is unavailable
      }
    }

    const translationCount = userSubscription.translation_count || 0;
    const canTranslate = hasActiveSubscription || translationCount < 50;
    const remainingFreeTranslations = Math.max(0, 50 - translationCount);

    res.json({
      userId: userId,
      status: stripeSubscription?.status || userSubscription.status,
      translationCount: translationCount,
      hasActiveSubscription: hasActiveSubscription,
      canTranslate: canTranslate,
      remainingFreeTranslations: remainingFreeTranslations,
      subscriptionId: userSubscription.stripe_subscription_id,
      currentPeriodEnd: userSubscription.current_period_end ? 
        new Date(userSubscription.current_period_end * 1000).toISOString() : null
    });

  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({ 
      error: 'Failed to get subscription status', 
      message: error.message 
    });
  }
});

// Cancel subscription
router.post('/cancel', async (req, res) => {
  try {
    const { userId, subscriptionId } = req.body;

    if (!userId || !subscriptionId) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId and subscriptionId' 
      });
    }

    // Verify user owns this subscription
    const userSubscription = await SubscriptionModel.getUserSubscription(userId);
    if (!userSubscription || userSubscription.stripe_subscription_id !== subscriptionId) {
      return res.status(403).json({ error: 'Subscription not found or unauthorized' });
    }

    // Cancel subscription in Stripe
    const canceledSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    // Update database
    await SubscriptionModel.updateSubscription(userId, {
      status: canceledSubscription.status
    });

    res.json({
      success: true,
      subscriptionId: subscriptionId,
      status: canceledSubscription.status,
      cancelAtPeriodEnd: canceledSubscription.cancel_at_period_end,
      currentPeriodEnd: new Date(canceledSubscription.current_period_end * 1000).toISOString()
    });

  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(400).json({ 
      error: 'Failed to cancel subscription', 
      message: error.message 
    });
  }
});

// Track translation usage
router.post('/track-usage', async (req, res) => {
  try {
    const { userId, translationData } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Ensure user exists
    await SubscriptionModel.createUser(userId);

    // Get current user status
    const userSubscription = await SubscriptionModel.getUserSubscription(userId);
    
    // Check if user can translate
    const hasActiveSubscription = userSubscription?.status === 'active';
    const translationCount = userSubscription?.translation_count || 0;
    
    if (!hasActiveSubscription && translationCount >= 50) {
      return res.status(403).json({ 
        error: 'Translation limit reached', 
        message: 'Please subscribe to continue translating',
        translationCount: translationCount,
        limit: 50
      });
    }

    // Log the translation and increment count
    await SubscriptionModel.logTranslation(userId, translationData || {});
    await SubscriptionModel.incrementTranslationCount(userId);

    // Get updated stats
    const updatedUser = await SubscriptionModel.getUserSubscription(userId);
    const remainingFreeTranslations = hasActiveSubscription ? 
      null : Math.max(0, 50 - (updatedUser.translation_count || 0));

    res.json({
      success: true,
      translationCount: updatedUser.translation_count,
      hasActiveSubscription: hasActiveSubscription,
      remainingFreeTranslations: remainingFreeTranslations
    });

  } catch (error) {
    console.error('Error tracking usage:', error);
    res.status(500).json({ 
      error: 'Failed to track usage', 
      message: error.message 
    });
  }
});

// Get user usage statistics
router.get('/usage/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const userSubscription = await SubscriptionModel.getUserSubscription(userId);
    const usageStats = await SubscriptionModel.getUserUsageStats(userId);

    if (!userSubscription) {
      return res.json({
        userId: userId,
        totalTranslations: 0,
        last30Days: 0,
        hasActiveSubscription: false,
        remainingFreeTranslations: 50
      });
    }

    const hasActiveSubscription = userSubscription.status === 'active';
    const remainingFreeTranslations = hasActiveSubscription ? 
      null : Math.max(0, 50 - (userSubscription.translation_count || 0));

    res.json({
      userId: userId,
      totalTranslations: usageStats.total_translations || 0,
      last30Days: usageStats.last_30_days || 0,
      hasActiveSubscription: hasActiveSubscription,
      remainingFreeTranslations: remainingFreeTranslations,
      subscriptionStatus: userSubscription.status
    });

  } catch (error) {
    console.error('Error getting usage stats:', error);
    res.status(500).json({ 
      error: 'Failed to get usage statistics', 
      message: error.message 
    });
  }
});

module.exports = router;
