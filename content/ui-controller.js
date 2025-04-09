/**
 * Improved UI Controller module for Task Teacher extension
 * Enhanced user interaction tracking and event handling
 */

(function() {
  // Create namespace
  window.taskTeacherUIController = {};
  
  // Keep track of event handlers
  let eventHandlers = [];
  
  // Initialize controller
  function initialize() {
    // Listen for element clicks
    addGlobalClickHandler();
    
    // Add custom events for extension communication
    addCustomEventListeners();
    
    // Setup heartbeat to periodically check DOM for changes
    setupDOMChangeMonitoring();
    
    console.log('UI Controller initialized');
  }
  
  // Add global click handler to detect interactions with highlighted elements
  function addGlobalClickHandler() {
    const clickHandler = function(event) {
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
        reportElementClick(activeElementIndex);
        
        // Clear highlights after click
        if (window.taskTeacherHighlighter) {
          window.taskTeacherHighlighter.clearHighlights();
        }
        
        // If this was a link or button that might navigate, wait for possible page change
        if (currentElement.tagName === 'A' || 
            currentElement.tagName === 'BUTTON' || 
            currentElement.type === 'submit') {
          
          // Set a flag that we're expecting navigation
          window.taskTeacherUIController.expectingNavigation = true;
          
          // Monitor for navigation completion
          monitorPageNavigation();
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
  
  // Monitor for page navigation to refresh element registry
  function monitorPageNavigation() {
    // Set timeout for navigation - if page doesn't change within 5 seconds, reset flag
    const navigationTimeout = setTimeout(() => {
      window.taskTeacherUIController.expectingNavigation = false;
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
        window.taskTeacherUIController.expectingNavigation = false;
        
        // Wait for DOM to stabilize, then refresh registry
        setTimeout(() => {
          if (window.taskTeacherDOMParser) {
            // Clear registry and rebuild
            window.taskTeacherDOMParser.clearRegistry();
            window.taskTeacherDOMParser.getDOMData();
            
            // Report state to background script using custom event
            reportUIState();
          }
        }, 1000);
      }
    }, 100);
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
      
      if (significantChange && !window.taskTeacherUIController.expectingNavigation) {
        // Debounce DOM updates to prevent excessive processing
        clearTimeout(window.taskTeacherUIController.domUpdateTimer);
        window.taskTeacherUIController.domUpdateTimer = setTimeout(() => {
          // Only update if we're not in the middle of navigation
          if (!window.taskTeacherUIController.expectingNavigation) {
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
  
  // Add custom event listeners for extension communication
  function addCustomEventListeners() {
    // Listen for highlight events
    document.addEventListener('taskTeacher:highlight', function(event) {
      const { elementIndex, instruction } = event.detail || {};
      
      if (window.taskTeacherHighlighter) {
        window.taskTeacherHighlighter.highlightElement(`[${elementIndex}]`, instruction);
      }
    });
    
    // Listen for clear highlights events
    document.addEventListener('taskTeacher:clearHighlights', function() {
      if (window.taskTeacherHighlighter) {
        window.taskTeacherHighlighter.clearHighlights();
      }
    });
    
    // Listen for refresh DOM event
    document.addEventListener('taskTeacher:refreshDOM', function() {
      if (window.taskTeacherDOMParser) {
        window.taskTeacherDOMParser.clearRegistry();
        window.taskTeacherDOMParser.getDOMData();
        reportUIState();
      }
    });
  }
  
  // Report element click to background script using a custom event
  // This will be handled by the content script, which has access to chrome.runtime
  function reportElementClick(elementIndex) {
    // Get additional data about the clicked element
    let elementDetails = {};
    if (window.taskTeacherDOMParser) {
      const domElement = window.taskTeacherDOMParser.getDomElementByIndex(elementIndex);
      if (domElement) {
        elementDetails = {
          tagName: domElement.tagName,
          text: domElement.text,
          xpath: domElement.xpath
        };
      }
    }
    
    // Create and dispatch custom event
    const event = new CustomEvent('taskTeacher:elementClicked', {
      detail: {
        elementIndex,
        url: window.location.href,
        elementDetails
      }
    });
    document.dispatchEvent(event);
  }
  
  // Report UI state to background script using a custom event
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
  
  // Highlight an element by index
  window.taskTeacherUIController.highlightElement = function(elementIndex, instruction) {
    if (window.taskTeacherHighlighter) {
      window.taskTeacherHighlighter.highlightElement(`[${elementIndex}]`, instruction);
      return true;
    }
    return false;
  };
  
  // Clear highlights
  window.taskTeacherUIController.clearHighlights = function() {
    if (window.taskTeacherHighlighter) {
      window.taskTeacherHighlighter.clearHighlights();
      return true;
    }
    return false;
  };
  
  // Force refresh DOM data
  window.taskTeacherUIController.refreshDOM = function() {
    if (window.taskTeacherDOMParser) {
      window.taskTeacherDOMParser.clearRegistry();
      const data = window.taskTeacherDOMParser.getDOMData();
      reportUIState();
      return data;
    }
    return null;
  };
  
  // Get current DOM data without refreshing
  window.taskTeacherUIController.getDOMData = function() {
    if (window.taskTeacherDOMParser) {
      return window.taskTeacherDOMParser.getDOMData();
    }
    return null;
  };
  
  // Find element by text or other criteria and highlight it
  window.taskTeacherUIController.findAndHighlight = function(criteria, instruction) {
    console.log("taskTeacherUIController.findAndHighlight")
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
  
  // Clean up event handlers
  window.taskTeacherUIController.cleanup = function() {
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