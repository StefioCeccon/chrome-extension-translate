let paymentManager = null;
let paymentFormMode = 'checkout'; // checkout | recover

document.addEventListener('DOMContentLoaded', function() {
  // Load saved settings and usage data
  loadSettings();
  loadUsageData();
  initializePaymentManager();
  refreshSubscriptionStatusIfNeeded();
  
  // Add event listeners
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('upgradeButton').addEventListener('click', handleUpgrade);
  document.getElementById('confirmUpgradeButton').addEventListener('click', handleConfirmUpgrade);
  document.getElementById('cancelUpgradeButton').addEventListener('click', hidePaymentForm);
  document.getElementById('restorePremiumButton').addEventListener('click', handleRestorePremiumByEmail);
  document.getElementById('recoverSubscriptionButton').addEventListener('click', handleRecoverSubscription);
  document.getElementById('sendRecoveryCodeButton').addEventListener('click', handleSendRecoveryCode);
  document.getElementById('verifyRecoveryCodeButton').addEventListener('click', handleVerifyRecoveryCode);
  document.getElementById('cancelRecoveryButton').addEventListener('click', hidePaymentForm);
  document.getElementById('cancelSubscriptionButton').addEventListener('click', handleCancelAtPeriodEnd);
});

async function refreshSubscriptionStatusIfNeeded() {
  try {
    const localState = await chrome.storage.sync.get(['subscriptionStatus', 'subscriptionId', 'billingEmail']);
    const shouldRefresh =
      localState.subscriptionStatus === 'active' || !!localState.subscriptionId;
    if (!paymentManager) return;

    // Give PaymentManager a brief moment to initialize userId/Stripe internals.
    for (let i = 0; i < 20; i++) {
      if (paymentManager.userId) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (shouldRefresh) {
      const statusData = await paymentManager.getSubscriptionStatus();
      await chrome.storage.sync.set({
        subscriptionStatus: statusData.status || 'inactive',
        subscriptionExpiry: statusData.currentPeriodEnd || null,
        translationCount: statusData.translationCount || 0,
        subscriptionId: statusData.subscriptionId || localState.subscriptionId || null
      });
    } else if (localState.billingEmail) {
      // Auto-recover after reinstall if we still know the billing email.
      try {
        const recovered = await paymentManager.getSubscriptionStatus();
        await chrome.storage.sync.set({
          subscriptionStatus: recovered.status || 'inactive',
          subscriptionExpiry: recovered.currentPeriodEnd || null,
          subscriptionId: recovered.subscriptionId || null
        });
      } catch (recoverError) {
        console.warn('Popup: Auto-recover skipped:', recoverError.message);
      }
    }

    loadUsageData();
  } catch (error) {
    console.warn('Popup: Could not refresh subscription status on load:', error.message);
  }
}

function initializePaymentManager() {
  if (typeof window.PaymentManager !== 'function') {
    console.error('PaymentManager is not available');
    return;
  }
  paymentManager = new window.PaymentManager();
}

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
  const cancelSubscriptionButton = document.getElementById('cancelSubscriptionButton');
  const restorePremiumButton = document.getElementById('restorePremiumButton');
  
  // Update usage count
  usageCount.textContent = count;
  
  // Update progress bar
  const percentage = Math.min((count / 50) * 100, 100);
  progressFill.style.width = percentage + '%';
  
  // Show/hide upgrade button based on usage and subscription status
  if (count >= 50 && !isSubscribed) {
    upgradeButton.style.display = 'block';
    restorePremiumButton.style.display = 'block';
    cancelSubscriptionButton.style.display = 'none';
    subscriptionInfo.innerHTML = '<strong>Free limit reached!</strong> Upgrade to continue translating.';
    subscriptionStatus.style.display = 'none';
  } else if (isSubscribed) {
    upgradeButton.style.display = 'none';
    restorePremiumButton.style.display = 'none';
    cancelSubscriptionButton.style.display = 'block';
    hidePaymentForm();
    const expiryDate = new Date(expiry);
    const formattedDate = expiryDate.toLocaleDateString();
    subscriptionInfo.innerHTML = `<strong>Premium Active</strong> - Expires: ${formattedDate}`;
    subscriptionStatus.textContent = 'You have unlimited translations!';
    subscriptionStatus.style.display = 'block';
  } else {
    upgradeButton.style.display = 'none';
    restorePremiumButton.style.display = 'block';
    cancelSubscriptionButton.style.display = 'none';
    hidePaymentForm();
    const remaining = Math.max(0, 50 - count);
    subscriptionInfo.innerHTML = `<strong>${remaining} free messages remaining</strong>`;
    subscriptionStatus.style.display = 'none';
  }
  
  // Change progress bar color based on usage
  if (count >= 45) {
    progressFill.style.backgroundColor = '#dc3545'; // Red when close to limit
  } else if (count >= 70) {
    progressFill.style.backgroundColor = '#ffc107'; // Yellow when getting close
  } else {
    progressFill.style.backgroundColor = '#4285f4'; // Blue for normal usage
  }
}

function handleRestorePremiumByEmail() {
  showPaymentForm('recover');
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
  const form = document.getElementById('paymentForm');
  if (form.style.display === 'block' && paymentFormMode === 'checkout') {
    hidePaymentForm();
    return;
  }
  showPaymentForm('checkout');
}

function hidePaymentForm() {
  const form = document.getElementById('paymentForm');
  form.style.display = 'none';
  document.getElementById('recoveryCode').value = '';
}

function showPaymentForm(mode) {
  paymentFormMode = mode;
  const form = document.getElementById('paymentForm');
  const checkoutActions = document.getElementById('checkoutActions');
  const recoverActions = document.getElementById('recoverActions');
  const recoverToggle = document.getElementById('recoverSubscriptionButton');

  form.style.display = 'block';
  if (mode === 'recover') {
    checkoutActions.classList.add('hidden');
    recoverActions.classList.remove('hidden');
    recoverToggle.classList.add('hidden');
  } else {
    checkoutActions.classList.remove('hidden');
    recoverActions.classList.add('hidden');
    recoverToggle.classList.remove('hidden');
  }
}

async function handleConfirmUpgrade() {
  const confirmButton = document.getElementById('confirmUpgradeButton');
  const email = document.getElementById('billingEmail').value.trim();

  if (!email) {
    showStatus('Please enter your billing email.', 'error');
    return;
  }
  if (!paymentManager) {
    showStatus('Payment manager is not ready.', 'error');
    return;
  }

  confirmButton.textContent = 'Processing payment...';
  confirmButton.disabled = true;
  try {
    await paymentManager.createSubscription(email);
    await chrome.storage.sync.set({ billingEmail: email });
    showStatus('Checkout opened in a new tab. Complete payment, then reopen popup to sync status.', 'success');
    hidePaymentForm();
  } catch (error) {
    showStatus(`Payment failed: ${error.message}`, 'error');
  } finally {
    confirmButton.textContent = 'Continue to secure checkout';
    confirmButton.disabled = false;
  }
}

async function handleRecoverSubscription() {
  showPaymentForm('recover');
}

async function handleSendRecoveryCode() {
  const email = document.getElementById('billingEmail').value.trim();
  if (!email) {
    showStatus('Enter your subscription email to recover access.', 'error');
    return;
  }
  if (!paymentManager) {
    showStatus('Payment manager is not ready.', 'error');
    return;
  }

  const sendButton = document.getElementById('sendRecoveryCodeButton');
  sendButton.textContent = 'Sending...';
  sendButton.disabled = true;
  try {
    await paymentManager.startRecoverSubscriptionByEmail(email);
    await chrome.storage.sync.set({ billingEmail: email });
    showStatus('Recovery code sent. Check your email and enter the 6-digit code.', 'success');
    document.getElementById('recoveryCode').focus();
  } catch (error) {
    showStatus(`Could not send code: ${error.message}`, 'error');
  } finally {
    sendButton.textContent = 'Send recovery code';
    sendButton.disabled = false;
  }
}

async function handleVerifyRecoveryCode() {
  const email = document.getElementById('billingEmail').value.trim();
  const code = document.getElementById('recoveryCode').value.trim();
  if (!email || !code) {
    showStatus('Enter both email and code.', 'error');
    return;
  }
  if (!paymentManager) {
    showStatus('Payment manager is not ready.', 'error');
    return;
  }

  const verifyButton = document.getElementById('verifyRecoveryCodeButton');
  verifyButton.textContent = 'Verifying...';
  verifyButton.disabled = true;
  try {
    const recovered = await paymentManager.verifyRecoverSubscriptionByEmail(email, code);
    await chrome.storage.sync.set({
      billingEmail: email,
      subscriptionStatus: recovered.status || 'inactive',
      subscriptionExpiry: recovered.currentPeriodEnd || null,
      subscriptionId: recovered.subscriptionId || null
    });
    showStatus('Subscription recovered. Your premium access is restored.', 'success');
    hidePaymentForm();
    loadUsageData();
  } catch (error) {
    showStatus(`Recover failed: ${error.message}`, 'error');
  } finally {
    verifyButton.textContent = 'Verify and restore';
    verifyButton.disabled = false;
  }
}

async function handleCancelAtPeriodEnd() {
  const cancelButton = document.getElementById('cancelSubscriptionButton');
  if (!paymentManager) {
    showStatus('Payment manager is not ready.', 'error');
    return;
  }

  const { subscriptionId } = await chrome.storage.sync.get(['subscriptionId']);
  if (!subscriptionId) {
    showStatus('No active subscription found to cancel.', 'error');
    return;
  }

  cancelButton.textContent = 'Cancelling...';
  cancelButton.disabled = true;
  try {
    const result = await paymentManager.cancelSubscription(subscriptionId);
    const statusData = await paymentManager.getSubscriptionStatus();

    await chrome.storage.sync.set({
      subscriptionStatus: statusData.status || result.status || 'canceled',
      subscriptionExpiry: statusData.currentPeriodEnd || null
    });

    showStatus('Subscription will cancel at period end.', 'success');
    loadUsageData();
  } catch (error) {
    showStatus(`Cancellation failed: ${error.message}`, 'error');
  } finally {
    cancelButton.textContent = 'Cancel at Period End';
    cancelButton.disabled = false;
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
