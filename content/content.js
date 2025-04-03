// Main content script that runs in the web page context

// Ensure we don't initialize multiple times
if (!window.taskTeacherInitialized) {
    window.taskTeacherInitialized = true;
    
    console.log('Task Teacher content script initialized');
    
    // Load additional scripts
    loadModule('highlighter.js').then(() => {
      console.log('Highlighter module loaded');
    });
    
    loadModule('dom-parser.js').then(() => {
      console.log('DOM Parser module loaded');
      // After DOM parser is loaded, initialize periodic DOM state reporting
      initializeDOMStateReporting();
    });
    
    loadModule('ui-controller.js').then(() => {
      console.log('UI Controller module loaded');
    });
    
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
          const result = window.taskTeacherHighlighter.highlightElement(message.elementIdentifier);
          sendResponse({ success: result });
        } else {
          // Fallback highlighting
          const result = fallbackHighlightElement(message.elementIdentifier);
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
      
      // Default response
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
    });
    
    // Function to load module scripts
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
    function fallbackHighlightElement(elementIdentifier) {
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
        
        // Position overlay
        const rect = element.getBoundingClientRect();
        overlay.style.top = `${rect.top + window.scrollY}px`;
        overlay.style.left = `${rect.left + window.scrollX}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        
        // Remove any existing highlight
        clearFallbackHighlights();
        
        document.body.appendChild(overlay);
        
        // Scroll element into view if needed
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
    }
  }