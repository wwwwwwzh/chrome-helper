/**
 * UI Controller module for Task Teacher extension
 * This module handles user interactions with the highlighted elements
 * and communicates with the background script
 */

(function() {
    // Create namespace
    window.taskTeacherUIController = {};
    
    // Keep track of click handlers
    let eventHandlers = [];
    let activeElementIndex = null;
    
    // Initialize controller
    function initialize() {
      // Listen for element clicks
      addGlobalClickHandler();
      
      // Add custom events for extension communication
      addCustomEventListeners();
      
      console.log('UI Controller initialized');
    }
    
    // Add global click handler to detect interactions with highlighted elements
    function addGlobalClickHandler() {
      const clickHandler = function(event) {
        // Only process if we have a highlighted element
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
          // Don't prevent default navigation for links and form submissions
          // this allows the natural flow of the webpage
          
          // Report click to background script
          reportElementClick(activeElementIndex);
          
          // Clear highlights after click
          if (window.taskTeacherHighlighter) {
            window.taskTeacherHighlighter.clearHighlights();
          }
          
          activeElementIndex = null;
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
    
    // Add custom event listeners for extension communication
    function addCustomEventListeners() {
      // Listen for highlight events
      document.addEventListener('taskTeacher:highlight', function(event) {
        const { elementIndex } = event.detail;
        
        if (window.taskTeacherHighlighter) {
          window.taskTeacherHighlighter.highlightElement(`[${elementIndex}]`);
          activeElementIndex = elementIndex;
        }
      });
      
      // Listen for clear highlights events
      document.addEventListener('taskTeacher:clearHighlights', function() {
        if (window.taskTeacherHighlighter) {
          window.taskTeacherHighlighter.clearHighlights();
        }
        activeElementIndex = null;
      });
    }
    
    // Report element click to background script
    function reportElementClick(elementIndex) {
      chrome.runtime.sendMessage({
        action: 'elementClicked',
        elementIndex,
        url: window.location.href
      }).catch(error => {
        console.error('Error reporting element click:', error);
      });
    }
    
    // Highlight an element by index
    window.taskTeacherUIController.highlightElement = function(elementIndex) {
      if (window.taskTeacherHighlighter) {
        window.taskTeacherHighlighter.highlightElement(`[${elementIndex}]`);
        activeElementIndex = elementIndex;
        return true;
      }
      return false;
    };
    
    // Clear highlights
    window.taskTeacherUIController.clearHighlights = function() {
      if (window.taskTeacherHighlighter) {
        window.taskTeacherHighlighter.clearHighlights();
        activeElementIndex = null;
        return true;
      }
      return false;
    };
    
    // Clean up event handlers
    window.taskTeacherUIController.cleanup = function() {
      eventHandlers.forEach(({ element, type, handler, options }) => {
        element.removeEventListener(type, handler, options);
      });
      eventHandlers = [];
    };
    
    // Initialize on load
    initialize();
    
    // Clean up on window unload
    window.addEventListener('beforeunload', () => {
      window.taskTeacherUIController.cleanup();
    });
  })();