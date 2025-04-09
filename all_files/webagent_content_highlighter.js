/**
 * Highlighter module for Task Teacher extension
 * This module is responsible for highlighting elements on the page
 * Based on the highlighting logic from buildDomTree.js
 */

(function() {
    // Create namespace
    window.taskTeacherHighlighter = {};
    
    // Constants
    const HIGHLIGHT_CONTAINER_ID = 'task-teacher-highlight-container';
    const HIGHLIGHT_STYLES_ID = 'task-teacher-highlight-styles';
    
    // Initialize required styles
    function initializeStyles() {
      if (document.getElementById(HIGHLIGHT_STYLES_ID)) return;
      
      const style = document.createElement('style');
      style.id = HIGHLIGHT_STYLES_ID;
      style.textContent = `
        @keyframes task-teacher-pulse {
          0% {
            transform: scale(0.98);
            box-shadow: 0 0 0 0 rgba(66, 133, 244, 0.7);
          }
          
          70% {
            transform: scale(1.01);
            box-shadow: 0 0 0 10px rgba(66, 133, 244, 0);
          }
          
          100% {
            transform: scale(0.98);
            box-shadow: 0 0 0 0 rgba(66, 133, 244, 0);
          }
        }
        
        .task-teacher-highlight-overlay {
          position: absolute;
          border: 2px solid #4285f4;
          background-color: rgba(66, 133, 244, 0.1);
          border-radius: 3px;
          z-index: 9999;
          pointer-events: none;
          box-sizing: border-box;
          animation: task-teacher-pulse 1.5s infinite;
        }
        
        .task-teacher-highlight-label {
          position: absolute;
          background-color: #4285f4;
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          font-family: Arial, sans-serif;
          z-index: 10000;
          pointer-events: none;
        }
      `;
      
      document.head.appendChild(style);
    }
    
    // Get or create highlight container
    function getHighlightContainer() {
      let container = document.getElementById(HIGHLIGHT_CONTAINER_ID);
      
      if (!container) {
        container = document.createElement('div');
        container.id = HIGHLIGHT_CONTAINER_ID;
        container.style.position = 'fixed';
        container.style.pointerEvents = 'none';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
      }
      
      return container;
    }
    
    // Create highlight overlay for an element
    function createHighlightOverlay(element, index) {
      const container = getHighlightContainer();
      
      // Get element position
      const rect = element.getBoundingClientRect();
      
      // Create overlay
      const overlay = document.createElement('div');
      overlay.className = 'task-teacher-highlight-overlay';
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      
      // Create label
      const label = document.createElement('div');
      label.className = 'task-teacher-highlight-label';
      label.textContent = index;
      
      // Position label at top-right corner of element
      const labelWidth = 20;
      const labelHeight = 16;
      
      let labelTop = rect.top + 2;
      let labelLeft = rect.left + rect.width - labelWidth - 2;
      
      // If element is too small, position label outside
      if (rect.width < labelWidth + 4 || rect.height < labelHeight + 4) {
        labelTop = rect.top - labelHeight - 2;
        labelLeft = rect.left + rect.width - labelWidth;
      }
      
      label.style.top = `${labelTop}px`;
      label.style.left = `${labelLeft}px`;
      
      // Add to container
      container.appendChild(overlay);
      container.appendChild(label);
      
      // Update positions on scroll and resize
      const updatePositions = () => {
        const newRect = element.getBoundingClientRect();
        
        overlay.style.top = `${newRect.top}px`;
        overlay.style.left = `${newRect.left}px`;
        overlay.style.width = `${newRect.width}px`;
        overlay.style.height = `${newRect.height}px`;
        
        let newLabelTop = newRect.top + 2;
        let newLabelLeft = newRect.left + newRect.width - labelWidth - 2;
        
        if (newRect.width < labelWidth + 4 || newRect.height < labelHeight + 4) {
          newLabelTop = newRect.top - labelHeight - 2;
          newLabelLeft = newRect.left + newRect.width - labelWidth;
        }
        
        label.style.top = `${newLabelTop}px`;
        label.style.left = `${newLabelLeft}px`;
      };
      
      window.addEventListener('scroll', updatePositions, { passive: true });
      window.addEventListener('resize', updatePositions, { passive: true });
      
      // Return cleanup function
      return function cleanup() {
        window.removeEventListener('scroll', updatePositions);
        window.removeEventListener('resize', updatePositions);
        overlay.remove();
        label.remove();
      };
    }
    
    // Highlight element by index
    window.taskTeacherHighlighter.highlightElement = function(elementIdentifier) {
      try {
        // Clear existing highlights
        window.taskTeacherHighlighter.clearHighlights();
        
        // Initialize styles
        initializeStyles();
        
        // Parse index from [X] format
        const indexMatch = elementIdentifier.match(/\[(\d+)\]/);
        if (!indexMatch) {
          console.error('Invalid element identifier format:', elementIdentifier);
          return false;
        }
        
        const index = parseInt(indexMatch[1]);
        
        // Get element using DOM parser
        let element = null;
        if (window.taskTeacherDOMParser) {
          element = window.taskTeacherDOMParser.getElementByIndex(index);
        }
        
        // Fallback if DOM parser failed or element not found
        if (!element) {
          // Basic selectors for potentially clickable elements
          const selectors = [
            'a', 'button', 'input[type="button"]', 'input[type="submit"]', 
            'input[type="checkbox"]', 'input[type="radio"]', 'select', 
            '[role="button"]', '[role="link"]', '[role="checkbox"]', 
            '[role="tab"]', '[onclick]', '[tabindex]:not([tabindex="-1"])'
          ];
          
          const potentialElements = document.querySelectorAll(selectors.join(','));
          const visibleElements = [];
          
          for (let i = 0; i < potentialElements.length; i++) {
            const el = potentialElements[i];
            if (el.offsetWidth > 0 && el.offsetHeight > 0) {
              visibleElements.push(el);
            }
          }
          
          element = visibleElements[index];
        }
        
        if (!element) {
          console.error('Element not found:', elementIdentifier);
          return false;
        }
        
        // Create highlight
        createHighlightOverlay(element, index);
        
        // Scroll element into view
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        
        return true;
      } catch (error) {
        console.error('Error highlighting element:', error);
        return false;
      }
    };
    
    // Clear all highlights
    window.taskTeacherHighlighter.clearHighlights = function() {
      const container = document.getElementById(HIGHLIGHT_CONTAINER_ID);
      if (container) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }
      return true;
    };
    
    console.log('Highlighter initialized');
  })();