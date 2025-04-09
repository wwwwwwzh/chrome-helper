// Main content script that runs in the web page context
// Updated to integrate with new element registry and highlighting modules

// Ensure we don't initialize multiple times
if (!window.taskTeacherInitialized) {
  window.taskTeacherInitialized = true;
  
  console.log('Task Teacher content script initialized');
  
  // Load modules in specific order - DOM parser first, then highlighter, then UI controller
  function loadModule(scriptName) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(`content/${scriptName}`);
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = reject;
      (document.head || document.documentElement).appendChild(script);
    });
  }
  
  // Set up initial state
  async function initializeExtension() {
    try {
      // Load DOM parser first since other modules depend on it
      await loadModule('dom-parser.js');
      console.log('DOM Parser module loaded');
      
      // Load highlighter next
      await loadModule('highlighter.js');
      console.log('Highlighter module loaded');
      
      // Load UI controller last since it depends on both previous modules
      await loadModule('ui-controller.js');
      console.log('UI Controller module loaded');
      
      // Initialize periodic DOM state reporting after all modules are loaded
      initializeDOMStateReporting();
      
      // Perform initial DOM parsing
      if (window.taskTeacherDOMParser) {
        window.taskTeacherDOMParser.getDOMData();
      }
    } catch (error) {
      console.error('Error loading modules:', error);
    }
  }
  
  // Start the initialization process
  initializeExtension();
  
  // Handle messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);
    
    if (message.action === 'getDOMState') {
      if (window.taskTeacherDOMParser) {
        const domData = window.taskTeacherDOMParser.getDOMData();
        sendResponse({ success: true, domData });
      } else {
        // Fallback if DOM parser isn't loaded yet
        const domData = getFallbackDOMData();
        sendResponse({ success: true, domData });
      }
      return true;
    }
    
    if (message.action === 'highlightElement') {
      if (window.taskTeacherHighlighter) {
        const result = window.taskTeacherHighlighter.highlightElement(
          message.elementIdentifier, 
          message.instruction
        );
        sendResponse({ success: result });
      } else {
        // Fallback highlighting
        const result = fallbackHighlightElement(
          message.elementIdentifier, 
          message.instruction
        );
        sendResponse({ success: result });
      }
      return true;
    }
    
    if (message.action === 'clearHighlights') {
      if (window.taskTeacherHighlighter) {
        window.taskTeacherHighlighter.clearHighlights();
      } else {
        clearFallbackHighlights();
      }
      sendResponse({ success: true });
      return true;
    }
    
    if (message.action === 'refreshDOM') {
      if (window.taskTeacherUIController) {
        const result = window.taskTeacherUIController.refreshDOM();
        sendResponse({ success: true, domData: result });
      } else if (window.taskTeacherDOMParser) {
        window.taskTeacherDOMParser.clearRegistry();
        const result = window.taskTeacherDOMParser.getDOMData();
        sendResponse({ success: true, domData: result });
      } else {
        // Fallback DOM refresh
        const domData = getFallbackDOMData();
        sendResponse({ success: true, domData });
      }
      return true;
    }
    
    if (message.action === 'findAndHighlight') {
      if (window.taskTeacherUIController) {
        const result = window.taskTeacherUIController.findAndHighlight(
          message.criteria,
          message.instruction
        );
        sendResponse({ success: result });
      } else {
        sendResponse({ success: false, error: 'UI controller not loaded' });
      }
      return true;
    }
    
    // Default response
    sendResponse({ success: false, error: 'Unknown action' });
    return false;
  });
  
  // Initialize periodic DOM state reporting
  function initializeDOMStateReporting() {
    // Report DOM state periodically
    const reportInterval = setInterval(() => {
      if (document.hidden) return; // Don't report if tab is not visible
      
      try {
        // Get DOM data
        const domData = window.taskTeacherDOMParser 
          ? window.taskTeacherDOMParser.getDOMData()
          : getFallbackDOMData();
        
        // Report to background script
        chrome.runtime.sendMessage({
          action: 'reportUIState',
          domData,
          tabId: null // Background script will handle this
        }).catch(err => {
          // If we get a disconnected error, stop the interval
          if (err.message.includes('disconnected')) {
            clearInterval(reportInterval);
          }
        });
      } catch (error) {
        console.error('Error reporting DOM state:', error);
      }
    }, 5000); // Report every 5 seconds
    
    // Clean up on unload
    window.addEventListener('beforeunload', () => {
      clearInterval(reportInterval);
    });
    
    // Also set up mutation observer for more responsive updates
    setupDOMMutationObserver();
  }
  
  // Set up mutation observer to detect DOM changes
  function setupDOMMutationObserver() {
    if (!window.MutationObserver) return;
    
    const observer = new MutationObserver((mutations) => {
      // Only process significant mutations
      let significantChange = false;
      
      for (const mutation of mutations) {
        // Check for added or removed nodes
        if (mutation.type === 'childList' && 
            (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
          // Look for significant element changes
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && 
                (node.tagName === 'DIV' || node.tagName === 'SECTION' || 
                 node.tagName === 'BUTTON' || node.tagName === 'A')) {
              significantChange = true;
              break;
            }
          }
        }
        
        // Check for attribute changes on potential interactive elements
        if (mutation.type === 'attributes') {
          const target = mutation.target;
          if (target.nodeType === Node.ELEMENT_NODE && 
              (target.tagName === 'BUTTON' || target.tagName === 'A' || 
               target.tagName === 'INPUT' || target.hasAttribute('role'))) {
            significantChange = true;
            break;
          }
        }
        
        if (significantChange) break;
      }
      
      // If significant changes, refresh DOM parsing
      if (significantChange) {
        clearTimeout(window.domRefreshTimeout);
        window.domRefreshTimeout = setTimeout(() => {
          if (window.taskTeacherDOMParser) {
            const domData = window.taskTeacherDOMParser.getDOMData();
            chrome.runtime.sendMessage({
              action: 'reportUIState',
              domData,
              tabId: null
            }).catch(err => console.debug('Error reporting DOM update:', err));
          }
        }, 500); // Debounce to prevent excessive updates
      }
    });
    
    // Start observing the document
    observer.observe(document.body, {
      childList: true,
      attributes: true,
      characterData: false,
      subtree: true,
      attributeFilter: ['style', 'class', 'disabled', 'aria-hidden']
    });
    
    // Store reference for cleanup
    window.taskTeacherMutationObserver = observer;
  }
  
  // Fallback function to get DOM data if module isn't loaded
  function getFallbackDOMData() {
    const clickableElements = [];
    const selectors = [
      'a', 'button', 'input[type="button"]', 'input[type="submit"]',
      '[role="button"]', '[onclick]', '.btn', '.button'
    ];
    
    try {
      const elements = document.querySelectorAll(selectors.join(','));
      
      elements.forEach((element, index) => {
        if (element.offsetWidth > 0 && element.offsetHeight > 0) {
          const text = element.textContent.trim();
          const tag = element.tagName.toLowerCase();
          const type = element.getAttribute('type') || '';
          const id = element.id ? `id="${element.id}"` : '';
          const className = element.className ? `class="${element.className}"` : '';
          
          clickableElements.push(`[${index}]<${tag} ${id} ${className} ${type}>${text}</${tag}>`);
        }
      });
    } catch (error) {
      console.error('Error getting fallback DOM data:', error);
    }
    
    return {
      url: window.location.href,
      title: document.title,
      clickableElements: clickableElements.join('\n')
    };
  }
  
  // Fallback function to highlight element
  function fallbackHighlightElement(elementIdentifier, instruction) {
    try {
      // Extract index from "[X]" format
      const index = parseInt(elementIdentifier.replace(/[^\d]/g, ''));
      const selectors = [
        'a', 'button', 'input[type="button"]', 'input[type="submit"]',
        '[role="button"]', '[onclick]', '.btn', '.button'
      ];
      
      // Get all potential clickable elements
      const elements = document.querySelectorAll(selectors.join(','));
      let visibleElements = [];
      
      // Filter for visible elements
      for (const el of elements) {
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
          visibleElements.push(el);
        }
      }
      
      const element = visibleElements[index];
      
      if (!element) {
        console.error('Element not found:', elementIdentifier);
        return false;
      }
      
      // Create highlight overlay
      const overlay = document.createElement('div');
      overlay.id = 'task-teacher-highlight';
      overlay.style.position = 'absolute';
      overlay.style.border = '2px solid #4285f4';
      overlay.style.borderRadius = '3px';
      overlay.style.backgroundColor = 'rgba(66, 133, 244, 0.1)';
      overlay.style.zIndex = '9999';
      overlay.style.pointerEvents = 'none';
      overlay.style.boxShadow = '0 0 10px rgba(66, 133, 244, 0.5)';
      overlay.style.animation = 'task-teacher-pulse 1.5s infinite';
      
      // Add styles if they don't exist
      if (!document.querySelector('#task-teacher-styles')) {
        const style = document.createElement('style');
        style.id = 'task-teacher-styles';
        style.textContent = `
          @keyframes task-teacher-pulse {
            0% { box-shadow: 0 0 5px rgba(66, 133, 244, 0.5); }
            50% { box-shadow: 0 0 20px rgba(66, 133, 244, 0.8); }
            100% { box-shadow: 0 0 5px rgba(66, 133, 244, 0.5); }
          }
        `;
        document.head.appendChild(style);
      }
      
      // Add instruction text if provided
      if (instruction) {
        const instructionEl = document.createElement('div');
        instructionEl.id = 'task-teacher-instruction';
        instructionEl.textContent = instruction;
        instructionEl.style.position = 'fixed';
        instructionEl.style.bottom = '20px';
        instructionEl.style.left = '50%';
        instructionEl.style.transform = 'translateX(-50%)';
        instructionEl.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        instructionEl.style.color = 'white';
        instructionEl.style.padding = '10px 20px';
        instructionEl.style.borderRadius = '6px';
        instructionEl.style.zIndex = '10000';
        instructionEl.style.fontFamily = 'Arial, sans-serif';
        document.body.appendChild(instructionEl);
      }
      
      // Position overlay
      const rect = element.getBoundingClientRect();
      overlay.style.top = `${rect.top + window.scrollY}px`;
      overlay.style.left = `${rect.left + window.scrollX}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      
      // Remove any existing highlight
      clearFallbackHighlights();
      
      document.body.appendChild(overlay);
      
      // Scroll element into view
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      
      return true;
    } catch (error) {
      console.error('Error in fallback highlight:', error);
      return false;
    }
  }
  
  // Clear fallback highlights
  function clearFallbackHighlights() {
    const highlight = document.getElementById('task-teacher-highlight');
    if (highlight) {
      highlight.remove();
    }
    
    const instruction = document.getElementById('task-teacher-instruction');
    if (instruction) {
      instruction.remove();
    }
  }
  
  // Handle navigation events to refresh DOM state
  window.addEventListener('popstate', () => {
    // History navigation occurred (back/forward button)
    console.log('Navigation detected via popstate');
    setTimeout(() => {
      // Wait for DOM to update after navigation
      if (window.taskTeacherDOMParser) {
        window.taskTeacherDOMParser.clearRegistry();
        window.taskTeacherDOMParser.getDOMData();
      }
    }, 500);
  });
  
  // Handle click events that might trigger navigation
  document.addEventListener('click', (event) => {
    // Check if clicked element is a link or submit button
    const isNavigationElement = 
      event.target.tagName === 'A' ||
      event.target.closest('a') ||
      (event.target.tagName === 'BUTTON' && event.target.type === 'submit') ||
      event.target.closest('button[type="submit"]') ||
      (event.target.tagName === 'INPUT' && event.target.type === 'submit');
    
    if (isNavigationElement) {
      // Store that we expect navigation to occur
      window.expectingNavigation = true;
      
      // Set up navigation monitoring
      setTimeout(() => {
        window.expectingNavigation = false;
      }, 5000); // Reset after 5 seconds if no navigation occurs
    }
  }, true);
  
  // Global helper for triggering DOM registry refresh
  window.refreshTaskTeacherDOM = function() {
    if (window.taskTeacherDOMParser) {
      window.taskTeacherDOMParser.clearRegistry();
      return window.taskTeacherDOMParser.getDOMData();
    }
    return null;
  };
  
  console.log('Task Teacher content script fully initialized');
}