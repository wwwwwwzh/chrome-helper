// Main content script that runs in the web page context
// Updated to handle communication between page-injected scripts and the extension

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
      // // Load DOM parser first since other modules depend on it
      // await loadModule('dom-parser.js');
      // console.log('DOM Parser module loaded');

      // // Load highlighter next
      // await loadModule('highlighter.js');
      // console.log('Highlighter module loaded');

      // // Load UI controller last since it depends on both previous modules
      // await loadModule('ui-controller.js');
      // console.log('UI Controller module loaded');

      // Initialize event listeners to bridge between page scripts and extension
      setupEventBridge();

      // Initialize periodic DOM state reporting after all modules are loaded
      initializeDOMStateReporting();

      // Perform initial DOM parsing
      // This will be delayed slightly to ensure all modules are fully initialized
      setTimeout(() => {
        // Use custom event to trigger DOM refresh
        document.dispatchEvent(new CustomEvent('taskTeacher:refreshDOM'));
      }, 500);
    } catch (error) {
      console.error('Error loading modules:', error);
    }
  }

  // Start the initialization process
  initializeExtension();

  // Bridge events from page-injected scripts to extension
  function setupEventBridge() {
    // Handle element clicks reported by UI controller
    document.addEventListener('taskTeacher:elementClicked', function (event) {
      const { elementIndex, url, elementDetails } = event.detail;

      // Forward to background via chrome.runtime.sendMessage
      chrome.runtime.sendMessage({
        action: 'elementClicked',
        elementIndex,
        url,
        elementDetails
      }).catch(error => {
        console.debug('Error forwarding element click:', error);
      });
    });

    // Handle UI state reports
    document.addEventListener('taskTeacher:reportUIState', function (event) {
      const { domData } = event.detail;
      try {
        chrome.runtime.sendMessage({
          action: 'reportUIState',
          domData
          // No need to pass tabId here—background script will use sender.tab?.id
        }, function (response) {
          if (chrome.runtime.lastError) {
            console.debug('Error forwarding UI state:', chrome.runtime.lastError.message);
          }
        });
      } catch (error) {
        console.debug('Error sending UI state:', error);
      }
    });

  }

  // Handle messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);

    if (message.action === 'getDOMState') {
      // Trigger custom event and wait for response
      document.dispatchEvent(new CustomEvent('taskTeacher:refreshDOM'));

      // Get DOM data directly through window object
      setTimeout(() => {
        const domData = window.taskTeacherDOMParser
          ? window.taskTeacherDOMParser.getDOMData()
          : getFallbackDOMData();
        sendResponse({ success: true, domData });
      }, 100);

      return true;
    }

    if (message.action === 'highlightElement') {
      // Create custom event for highlighting
      const event = new CustomEvent('taskTeacher:highlight', {
        detail: {
          elementIndex: parseInt(message.elementIdentifier.replace(/[^\d]/g, '')),
          instruction: message.instruction
        }
      });
      document.dispatchEvent(event);

      // Check result after a short delay
      setTimeout(() => {
        const activeIndex = window.taskTeacherHighlighter?.getActiveHighlightIndex();
        sendResponse({
          success: activeIndex !== null && activeIndex !== undefined,
          activeIndex
        });
      }, 100);

      return true;
    }

    if (message.action === 'clearHighlights') {
      // Create custom event for clearing highlights
      document.dispatchEvent(new CustomEvent('taskTeacher:clearHighlights'));
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'refreshDOM') {
      // Create custom event for refreshing DOM
      document.dispatchEvent(new CustomEvent('taskTeacher:refreshDOM'));

      // Get result after a short delay
      setTimeout(() => {
        const domData = window.taskTeacherDOMParser
          ? window.taskTeacherDOMParser.getDOMData()
          : getFallbackDOMData();
        sendResponse({ success: true, domData });
      }, 100);

      return true;
    }

    if (message.action === 'findAndHighlight') {
      // Forward to page script
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
        // Trigger DOM update via custom event
        document.dispatchEvent(new CustomEvent('taskTeacher:refreshDOM'));
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
      document.dispatchEvent(new CustomEvent('taskTeacher:refreshDOM'));
    }, 500);
  });

  // Log when extension is ready
  console.log('Task Teacher content script fully initialized');
}