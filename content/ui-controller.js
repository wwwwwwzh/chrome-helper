/**
 * Enhanced UI Controller module for Task Teacher extension
 * With automatic next step progression
 */

(function () {
  // Create namespace if it doesn't exist
  if (window.taskTeacherUIController) return;

  window.taskTeacherUIController = {};

  // Keep track of event handlers
  let eventHandlers = [];

  // Flag to track if we're waiting for navigation
  let expectingNavigation = false;

  // Initialize controller
  function initialize() {
    // Listen for element clicks
    addGlobalClickHandler();

    // Add custom events for extension communication
    addCustomEventListeners();

    // Setup heartbeat to periodically check DOM for changes
    setupDOMChangeMonitoring();

    console.log('UI Controller initialized with auto-next step functionality');
  }

  // Add global click handler to detect interactions with highlighted elements
  function addGlobalClickHandler() {
    const clickHandler = function (event) {
      // Only process if we have a highlighted element
      const activeElementIndex = window.taskTeacherHighlighter?.getActiveHighlightIndex();
      if (activeElementIndex === null) return;

      // Get the element that was clicked
      const clickedElement = event.target;

      // Check if the clicked element or any of its parents is the highlighted element
      let currentElement = clickedElement;
      let foundHighlightedElement = false;

      while (currentElement && !foundHighlightedElement) {
        // Check against DOM parser's elements
        if (window.taskTeacherDOMParser) {
          const highlightedElement = window.taskTeacherDOMParser.getElementByIndex(activeElementIndex);
          if (highlightedElement === currentElement) {
            foundHighlightedElement = true;
            break;
          }
        }

        currentElement = currentElement.parentElement;
      }

      if (foundHighlightedElement) {
        // Report click via custom event (content script will handle sending to background)
        reportElementClick(activeElementIndex, currentElement);

        // Clear highlights after click
        if (window.taskTeacherHighlighter) {
          window.taskTeacherHighlighter.clearHighlights();
        }

        // If this was a link or button that might navigate, set navigation expectation
        if (currentElement.tagName === 'A' ||
          currentElement.tagName === 'BUTTON' ||
          currentElement.type === 'submit' ||
          currentElement.getAttribute('role') === 'button') {

          // Set a flag that we're expecting navigation
          expectingNavigation = true;

          // Monitor for navigation completion
          monitorPageNavigation();
        } else {
          // For non-navigation elements, auto-proceed to next step after a short delay
          setTimeout(() => {
            requestNextStep();
          }, 500);
        }
      }
    };

    document.addEventListener('click', clickHandler, true);
    eventHandlers.push({
      element: document,
      type: 'click',
      handler: clickHandler,
      options: true
    });
  }

  // Monitor for page navigation to refresh element registry and auto-proceed
  function monitorPageNavigation() {
    // Set timeout for navigation - if page doesn't change within 5 seconds, reset flag
    const navigationTimeout = setTimeout(() => {
      expectingNavigation = false;

      // Auto-proceed to next step if no navigation occurred
      requestNextStep();
    }, 5000);

    // Save current URL to detect change
    const currentUrl = window.location.href;

    // Check for navigation completion
    const checkNavigation = setInterval(() => {
      // If URL changed or load event fired
      if (window.location.href !== currentUrl || document.readyState === 'complete') {
        clearInterval(checkNavigation);
        clearTimeout(navigationTimeout);

        // Reset navigation flag
        expectingNavigation = false;

        // Wait for DOM to stabilize, then refresh registry
        setTimeout(() => {
          if (window.taskTeacherDOMParser) {
            // Clear registry and rebuild
            window.taskTeacherDOMParser.clearRegistry();
            window.taskTeacherDOMParser.getDOMData();

            // Report state to background script using custom event
            reportUIState();

            // Auto-proceed to next step after navigation completes
            setTimeout(() => {
              requestNextStep();
            }, 1000);
          }
        }, 1000);
      }
    }, 100);
  }

  // Report element click to background script
  function reportElementClick(elementIndex, element) {
    // Get additional data about the clicked element
    let elementDetails = {
      tagName: element.tagName.toLowerCase(),
      text: element.textContent.trim(),
      type: element.getAttribute('type') || '',
      href: element.getAttribute('href') || '',
      xpath: window.TaskTeacherUtils?.dom.getXPath(element) || ''
    };

    // Create and dispatch custom event
    const event = new CustomEvent('taskTeacher:elementClicked', {
      detail: {
        elementIndex,
        url: window.location.href,
        elementDetails,
        expectingNavigation
      }
    });
    document.dispatchEvent(event);
  }

  // Auto-request next step from background script
  async function requestNextStep() {
    try {
      // Get the tab ID directly from the background script
      const response = await chrome.runtime.sendMessage({
        action: 'getCurrentTabId'
      });

      if (response && response.tabId) {
        await chrome.runtime.sendMessage({
          action: 'getNextStep',
          tabId: response.tabId  // Use the confirmed tabId from background
        });
      }
    } catch (error) {
      console.debug('Error requesting next step:', error);
    }
  }

  // Setup periodic DOM change monitoring
  function setupDOMChangeMonitoring() {
    // Use MutationObserver to detect significant DOM changes
    const observer = new MutationObserver((mutations) => {
      let significantChange = false;

      // Check if mutations represent significant changes
      for (const mutation of mutations) {
        // Added or removed nodes
        if (mutation.type === 'childList' &&
          (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
          significantChange = true;
          break;
        }

        // Attribute changes on interactive elements
        if (mutation.type === 'attributes' &&
          (mutation.target.tagName === 'BUTTON' ||
            mutation.target.tagName === 'A' ||
            mutation.target.tagName === 'INPUT')) {
          significantChange = true;
          break;
        }
      }

      if (significantChange && !expectingNavigation) {
        // Debounce DOM updates to prevent excessive processing
        clearTimeout(window.taskTeacherUIController.domUpdateTimer);
        window.taskTeacherUIController.domUpdateTimer = setTimeout(() => {
          // Only update if we're not in the middle of navigation
          if (!expectingNavigation) {
            // Refresh DOM registry
            if (window.taskTeacherDOMParser) {
              window.taskTeacherDOMParser.getDOMData();
            }

            // Report updated state
            reportUIState();
          }
        }, 500);
      }
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      attributes: true,
      subtree: true,
      attributeFilter: ['style', 'class', 'hidden', 'display']
    });

    // Store observer for cleanup
    window.taskTeacherUIController.mutationObserver = observer;
  }

  // Report UI state to background script
  function reportUIState() {
    if (window.taskTeacherDOMParser) {
      const domData = window.taskTeacherDOMParser.getDOMData();

      // Create and dispatch custom event
      const event = new CustomEvent('taskTeacher:reportUIState', {
        detail: {
          domData,
          timestamp: Date.now()
        }
      });
      document.dispatchEvent(event);
    }
  }

  // Add custom event listeners for extension communication
  function addCustomEventListeners() {
    // Listen for highlight events
    document.addEventListener('taskTeacher:highlight', function (event) {
      const { elementIndex, instruction } = event.detail || {};

      if (window.taskTeacherHighlighter) {
        window.taskTeacherHighlighter.highlightElement(`[${elementIndex}]`, instruction);
      }
    });

    // Listen for clear highlights events
    document.addEventListener('taskTeacher:clearHighlights', function () {
      if (window.taskTeacherHighlighter) {
        window.taskTeacherHighlighter.clearHighlights();
      }
    });

    // Listen for refresh DOM event
    document.addEventListener('taskTeacher:refreshDOM', function () {
      if (window.taskTeacherDOMParser) {
        window.taskTeacherDOMParser.clearRegistry();
        window.taskTeacherDOMParser.getDOMData();
        reportUIState();
      }
    });
  }

  // Public API methods
  window.taskTeacherUIController.highlightElement = function (elementIndex, instruction) {
    if (window.taskTeacherHighlighter) {
      return window.taskTeacherHighlighter.highlightElement(elementIndex, instruction);
    }
    return false;
  };

  window.taskTeacherUIController.clearHighlights = function () {
    if (window.taskTeacherHighlighter) {
      return window.taskTeacherHighlighter.clearHighlights();
    }
    return false;
  };

  window.taskTeacherUIController.refreshDOM = function () {
    if (window.taskTeacherDOMParser) {
      return window.taskTeacherDOMParser.getDOMData();
    }
    return null;
  };

  window.taskTeacherUIController.findAndHighlight = function (criteria, instruction) {
    if (!window.taskTeacherDOMParser || !window.taskTeacherHighlighter) {
      return false;
    }

    // Refresh DOM first
    window.taskTeacherDOMParser.getDOMData();

    // Find element by text
    const element = window.taskTeacherDOMParser.findElement(criteria);
    if (!element) {
      return false;
    }

    // Find the element's index
    const interactiveElements = window.taskTeacherDOMParser.getDOMData().clickableElements.split('\n');
    let elementIndex = -1;

    for (const elementStr of interactiveElements) {
      const match = elementStr.match(/\[(\d+)\]/);
      if (match) {
        const index = parseInt(match[1]);
        const domElement = window.taskTeacherDOMParser.getDomElementByIndex(index);
        if (domElement && domElement.element === element) {
          elementIndex = index;
          break;
        }
      }
    }

    if (elementIndex >= 0) {
      return window.taskTeacherHighlighter.highlightElement(`[${elementIndex}]`, instruction);
    }

    return false;
  };

  // Expose navigation expectation state
  window.taskTeacherUIController.isExpectingNavigation = function () {
    return expectingNavigation;
  };

  // Force trigger next step request
  window.taskTeacherUIController.requestNextStep = requestNextStep;

  // Clean up event handlers
  window.taskTeacherUIController.cleanup = function () {
    // Remove event handlers
    eventHandlers.forEach(({ element, type, handler, options }) => {
      element.removeEventListener(type, handler, options);
    });
    eventHandlers = [];

    // Stop mutation observer
    if (window.taskTeacherUIController.mutationObserver) {
      window.taskTeacherUIController.mutationObserver.disconnect();
    }

    // Clear any timers
    clearTimeout(window.taskTeacherUIController.domUpdateTimer);
  };

  // Initialize on load
  initialize();

  // Clean up on window unload
  window.addEventListener('beforeunload', () => {
    window.taskTeacherUIController.cleanup();
  });
})();