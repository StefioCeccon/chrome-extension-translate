// Background service worker for the Call Subtitle Translator extension

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings on first install
    chrome.storage.sync.set({
      targetLang: 'en',
      autoTranslate: false,
      translationCount: 0,
      subscriptionStatus: 'inactive',
      subscriptionExpiry: null,
      subscriptionStart: null
    });
    
    // Open welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html')
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSettings') {
    chrome.storage.sync.get(['apiKey', 'targetLang', 'autoTranslate', 'translationCount', 'subscriptionStatus', 'subscriptionExpiry'], (result) => {
      sendResponse(result);
    });
    return true; // Keep message channel open for async response
  }
  
  if (message.action === 'updateSettings') {
    chrome.storage.sync.set(message.settings, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.action === 'incrementTranslationCount') {
    incrementTranslationCount(sender.tab.id).then((result) => {
      sendResponse(result);
    });
    return true;
  }
  
  if (message.action === 'checkTranslationLimit') {
    checkTranslationLimit().then((result) => {
      sendResponse(result);
    });
    return true;
  }
});

// Function to increment translation count
async function incrementTranslationCount(tabId) {
  try {
    const result = await chrome.storage.sync.get(['translationCount', 'subscriptionStatus', 'subscriptionExpiry']);
    let count = result.translationCount || 0;
    const isSubscribed = result.subscriptionStatus === 'active';
    const expiry = result.subscriptionExpiry;
    
    // Check if subscription is expired
    if (isSubscribed && expiry && new Date(expiry) < new Date()) {
      // Subscription expired, reset to inactive
      await chrome.storage.sync.set({
        subscriptionStatus: 'inactive',
        subscriptionExpiry: null
      });
      
      // Send notification to user
      chrome.tabs.sendMessage(tabId, {
        action: 'subscriptionExpired',
        message: 'Your subscription has expired. Please renew to continue translating.'
      });
      
      return { success: true, count: count, canTranslate: count < 100 };
    }
    
    // Only increment count if not subscribed
    if (!isSubscribed) {
      count++;
      await chrome.storage.sync.set({ translationCount: count });
    }
    
    return { success: true, count: count, canTranslate: isSubscribed || count < 100 };
  } catch (error) {
    console.error('Error incrementing translation count:', error);
    return { success: false, error: error.message };
  }
}

// Function to check if user can still translate
async function checkTranslationLimit() {
  try {
    const result = await chrome.storage.sync.get(['translationCount', 'subscriptionStatus', 'subscriptionExpiry']);
    const count = result.translationCount || 0;
    const isSubscribed = result.subscriptionStatus === 'active';
    const expiry = result.subscriptionExpiry;
    
    // Check if subscription is expired
    if (isSubscribed && expiry && new Date(expiry) < new Date()) {
      await chrome.storage.sync.set({
        subscriptionStatus: 'inactive',
        subscriptionExpiry: null
      });
      return { canTranslate: count < 100, count: count, isSubscribed: false };
    }
    
    return { canTranslate: isSubscribed || count < 100, count: count, isSubscribed: isSubscribed };
  } catch (error) {
    console.error('Error checking translation limit:', error);
    return { canTranslate: false, error: error.message };
  }
}

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup automatically due to manifest configuration
  // But we can also handle additional logic here if needed
});

// Listen for tab updates to potentially inject content script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if this is a video call platform
    const videoCallPlatforms = [
      'meet.google.com',
      'zoom.us',
      'teams.microsoft.com',
      'webex.com',
      'discord.com',
      'skype.com'
    ];
    
    const isVideoCallPlatform = videoCallPlatforms.some(platform => 
      tab.url.includes(platform)
    );
    
    if (isVideoCallPlatform) {
      // Check if content script is already injected to avoid duplicates
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          return window.subtitleTranslatorInstance ? true : false;
        }
      }).then((results) => {
        const isAlreadyInjected = results[0]?.result;
        
        if (!isAlreadyInjected) {
          console.log('SubtitleTranslator: Injecting content script into tab', tabId);
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          }).catch((error) => {
            console.log('SubtitleTranslator: Error injecting script:', error);
          });
        } else {
          console.log('SubtitleTranslator: Content script already exists in tab', tabId);
        }
      }).catch((error) => {
        console.log('SubtitleTranslator: Error checking script injection:', error);
      });
    }
  }
});
