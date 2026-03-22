const express = require('express');
const { SubscriptionModel } = require('../models/database');

const router = express.Router();

// Translation endpoint
router.post('/', async (req, res) => {
  try {
    const { text, userId, sourceLang = 'auto', targetLang = 'en' } = req.body;

    if (!text || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: text and userId' 
      });
    }

    // Check user's subscription status and usage
    let userSubscription = await SubscriptionModel.getUserSubscription(userId);
    
    // Create user if doesn't exist
    if (!userSubscription) {
      await SubscriptionModel.createUser(userId);
      userSubscription = await SubscriptionModel.getUserSubscription(userId);
    }

    const hasActiveSubscription = userSubscription?.status === 'active';
    const translationCount = userSubscription?.translation_count || 0;

    // Check if user can translate
    if (!hasActiveSubscription && translationCount >= 50) {
      return res.status(403).json({ 
        error: 'Translation limit reached', 
        message: 'Please subscribe to continue translating',
        translationCount: translationCount,
        limit: 50,
        needsSubscription: true
      });
    }

    // Call OpenAI API
    const translatedText = await translateWithOpenAI(text, sourceLang, targetLang);

    // Track usage
    await SubscriptionModel.logTranslation(userId, {
      text: text.substring(0, 100), // Store only first 100 chars for analytics
      sourceLang,
      targetLang
    });
    await SubscriptionModel.incrementTranslationCount(userId);

    // Get updated stats
    const updatedUser = await SubscriptionModel.getUserSubscription(userId);
    const remainingFreeTranslations = hasActiveSubscription ? 
      null : Math.max(0, 50 - (updatedUser.translation_count || 0));

    res.json({
      translatedText,
      originalText: text,
      sourceLang,
      targetLang,
      usage: {
        translationCount: updatedUser.translation_count,
        hasActiveSubscription: hasActiveSubscription,
        remainingFreeTranslations: remainingFreeTranslations
      }
    });

  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ 
      error: 'Translation failed', 
      message: error.message 
    });
  }
});

// OpenAI translation function
async function translateWithOpenAI(text, sourceLang, targetLang) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured in environment variables');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a translation assistant. Translate the given text to ${targetLang === 'en' ? 'English' : targetLang}. Only return the translated text, nothing else. If the text is already in the target language, return it as-is.`
        },
        {
          role: 'user',
          content: text
        }
      ],
      max_tokens: 1000,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || error.error || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() || text;
}

module.exports = router;
