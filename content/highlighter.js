/**
 * Improved Highlighter module for Task Teacher extension
 * Features more reliable element highlighting and visual feedback
 */

(function() {
  // Create namespace
  window.taskTeacherHighlighter = {};
  
  // Constants
  const HIGHLIGHT_CONTAINER_ID = 'task-teacher-highlight-container';
  const HIGHLIGHT_STYLES_ID = 'task-teacher-highlight-styles';
  
  // Currently highlighted element index
  let activeHighlightIndex = null;
  
  // Keep track of cleanup functions
  let currentCleanupFunction = null;
  
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
        border: 2.5px solid #4285f4;
        background-color: rgba(66, 133, 244, 0.15);
        border-radius: 4px;
        z-index: 9999;
        pointer-events: none;
        box-sizing: border-box;
        animation: task-teacher-pulse 1.5s infinite;
      }
      
      .task-teacher-highlight-label {
        position: absolute;
        background-color: #4285f4;
        color: white;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: bold;
        font-family: Arial, sans-serif;
        z-index: 10000;
        pointer-events: none;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
      }

      .task-teacher-instruction {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 6px;
        font-family: Arial, sans-serif;
        font-size: 16px;
        max-width: 80%;
        text-align: center;
        z-index: 10001;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s ease;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      }
      
      .task-teacher-instruction.visible {
        opacity: 1;
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
  
  // Display instruction tooltip
  function showInstruction(instruction) {
    const container = getHighlightContainer();
    
    // Remove existing instruction if any
    const existingInstruction = document.querySelector('.task-teacher-instruction');
    if (existingInstruction) {
      existingInstruction.remove();
    }
    
    // Create new instruction
    const instructionEl = document.createElement('div');
    instructionEl.className = 'task-teacher-instruction';
    instructionEl.textContent = instruction || 'Click on the highlighted element';
    
    // Add to container and make visible
    container.appendChild(instructionEl);
    setTimeout(() => {
      instructionEl.classList.add('visible');
    }, 100);
    
    return instructionEl;
  }
  
  // Create highlight overlay for an element
  function createHighlightOverlay(element, index, instruction) {
    if (!element) {
      console.error('Cannot highlight null element');
      return null;
    }
    
    const container = getHighlightContainer();
    
    // Get element position
    const rect = element.getBoundingClientRect();
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'task-teacher-highlight-overlay';
    overlay.dataset.highlightIndex = index;
    
    // Position overlay
    positionOverlay(overlay, rect);
    
    // Create label
    const label = document.createElement('div');
    label.className = 'task-teacher-highlight-label';
    label.textContent = index;
    
    // Position label
    // positionLabel(label, rect);
    
    // Add to container
    container.appendChild(overlay);
    // container.appendChild(label);
    
    // Show instruction if provided
    let instructionEl = null;
    if (instruction) {
      instructionEl = showInstruction(instruction);
    }
    
    // Set active highlight index
    activeHighlightIndex = index;
    
    // Update positions on scroll and resize
    const updatePositions = () => {
      const newRect = element.getBoundingClientRect();
      positionOverlay(overlay, newRect);
      // positionLabel(label, newRect);
    };
    
    window.addEventListener('scroll', updatePositions, { passive: true });
    window.addEventListener('resize', updatePositions, { passive: true });
    
    // Return cleanup function
    return function cleanup() {
      window.removeEventListener('scroll', updatePositions);
      window.removeEventListener('resize', updatePositions);
      overlay.remove();
      label.remove();
      if (instructionEl) instructionEl.remove();
      activeHighlightIndex = null;
    };
  }
  
  // Position the overlay element
  function positionOverlay(overlay, rect) {
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }
  
  // Position the label element
  function positionLabel(label, rect) {
    const labelWidth = 28;
    const labelHeight = 24;
    
    // Default position (top-right corner)
    let labelTop = rect.top + labelHeight - 5;
    let labelLeft = rect.left + rect.width - labelWidth - 5;
    
    // Adjust if element is too close to top
    if (labelTop < 5) {
      labelTop = rect.bottom + 5;
    }
    
    // Adjust if element is too close to right edge
    if (labelLeft + labelWidth > window.innerWidth - 5) {
      labelLeft = rect.left;
    }
    
    label.style.top = `${labelTop}px`;
    label.style.left = `${labelLeft}px`;
  }
  
  // Clear all highlights - Explicitly defined here
  function clearHighlights() {
    const container = document.getElementById(HIGHLIGHT_CONTAINER_ID);
    if (container) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }
    
    // Clear active highlight index
    activeHighlightIndex = null;
    
    // Clear cleanup function
    if (currentCleanupFunction) {
      currentCleanupFunction = null;
    }
    
    return true;
  }
  
  // Highlight element by index
  window.taskTeacherHighlighter.highlightElement = function(elementIdentifier, instruction) {
    console.log("taskTeacherHighlighter.highlightElement:"+elementIdentifier)
    try {
      // Clear existing highlights
      clearHighlights();
      
      // Initialize styles
      initializeStyles();
      
      // Parse index from [X] format
      const indexMatch = elementIdentifier.match(/\[(\d+)\]/);
      if (!indexMatch) {
        console.error('Invalid element identifier format:', elementIdentifier);
        return false;
      }
      
      const index = parseInt(indexMatch[1]);
      
      // Get element from DOM parser registry
      let element = null;
      if (window.taskTeacherDOMParser) {
        element = window.taskTeacherDOMParser.getElementByIndex(index);
        console.log(element)
      }
      
      // If element is not found, try refreshing the DOM parser
      if (!element && window.taskTeacherDOMParser) {
        // Refresh DOM state
        window.taskTeacherDOMParser.getDOMData();
        element = window.taskTeacherDOMParser.getElementByIndex(index);
      }
      
      // Last resort fallback - try finding the element with the label's specified index
      if (!element) {
        const fallbackElement = document.querySelector(`[data-highlight-index="${index}"]`);
        if (fallbackElement) {
          element = fallbackElement;
        }
      }
      
      if (!element) {
        console.error('Element not found for index:', index);
        return false;
      }
      
      // Create highlight and store cleanup function
      currentCleanupFunction = createHighlightOverlay(element, index, instruction);
      
      // Scroll element into view if not already visible
      const rect = element.getBoundingClientRect();
      const isInViewport = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
      );
      
      if (!isInViewport) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error highlighting element:', error);
      return false;
    }
  };
  
  // Get currently active highlight index
  window.taskTeacherHighlighter.getActiveHighlightIndex = function() {
    return activeHighlightIndex;
  };
  
  // Expose the clear highlights function
  window.taskTeacherHighlighter.clearHighlights = clearHighlights;
  
  console.log('Improved Highlighter initialized');
})();