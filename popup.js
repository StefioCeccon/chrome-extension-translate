document.addEventListener('DOMContentLoaded', function() {
  // Load saved settings and usage data
  loadSettings();
  loadUsageData();
  
  // Add event listeners
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('upgradeButton').addEventListener('click', handleUpgrade);
});

function loadSettings() {
  chrome.storage.sync.get(['targetLang', 'autoTranslate'], function(result) {
    if (result.targetLang) {
      document.getElementById('targetLang').value = result.targetLang;
    }
    if (result.autoTranslate !== undefined) {
      document.getElementById('autoTranslate').checked = result.autoTranslate;
    } else {
      // Default to true if not set
      document.getElementById('autoTranslate').checked = true;
    }
  });
}

function loadUsageData() {
  chrome.storage.sync.get(['translationCount', 'subscriptionStatus', 'subscriptionExpiry'], function(result) {
    const count = result.translationCount || 0;
    const isSubscribed = result.subscriptionStatus === 'active';
    const expiry = result.subscriptionExpiry;
    
    updateUsageDisplay(count, isSubscribed, expiry);
  });
}

function updateUsageDisplay(count, isSubscribed, expiry) {
  const usageCount = document.getElementById('usageCount');
  const progressFill = document.getElementById('progressFill');
  const upgradeButton = document.getElementById('upgradeButton');
  const subscriptionInfo = document.getElementById('subscriptionInfo');
  const subscriptionStatus = document.getElementById('subscriptionStatus');
  
  // Update usage count
  usageCount.textContent = count;
  
  // Update progress bar
  const percentage = Math.min((count / 100) * 100, 100);
  progressFill.style.width = percentage + '%';
  
  // Show/hide upgrade button based on usage and subscription status
  if (count >= 100 && !isSubscribed) {
    upgradeButton.style.display = 'block';
    subscriptionInfo.innerHTML = '<strong>Free limit reached!</strong> Upgrade to continue translating.';
  } else if (isSubscribed) {
    upgradeButton.style.display = 'none';
    const expiryDate = new Date(expiry);
    const formattedDate = expiryDate.toLocaleDateString();
    subscriptionInfo.innerHTML = `<strong>Premium Active</strong> - Expires: ${formattedDate}`;
    subscriptionStatus.textContent = 'You have unlimited translations!';
    subscriptionStatus.style.display = 'block';
  } else {
    upgradeButton.style.display = 'none';
    const remaining = Math.max(0, 100 - count);
    subscriptionInfo.innerHTML = `<strong>${remaining} free messages remaining</strong>`;
  }
  
  // Change progress bar color based on usage
  if (count >= 90) {
    progressFill.style.backgroundColor = '#dc3545'; // Red when close to limit
  } else if (count >= 70) {
    progressFill.style.backgroundColor = '#ffc107'; // Yellow when getting close
  } else {
    progressFill.style.backgroundColor = '#4285f4'; // Blue for normal usage
  }
}

function saveSettings() {
  const targetLang = document.getElementById('targetLang').value;
  const autoTranslate = document.getElementById('autoTranslate').checked;
  
  chrome.storage.sync.set({
    targetLang: targetLang,
    autoTranslate: autoTranslate
  }, function() {
    showStatus('Settings saved successfully!', 'success');
    
    // Send message to content script to update settings
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateSettings',
        settings: { targetLang, autoTranslate }
      });
    });
  });
}

async function handleUpgrade() {
  const upgradeButton = document.getElementById('upgradeButton');
  upgradeButton.textContent = 'Processing...';
  upgradeButton.disabled = true;
  
  try {
    // In a real implementation, this would integrate with Stripe or another payment processor
    // For now, we'll simulate a successful subscription
    const subscriptionData = {
      subscriptionStatus: 'active',
      subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      subscriptionStart: new Date().toISOString()
    };
    
    // Save subscription data
    chrome.storage.sync.set(subscriptionData, function() {
      showStatus('Subscription activated successfully!', 'success');
      
      // Reload usage data to update display
      loadUsageData();
      
      // Reset button
      upgradeButton.textContent = 'Upgrade to Premium - $0.99/month';
      upgradeButton.disabled = false;
    });
    
  } catch (error) {
    showStatus('Upgrade failed: ' + error.message, 'error');
    upgradeButton.textContent = 'Upgrade to Premium - $0.99/month';
    upgradeButton.disabled = false;
  }
}

async function testConnection() {
  showStatus('Testing connection...', 'success');
  
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer YOUR_OPENAI_API_KEY_HERE`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      showStatus('Connection successful! API key is valid.', 'success');
    } else {
      showStatus('Connection failed. Please check your API key.', 'error');
    }
  } catch (error) {
    showStatus('Connection error: ' + error.message, 'error');
  }
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
  
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}
