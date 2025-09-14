class SubtitleTranslator {
  constructor() {
    this.isEnabled = false;
    this.settings = {};
    this.observer = null;
    this.translatedElements = new WeakSet();
    this.lastTranslationTime = 0;
    this.translationQueue = [];
    this.isProcessingQueue = false;
    this.pendingTranslations = new Map();
    this.translationDebounceDelay = 2000; // 2 seconds
    this.processedTexts = new Set();
    this.periodicScanInterval = null;
    this.cleanupInterval = null;
    this.canTranslate = true; // Track if user can still translate
    
    this.init();
  }
  
  async init() {
    await this.loadSettings();
    await this.checkTranslationLimit();
    
    console.log('SubtitleTranslator: Init completed, isEnabled:', this.isEnabled, 'canTranslate:', this.canTranslate);
    
    if (this.isEnabled && this.canTranslate) {
      this.startObserving();
      // Force an initial scan to see what's available
      setTimeout(() => {
        console.log('SubtitleTranslator: Performing initial scan...');
        this.scanForSubtitles(document.body);
      }, 1000);
    } else {
      console.log('SubtitleTranslator: Extension not enabled or translation limit reached, checking why...');
      console.log('SubtitleTranslator: Settings:', this.settings);
      console.log('SubtitleTranslator: API Key present:', !!this.settings.apiKey);
      console.log('SubtitleTranslator: Auto Translate:', this.settings.autoTranslate);
      console.log('SubtitleTranslator: Can Translate:', this.canTranslate);
    }
    
    // Set up periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.clearProcessedTextCache();
      // Also try to scan periodically even if not enabled
      if (this.isEnabled && this.canTranslate) {
        console.log('SubtitleTranslator: Periodic scan...');
        this.scanForSubtitles(document.body);
      }
    }, 30000); // Every 30 seconds
  }
  
  async checkTranslationLimit() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'checkTranslationLimit' });
      this.canTranslate = response.canTranslate;
      console.log('SubtitleTranslator: Translation limit check result:', response);
      
      if (!this.canTranslate) {
        this.showLimitReachedMessage();
      }
    } catch (error) {
      console.error('SubtitleTranslator: Error checking translation limit:', error);
      this.canTranslate = false;
    }
  }
  
  showLimitReachedMessage() {
    // Create a notification that the free limit has been reached
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #dc3545;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      max-width: 300px;
    `;
    
    notification.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">Free Translation Limit Reached</div>
      <div style="margin-bottom: 12px;">You've used all 100 free translations. Upgrade to Premium for unlimited translations!</div>
      <button id="upgradeNow" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; width: 100%;">
        Upgrade Now - $0.99/month
      </button>
    `;
    
    document.body.appendChild(notification);
    
    // Add click handler for upgrade button
    document.getElementById('upgradeNow').addEventListener('click', () => {
      // Open popup to handle upgrade
      chrome.runtime.sendMessage({ action: 'openPopup' });
      notification.remove();
    });
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 10000);
  }
  
  clearProcessedTextCache() {
    this.processedTexts.clear();
    console.log('SubtitleTranslator: Cleared processed text cache');
  }
  
  isTranslatedByExtension(textNode) {
    // Check if this text node or its parent elements were translated by the extension
    let currentNode = textNode;
    
    while (currentNode && currentNode !== document.body) {
      if (currentNode._isTranslatedByExtension) {
        // Check if the translation is recent (within last 5 minutes)
        const translationAge = Date.now() - (currentNode._translationTimestamp || 0);
        if (translationAge < 300000) { // 5 minutes
          return true;
        }
      }
      currentNode = currentNode.parentNode;
    }
    
    return false;
  }
  
  restoreAllOriginalText() {
    // Restore all translated text to original
    let restoredCount = 0;
    
    // Find all elements with translation flags
    const allElements = document.querySelectorAll('*');
    allElements.forEach(element => {
      if (element._isTranslatedByExtension) {
        if (this.restoreOriginalText(element)) {
          restoredCount++;
        }
      }
    });
    
    console.log(`SubtitleTranslator: Restored ${restoredCount} elements to original text`);
  }
  
  async loadSettings() {
    // Hardcoded API key for immediate use
    this.settings = {
      apiKey: 'YOUR_OPENAI_API_KEY_HERE', // Replace with your actual API key
      targetLang: 'en',
      autoTranslate: false
    };
    
    this.isEnabled = this.settings.apiKey && this.settings.autoTranslate;
    console.log('SubtitleTranslator: Using hardcoded settings:', this.settings);
    console.log('SubtitleTranslator: Is enabled:', this.isEnabled);
    
    // Resolve immediately since we're not waiting for storage
    return Promise.resolve();
  }
  
  // Settings are now hardcoded, no need for updates
  updateSettings(newSettings) {
    console.log('SubtitleTranslator: Updating settings:', newSettings);
    
    // Update user-configurable settings
    if (newSettings.targetLang) {
      this.settings.targetLang = newSettings.targetLang;
      console.log('SubtitleTranslator: Updated target language to:', newSettings.targetLang);
    }
    
    if (newSettings.autoTranslate !== undefined) {
      this.settings.autoTranslate = newSettings.autoTranslate;
      console.log('SubtitleTranslator: Updated auto-translate to:', newSettings.autoTranslate);
      
      // Update the enabled state based on auto-translate setting
      this.isEnabled = this.settings.apiKey && this.settings.autoTranslate;
      
      if (this.isEnabled && this.canTranslate) {
        this.startObserving();
        console.log('SubtitleTranslator: Started observing (auto-translate enabled)');
      } else {
        this.stopObserving();
        console.log('SubtitleTranslator: Stopped observing (auto-translate disabled or limit reached)');
      }
    }
  }
  
  startObserving() {
    if (this.observer) {
      this.observer.disconnect();
    }
    
    // Start observing DOM changes
    this.observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      
      mutations.forEach((mutation) => {
        // Check if any caption-related changes occurred
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if this is a caption-related change
              if (this.isCaptionRelatedChange(node)) {
                shouldScan = true;
              }
            }
          });
        }
        
        // Also check for text content changes in existing caption elements
        if (mutation.type === 'characterData') {
          const captionContainer = this.findCaptionContainer(mutation.target);
          if (captionContainer) {
            shouldScan = true;
          }
        }
        
        // Check for new text nodes added to caption containers
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
              const captionContainer = this.findCaptionContainer(node);
              if (captionContainer) {
                console.log('SubtitleTranslator: New text node detected in captions:', node.textContent.trim());
                shouldScan = true;
              }
            }
          });
        }
      });
      
      // If caption-related changes occurred, scan for new content
      if (shouldScan) {
        console.log('SubtitleTranslator: Caption changes detected, scanning for new content...');
        setTimeout(() => {
          this.scanForSubtitles(document.body);
        }, 500); // Small delay to ensure DOM is stable
      }
    });
    
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Also do a periodic scan as backup
    this.periodicScanInterval = setInterval(() => {
      if (this.isEnabled && this.canTranslate) {
        this.scanForSubtitles(document.body);
      }
    }, 3000); // Every 3 seconds
    
    console.log('SubtitleTranslator: Started observing DOM changes');
  }
  
  stopObserving() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    if (this.periodicScanInterval) {
      clearInterval(this.periodicScanInterval);
      this.periodicScanInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Clear any pending translations
    this.pendingTranslations.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.pendingTranslations.clear();
    
    console.log('SubtitleTranslator: Stopped observing DOM changes');
  }
  
  isCaptionRelatedChange(node) {
    // Check if a node change is related to captions
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Check if the node itself is a caption container
      if (this.isCaptionContainer(node)) {
        return true;
      }
      
      // Check if any of its children are caption containers
      const captionChildren = node.querySelectorAll('[aria-label="Captions"], [aria-label="Subtitles"]');
      if (captionChildren.length > 0) {
        return true;
      }
    }
    
    return false;
  }
  
  findCaptionContainer(node) {
    // Find the nearest caption container for a given node
    let currentNode = node;
    
    while (currentNode && currentNode !== document.body) {
      if (this.isCaptionContainer(currentNode)) {
        return currentNode;
      }
      currentNode = currentNode.parentNode;
    }
    
    return null;
  }
  
  isCaptionContainer(element) {
    // Check if an element is a caption container
    if (element.nodeType !== Node.ELEMENT_NODE) return false;
    
    // Check for common caption container attributes and classes
    const hasCaptionLabel = element.getAttribute('aria-label') === 'Captions' || 
                           element.getAttribute('aria-label') === 'Subtitles';
    const hasCaptionClass = element.classList.contains('ZPyPXe') || 
                           element.classList.contains('ygicle') ||
                           element.classList.contains('VbkSUe');
    
    return hasCaptionLabel || hasCaptionClass;
  }
  
  scanForSubtitles(rootElement) {
    console.log('SubtitleTranslator: scanForSubtitles called, isEnabled:', this.isEnabled, 'canTranslate:', this.canTranslate);
    
    if (!this.isEnabled || !this.canTranslate) {
      console.log('SubtitleTranslator: Extension not enabled or translation limit reached, skipping scan');
      return;
    }
    
    try {
      // Look for caption containers specifically
      const captionSelectors = [
        '[aria-label="Captions"]',
        '[aria-label="Subtitles"]',
        '.ZPyPXe',
        '.ygicle',
        '.VbkSUe'
      ];
      
      console.log('SubtitleTranslator: Looking for caption elements with selectors:', captionSelectors);
      
      const captionElements = rootElement.querySelectorAll(captionSelectors.join(', '));
      console.log('SubtitleTranslator: Found', captionElements.length, 'caption elements');
      
      if (captionElements.length > 0) {
        // Scan within caption containers
        this.scanTextNodesInCaptions(captionElements);
      } else {
        console.log('SubtitleTranslator: No caption containers found, trying fallback scan');
        // Fallback to general scanning if no caption containers found
        this.scanTextNodes(rootElement);
      }
    } catch (error) {
      console.error('SubtitleTranslator: Error scanning for subtitles:', error);
    }
  }
  
  scanTextNodesInCaptions(captionElements) {
    // Scan for text nodes specifically within caption containers
    console.log('SubtitleTranslator: Scanning', captionElements.length, 'caption containers for text nodes');
    
    captionElements.forEach((container, index) => {
      console.log(`SubtitleTranslator: Caption container ${index}:`, container);
      console.log('SubtitleTranslator: Container text content:', container.textContent.substring(0, 100) + '...');
      
      // Scan for text nodes within this caption container
      this.scanTextNodesInContainer(container);
    });
  }
  
  scanTextNodesInContainer(container) {
    // Limit text node scanning within each container
    let nodeCount = 0;
    const maxNodesPerContainer = 10; // Much lower limit per container
    
    try {
      console.log('SubtitleTranslator: Scanning container:', container);
      console.log('SubtitleTranslator: Container HTML:', container.outerHTML.substring(0, 200) + '...');
      
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            try {
              // Skip if we've processed too many nodes in this container
              if (nodeCount >= maxNodesPerContainer) {
                return NodeFilter.FILTER_REJECT;
              }
              
              // Look for text that might be subtitles (short phrases, likely in another language)
              const text = node.textContent.trim();
              
              console.log('SubtitleTranslator: Checking text node:', text.substring(0, 50) + '...');
              
              // Check if this text needs translation
              const needsTranslation = this.needsTranslation(node, text);
              
              if (needsTranslation) {
                nodeCount++;
                console.log('SubtitleTranslator: Accepting text node for translation:', text);
                return NodeFilter.FILTER_ACCEPT;
              } else {
                console.log('SubtitleTranslator: Rejecting text node:', text, 'Reason:', {
                  length: text.length,
                  isCommonUI: this.isCommonUI(text),
                  looksLikeCaption: this.looksLikeCaptionText(text),
                  isTranslatedByExtension: this.isTranslatedByExtension(node),
                  needsTranslation: needsTranslation
                });
              }
              return NodeFilter.FILTER_REJECT;
            } catch (error) {
              console.error('SubtitleTranslator: Error in acceptNode callback:', error);
              return NodeFilter.FILTER_REJECT;
            }
          }
        }
      );
      
      let node;
      let processedCount = 0;
      while (node = walker.nextNode()) {
        try {
          this.processTextNode(node);
          processedCount++;
        } catch (error) {
          console.error('SubtitleTranslator: Error processing text node:', error);
        }
      }
      
      console.log(`SubtitleTranslator: Processed ${processedCount} text nodes in container`);
    } catch (error) {
      console.error('SubtitleTranslator: Error scanning container:', error);
    }
  }
  
  scanTextNodes(rootElement) {
    // Legacy method - now only used for backward compatibility
    // Most text node scanning is now done through scanTextNodesInCaptions
    if (!this.isEnabled || !this.canTranslate) return;
    
    try {
      // Only scan if no caption containers are found
      const hasCaptionContainers = rootElement.querySelector('[aria-label="Captions"], [aria-label="Subtitles"]');
      if (hasCaptionContainers) {
        return; // Use the more specific caption scanning instead
      }
      
      // Fallback to general text node scanning (limited)
      let nodeCount = 0;
      const maxNodes = 20; // Reduced limit
      
      const walker = document.createTreeWalker(
        rootElement,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            try {
              if (nodeCount >= maxNodes) {
                return NodeFilter.FILTER_REJECT;
              }
              
              const text = node.textContent.trim();
              if (this.needsTranslation(node, text)) {
                nodeCount++;
                return NodeFilter.FILTER_ACCEPT;
              }
              return NodeFilter.FILTER_REJECT;
            } catch (error) {
              console.error('SubtitleTranslator: Error in fallback acceptNode callback:', error);
              return NodeFilter.FILTER_REJECT;
            }
          }
        }
      );
      
      let node;
      while (node = walker.nextNode()) {
        try {
          this.processTextNode(node);
        } catch (error) {
          console.error('SubtitleTranslator: Error processing fallback text node:', error);
        }
      }
    } catch (error) {
      console.error('SubtitleTranslator: Error in fallback text node scanning:', error);
    }
  }
  
  isCommonUI(text) {
    // Filter out common UI text that's not worth translating
    const commonUITexts = [
      'loading', 'error', 'success', 'cancel', 'save', 'delete', 'edit', 'add',
      'search', 'filter', 'sort', 'refresh', 'close', 'open', 'next', 'previous',
      'submit', 'reset', 'confirm', 'back', 'forward', 'home', 'menu', 'settings',
      'profile', 'logout', 'login', 'register', 'password', 'username', 'email',
      'phone', 'address', 'name', 'title', 'description', 'content', 'message',
      'notification', 'alert', 'warning', 'info', 'help', 'support', 'contact'
    ];
    
    const lowerText = text.toLowerCase().trim();
    return commonUITexts.some(uiText => lowerText.includes(uiText));
  }
  
  looksLikeCaptionText(text) {
    // Much stricter filtering for caption text - only accept actual speech
    const trimmedText = text.trim();
    
    // Skip very short text (likely UI elements) - but allow short phrases like "il resto"
    if (trimmedText.length < 3) return false;
    
    // Skip text that looks like file paths, URLs, or technical data
    if (trimmedText.includes('/') || trimmedText.includes('\\') || trimmedText.includes('http')) return false;
    
    // Skip text that looks like error codes or technical identifiers
    if (/^[A-Z0-9_-]{3,}$/.test(trimmedText)) return false;
    
    // Skip text that's mostly numbers and symbols
    if (/^[\d\s\-_.,:;()]+$/.test(trimmedText)) return false;
    
    // Skip text that looks like CSS classes or IDs
    if (trimmedText.startsWith('.') || trimmedText.startsWith('#')) return false;
    
    // Skip text that looks like JavaScript variables or functions
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmedText)) return false;
    
    // Skip text that's just punctuation
    if (/^[\s\.,!?;:'"()\-_]+$/.test(trimmedText)) return false;
    
    // Aggressively filter out UI text and navigation
    const uiPatterns = [
      /arrow_/i,
      /jump to/i,
      /scroll/i,
      /expand/i,
      /collapse/i,
      /more/i,
      /less/i,
      /show/i,
      /hide/i,
      /loading/i,
      /error/i,
      /success/i,
      /warning/i,
      /info/i,
      /click/i,
      /tap/i,
      /press/i,
      /enter/i,
      /exit/i,
      /close/i,
      /open/i,
      /next/i,
      /previous/i,
      /back/i,
      /forward/i
    ];
    
    if (uiPatterns.some(pattern => pattern.test(trimmedText))) return false;
    
    // Skip text that contains common UI words
    const uiWords = [
      'arrow', 'jump', 'scroll', 'expand', 'collapse', 'more', 'less',
      'show', 'hide', 'loading', 'error', 'success', 'warning', 'info',
      'click', 'tap', 'press', 'enter', 'exit', 'close', 'open', 'next',
      'previous', 'back', 'forward', 'button', 'link', 'menu', 'toolbar'
    ];
    
    const lowerText = trimmedText.toLowerCase();
    if (uiWords.some(word => lowerText.includes(word))) return false;
    
    // For short phrases (like "il resto"), accept if they contain letters and look like speech
    if (trimmedText.length < 10) {
      // Must contain letters and look like a phrase (not just symbols)
      return /[a-zA-Z]/.test(trimmedText) && !/^[\d\s\-_.,:;()]+$/.test(trimmedText);
    }
    
    // For longer text, must have spaces to be considered speech
    const hasSpaces = trimmedText.includes(' ');
    return hasSpaces;
  }
  
  cleanCaptionText(text) {
    // Clean caption text by removing UI elements and keeping only the actual speech
    const trimmedText = text.trim();
    
    // Split by common UI text patterns and keep only the parts that look like speech
    const uiPatterns = [
      /arrow_downward/i,
      /jump to bottom/i,
      /jump to top/i,
      /scroll up/i,
      /scroll down/i,
      /expand/i,
      /collapse/i,
      /more/i,
      /less/i,
      /show/i,
      /hide/i,
      /loading/i,
      /error/i,
      /success/i,
      /warning/i,
      /info/i,
      /click/i,
      /tap/i,
      /press/i,
      /enter/i,
      /exit/i,
      /close/i,
      /open/i,
      /next/i,
      /previous/i,
      /back/i,
      /forward/i
    ];
    
    // Remove UI patterns from the text
    let cleanedText = trimmedText;
    uiPatterns.forEach(pattern => {
      cleanedText = cleanedText.replace(pattern, '').trim();
    });
    
    // Remove extra whitespace and punctuation
    cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
    cleanedText = cleanedText.replace(/^[.,;:!?]+/, '').trim();
    cleanedText = cleanedText.replace(/[.,;:!?]+$/, '').trim();
    
    return cleanedText;
  }
  
  needsTranslation(node, text) {
    // Determine if this text node actually needs translation
    const trimmedText = text.trim();
    
    // Basic validation
    if (trimmedText.length === 0 || trimmedText.length >= 200) {
      return false;
    }
    
    // Clean the text to remove UI elements
    const cleanedText = this.cleanCaptionText(trimmedText);
    
    // If after cleaning there's no meaningful text left, skip it
    if (!cleanedText || cleanedText.length < 3) {
      console.log('SubtitleTranslator: Text rejected - no meaningful content after cleaning:', trimmedText, '->', cleanedText);
      return false;
    }
    
    // Skip common UI text
    if (this.isCommonUI(cleanedText)) {
      return false;
    }
    
    // Must look like caption text
    if (!this.looksLikeCaptionText(cleanedText)) {
      return false;
    }
    
    // Check if it's already been translated by the extension
    if (this.isTranslatedByExtension(node)) {
      return false; // Already translated
    }
    
    // Log what we're accepting for translation
    console.log('SubtitleTranslator: Text needs translation:', trimmedText, '->', cleanedText, 'Length:', cleanedText.length);
    
    // Store the cleaned text for later use
    node._cleanedText = cleanedText;
    
    // Otherwise, it needs translation
    return true;
  }
  
  clearTranslationFlag(node) {
    // Clear translation flags from a node and its parents
    let currentNode = node;
    while (currentNode && currentNode !== document.body) {
      if (currentNode._isTranslatedByExtension) {
        currentNode._isTranslatedByExtension = false;
        currentNode._translationTimestamp = null;
        console.log('SubtitleTranslator: Cleared translation flag for node');
      }
      currentNode = currentNode.parentNode;
    }
  }
  
  setupTranslationPersistence(element, originalText, translatedText) {
    // Set up periodic checks to ensure translation persists
    // This handles cases where the platform re-renders the original text
    
    const checkInterval = setInterval(() => {
      try {
        // Check if the element still exists
        if (!element || !element.textContent) {
          clearInterval(checkInterval);
          return;
        }
        
        // Check if the text has been reverted to the original
        const currentText = element.textContent.trim();
        if (currentText === originalText && element._translatedText) {
          console.log('SubtitleTranslator: Text reverted to original, re-applying translation:', originalText);
          element.textContent = element._translatedText;
        }
        
        // Check if the element has been replaced (new text node with same content)
        if (currentText === originalText && !element._isTranslatedByExtension) {
          console.log('SubtitleTranslator: New text node detected, applying translation:', originalText);
          element.textContent = translatedText;
          element._isTranslatedByExtension = true;
          element._translationTimestamp = Date.now();
          element._originalText = originalText;
          element._translatedText = translatedText;
        }
        
      } catch (error) {
        console.error('SubtitleTranslator: Error in translation persistence check:', error);
        clearInterval(checkInterval);
      }
    }, 1000); // Check every second
    
    // Store the interval ID so we can clear it if needed
    element._persistenceInterval = checkInterval;
  }
  
  async processSubtitleElement(element) {
    if (!this.isEnabled || !this.canTranslate || this.translatedElements.has(element)) return;
    
    const originalText = element.textContent.trim();
    if (!originalText) return;
    
    // Don't check if it's English - let ChatGPT figure out the language
    // Just make sure it's not empty
    
    try {
      const translatedText = await this.translateText(originalText);
      if (translatedText && translatedText !== originalText) {
        this.displayTranslation(element, originalText, translatedText);
        this.translatedElements.add(element);
      }
    } catch (error) {
      console.error('Translation error:', error);
    }
  }
  
  async processTextNode(textNode) {
    if (!this.isEnabled || !this.canTranslate) {
      console.log('SubtitleTranslator: Skipping text node - not enabled or limit reached');
      return;
    }
    
    // Check if this text node was already processed
    if (this.translatedElements.has(textNode)) {
      console.log('SubtitleTranslator: Skipping already processed text node');
      return;
    }
    
    // Check if this text was already processed globally
    const textContent = textNode.textContent.trim();
    if (this.processedTexts.has(textContent)) {
      console.log('SubtitleTranslator: Skipping already processed text:', textContent);
      return;
    }
    
    // Check if the text content has changed since last processing
    if (textNode._lastProcessedText === textContent) {
      console.log('SubtitleTranslator: Text content unchanged, skipping');
      return;
    }
    
    // Mark this text as processed globally
    this.processedTexts.add(textContent);
    textNode._lastProcessedText = textContent;
    
    // Use the cleaned text for translation if available
    const textToTranslate = textNode._cleanedText || textContent;
    
    // Use debounced translation to avoid excessive API calls
    this.performTextNodeTranslation(textNode, textToTranslate);
  }
  
  performTextNodeTranslation(textNode, textContent) {
    // Clear any existing pending translation for this text
    if (this.pendingTranslations.has(textContent)) {
      clearTimeout(this.pendingTranslations.get(textContent));
    }
    
    // Set up a new debounced translation
    const timeoutId = setTimeout(async () => {
      try {
        console.log('SubtitleTranslator: Processing text node for translation:', textContent);
        
        const translatedText = await this.translateText(textContent);
        if (translatedText && translatedText !== textContent) {
          // Use the original text content for display (to preserve UI elements)
          const originalText = textNode.textContent.trim();
          this.displayTranslation(textNode, originalText, translatedText);
          this.translatedElements.add(textNode);
        }
      } catch (error) {
        console.error('SubtitleTranslator: Error in debounced translation:', error);
      } finally {
        this.pendingTranslations.delete(textContent);
      }
    }, this.translationDebounceDelay);
    
    this.pendingTranslations.set(textContent, timeoutId);
  }
  
  async translateText(text) {
    if (!this.settings.apiKey) {
      console.error('SubtitleTranslator: No API key configured');
      return null;
    }
    
    // Add to queue for rate limiting
    return new Promise((resolve) => {
      this.translationQueue.push({ text, resolve });
      this.processQueue();
    });
  }
  
  async performTranslation(text) {
    try {
      // Check translation limit before proceeding
      if (!this.canTranslate) {
        console.log('SubtitleTranslator: Translation limit reached, skipping translation');
        return null;
      }
      
      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastTranslationTime;
      const minInterval = 2000; // 2 seconds between requests
      
      if (timeSinceLastRequest < minInterval) {
        await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
      }
      
      this.lastTranslationTime = now;
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a subtitle translator. Translate the following text to English. The text may be in any language. Return only the translated text, nothing else.`
            },
            {
              role: 'user',
              content: text
            }
          ],
          max_tokens: 100,
          temperature: 0.3
        })
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          console.warn('SubtitleTranslator: Rate limit hit, increasing delay');
          this.lastTranslationTime = Date.now() + 5000; // Add 5 second penalty
        }
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data = await response.json();
      const translatedText = data.choices[0]?.message?.content?.trim() || null;
      
      // If translation was successful, increment the usage counter
      if (translatedText) {
        try {
          const result = await chrome.runtime.sendMessage({ action: 'incrementTranslationCount' });
          if (result.success) {
            this.canTranslate = result.canTranslate;
            console.log('SubtitleTranslator: Translation count updated:', result.count, 'canTranslate:', result.canTranslate);
            
            // If limit reached, stop observing
            if (!this.canTranslate) {
              this.stopObserving();
              this.showLimitReachedMessage();
            }
          }
        } catch (error) {
          console.error('SubtitleTranslator: Error updating translation count:', error);
        }
      }
      
      return translatedText;
    } catch (error) {
      console.error('Translation API error:', error);
      return null;
    }
  }
  
  async processQueue() {
    if (this.isProcessingQueue || this.translationQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    while (this.translationQueue.length > 0) {
      const { text, resolve } = this.translationQueue.shift();
      
      // Wait for rate limit
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastTranslationTime;
      const minInterval = 2000;
      
      if (timeSinceLastRequest < minInterval) {
        await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
      }
      
      const result = await this.performTranslation(text);
      resolve(result);
    }
    
    this.isProcessingQueue = false;
  }
  
  displayTranslation(originalElement, originalText, translatedText) {
    // Instead of creating overlays, replace the original text with the translation
    // This is cleaner and more reliable than positioning overlays
    
    try {
      // Store the original text and translation for persistence
      if (!originalElement._originalText) {
        originalElement._originalText = originalText;
      }
      originalElement._translatedText = translatedText;
      
      if (originalElement.nodeType === Node.TEXT_NODE) {
        // For text nodes, replace the text content directly
        originalElement.textContent = translatedText;
        console.log('SubtitleTranslator: Replaced text node content:', originalText, '->', translatedText);
      } else if (originalElement.nodeType === Node.ELEMENT_NODE) {
        // For elements, replace the text content
        originalElement.textContent = translatedText;
        console.log('SubtitleTranslator: Replaced element content:', originalText, '->', translatedText);
      }
      
      // Mark this element as containing translated text to prevent re-translation
      originalElement._isTranslatedByExtension = true;
      originalElement._translationTimestamp = Date.now();
      
      // Add a small indicator that this text was translated
      this.addTranslationIndicator(originalElement);
      
      // Set up a periodic check to ensure the translation persists
      this.setupTranslationPersistence(originalElement, originalText, translatedText);
      
    } catch (error) {
      console.error('SubtitleTranslator: Error replacing text content:', error);
      
      // Fallback: create a simple overlay if direct replacement fails
      this.createFallbackOverlay(originalElement, originalText, translatedText);
    }
  }
  
  addTranslationIndicator(element) {
    // Add a small visual indicator that the text was translated
    try {
      if (element.nodeType === Node.ELEMENT_NODE) {
        // Add a subtle border or background to indicate translation
        element.style.borderLeft = '3px solid #4285f4';
        element.style.paddingLeft = '8px';
        element.style.backgroundColor = 'rgba(66, 133, 244, 0.1)';
        
        // Remove the indicator after 10 seconds
        setTimeout(() => {
          if (element.style) {
            element.style.borderLeft = '';
            element.style.paddingLeft = '';
            element.style.backgroundColor = '';
          }
        }, 10000);
      }
    } catch (error) {
      console.log('SubtitleTranslator: Could not add translation indicator');
    }
  }
  
  restoreOriginalText(element) {
    // Restore the original text if it was translated
    try {
      if (element._originalText) {
        element.textContent = element._originalText;
        console.log('SubtitleTranslator: Restored original text:', element._originalText);
        
        // Remove translation indicators
        if (element.style) {
          element.style.borderLeft = '';
          element.style.paddingLeft = '';
          element.style.backgroundColor = '';
        }
        
        // Clear translation flags
        element._translated = false;
        element._translation = null;
        element._isTranslatedByExtension = false;
        element._translationTimestamp = null;
        
        // Clear persistence interval
        if (element._persistenceInterval) {
          clearInterval(element._persistenceInterval);
          element._persistenceInterval = null;
        }
        
        return true;
      }
    } catch (error) {
      console.error('SubtitleTranslator: Error restoring original text:', error);
    }
    return false;
  }
  
  toggleTranslation(element) {
    // Toggle between original and translated text
    try {
      if (element._translated && element._translation) {
        if (element.textContent === element._translation) {
          // Currently showing translation, switch to original
          this.restoreOriginalText(element);
        } else {
          // Currently showing original, switch to translation
          element.textContent = element._translation;
          this.addTranslationIndicator(element);
        }
      }
    } catch (error) {
      console.error('SubtitleTranslator: Error toggling translation:', error);
    }
  }
  
  createFallbackOverlay(originalElement, originalText, translatedText) {
    // Fallback method if direct text replacement fails
    const overlay = document.createElement('div');
    overlay.className = 'subtitle-translation-overlay';
    overlay.style.cssText = `
      position: absolute;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 10px 15px;
      border-radius: 8px;
      font-size: 14px;
      max-width: 400px;
      z-index: 10000;
      pointer-events: none;
      white-space: pre-wrap;
      word-wrap: break-word;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    overlay.innerHTML = `
      <div style="margin-bottom: 6px; opacity: 0.8; font-size: 12px; color: #ccc;">Original:</div>
      <div style="margin-bottom: 10px; font-style: italic;">${originalText}</div>
      <div style="opacity: 0.8; font-size: 12px; color: #ccc;">Translation:</div>
      <div style="font-weight: bold; color: #fff;">${translatedText}</div>
    `;
    
    // Position the overlay near the original element
    let targetElement = originalElement;
    
    if (originalElement.nodeType === Node.TEXT_NODE) {
      targetElement = originalElement.parentElement;
      if (!targetElement) {
        let currentNode = originalElement;
        while (currentNode && currentNode.nodeType !== Node.ELEMENT_NODE) {
          currentNode = currentNode.parentNode;
        }
        targetElement = currentNode;
      }
    }
    
    if (targetElement && targetElement.getBoundingClientRect) {
      try {
        const rect = targetElement.getBoundingClientRect();
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.bottom + 5}px`;
      } catch (error) {
        console.error('SubtitleTranslator: Error positioning fallback overlay:', error);
        // Fallback positioning
        overlay.style.left = '50px';
        overlay.style.top = '100px';
      }
    } else {
      // Fallback positioning
      overlay.style.left = '50px';
      overlay.style.top = '100px';
    }
    
    document.body.appendChild(overlay);
    
    // Remove overlay after 10 seconds
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 10000);
  }
  
  addKeyboardShortcuts() {
    // Add keyboard shortcuts for translation control
    document.addEventListener('keydown', (event) => {
      // Ctrl+Shift+T: Toggle translation for focused element
      if (event.ctrlKey && event.shiftKey && event.key === 'T') {
        event.preventDefault();
        const focusedElement = document.activeElement;
        if (focusedElement && focusedElement._isTranslatedByExtension) {
          this.toggleTranslation(focusedElement);
        }
      }
      
      // Ctrl+Shift+R: Restore all original text
      if (event.ctrlKey && event.shiftKey && event.key === 'R') {
        event.preventDefault();
        this.restoreAllOriginalText();
      }
    });
  }
  
  // Manual trigger method for debugging
  manualScan() {
    console.log('SubtitleTranslator: Manual scan triggered');
    console.log('SubtitleTranslator: Current state - isEnabled:', this.isEnabled, 'settings:', this.settings);
    
    if (this.isEnabled && this.canTranslate) {
      this.scanForSubtitles(document.body);
    } else {
      console.log('SubtitleTranslator: Extension not enabled or translation limit reached. Check popup settings.');
    }
  }
  
  // Force enable method for testing
  forceEnable() {
    console.log('SubtitleTranslator: Force enabling extension for testing');
    this.isEnabled = true;
    this.startObserving();
    this.scanForSubtitles(document.body);
  }
}

// Initialize the extension only once per page
if (!window.subtitleTranslatorInstance) {
  window.subtitleTranslatorInstance = new SubtitleTranslator();
  
  // Add keyboard shortcuts
  window.subtitleTranslatorInstance.addKeyboardShortcuts();
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateSettings') {
      console.log('SubtitleTranslator: Received settings update:', message.settings);
      window.subtitleTranslatorInstance.updateSettings(message.settings);
      sendResponse({ success: true });
    } else if (message.action === 'subscriptionExpired') {
      console.log('SubtitleTranslator: Subscription expired:', message.message);
      // Show subscription expired notification
      if (window.subtitleTranslatorInstance) {
        window.subtitleTranslatorInstance.showLimitReachedMessage();
      }
      sendResponse({ success: true });
    }
  });
  
  // Make extension globally accessible for debugging
  window.subtitleTranslator = window.subtitleTranslatorInstance;
  
  console.log('SubtitleTranslator: Extension initialized with freemium model');
  console.log('SubtitleTranslator: Access via window.subtitleTranslator or window.subtitleTranslatorInstance');
  console.log('SubtitleTranslator: Try: subtitleTranslator.manualScan() or subtitleTranslator.forceEnable()');
} else {
  console.log('SubtitleTranslator: Extension already initialized, skipping');
}
