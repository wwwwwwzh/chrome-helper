/**
 * Enhanced DOM Parser for Task Teacher extension
 * This improves element indexing and mapping to ensure reliable highlighting
 */

(function() {
  // Create namespace
  window.taskTeacherDOMParser = {};
  
  // Global element registry - stores references to actual DOM elements
  const ELEMENT_REGISTRY = new Map();
  let nextElementIndex = 0;
  
  // DOMElement class that holds both metadata and reference to the actual element
  class DOMElement {
    constructor(element) {
      this.element = element; // Store reference to actual DOM element
      this.tagName = element.tagName.toLowerCase();
      this.attributes = getElementAttributes(element);
      this.isVisible = isElementVisible(element);
      this.isInteractive = isInteractiveElement(element);
      this.xpath = getXPath(element);
      this.highlightIndex = null; // Will be set during registration
      this.text = element.textContent.trim().substring(0, 50);
    }
    
    toString() {
      let result = `[${this.highlightIndex}]<${this.tagName} `;
      
      // Add important attributes
      const importantAttrs = ['id', 'class', 'role', 'type', 'name', 'aria-label'];
      const attrStrings = [];
      
      for (const attr of importantAttrs) {
        if (this.attributes[attr]) {
          attrStrings.push(`${attr}="${this.attributes[attr]}"`);
        }
      }
      
      if (attrStrings.length > 0) {
        result += attrStrings.join(' ') + ' ';
      }
      
      // Add text content
      if (this.text) {
        result += `>${this.text}${this.text.length > 50 ? '...' : ''}`;
      } else {
        result += '>';
      }
      
      result += `</${this.tagName}>`;
      return result;
    }
  }
  
  // Helper functions
  function getElementAttributes(element) {
    const attributes = {};
    for (const attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }
    return attributes;
  }
  
  function isElementVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    return (
      element.offsetWidth > 0 &&
      element.offsetHeight > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      style.opacity !== '0'
    );
  }
  
  function isInteractiveElement(element) {
    if (!element) return false;
    
    // Common interactive elements
    const interactiveTags = [
      'a', 'button', 'select', 'textarea', 'input',
      'video', 'audio', 'summary', 'details'
    ];
    
    // Check tag name
    if (interactiveTags.includes(element.tagName.toLowerCase())) {
      return true;
    }
    
    // Check role attribute
    const interactiveRoles = [
      'button', 'link', 'checkbox', 'menuitem', 'menuitemcheckbox',
      'menuitemradio', 'option', 'radio', 'searchbox', 'switch', 'tab'
    ];
    
    const role = element.getAttribute('role');
    if (role && interactiveRoles.includes(role)) {
      return true;
    }
    
    // Check for event listeners and other interactive attributes
    if (
      element.onclick ||
      element.addEventListener ||
      element.getAttribute('onclick') ||
      element.getAttribute('onmousedown') ||
      element.getAttribute('ontouchstart') ||
      element.getAttribute('tabindex') && element.getAttribute('tabindex') !== '-1'
    ) {
      return true;
    }
    
    // Check cursor style
    const style = window.getComputedStyle(element);
    if (style.cursor === 'pointer') {
      return true;
    }
    
    return false;
  }
  
  // Get XPath for element (simplified)
  function getXPath(element) {
    if (!element) return '';
    
    const paths = [];
    let current = element;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 0;
      let sibling = current.previousSibling;
      
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && 
            sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }
      
      const tagName = current.tagName.toLowerCase();
      const pathIndex = index > 0 ? `[${index + 1}]` : '';
      paths.unshift(`${tagName}${pathIndex}`);
      
      current = current.parentNode;
    }
    
    return '/' + paths.join('/');
  }
  
  // Create CSS selector from element properties
  function createCSSSelector(element) {
    // Start with tag selector
    let selector = element.tagName.toLowerCase();
    
    // Add ID if it exists (most specific)
    if (element.id) {
      return `${selector}#${element.id.replace(/:/g, '\\:')}`;
    }
    
    // Add classes if they exist
    if (element.className) {
      const classes = element.className.split(/\s+/)
        .filter(c => c && !c.includes(':')) // Filter out problematic classes
        .map(c => `.${c.replace(/:/g, '\\:')}`)
        .join('');
      if (classes) selector += classes;
    }
    
    // Add attributes for further specificity
    const attrSelectors = [];
    for (const attr of ['role', 'type', 'name', 'aria-label']) {
      const value = element.getAttribute(attr);
      if (value) {
        // Handle values with spaces or special characters
        if (/[\s'"]/.test(value)) {
          attrSelectors.push(`[${attr}*="${value.replace(/"/g, '\\"').substring(0, 20)}"]`);
        } else {
          attrSelectors.push(`[${attr}="${value}"]`);
        }
      }
    }
    
    // Add position to parent for uniqueness
    const parent = element.parentElement;
    if (parent && parent !== document.body) {
      const siblings = Array.from(parent.children).filter(
        child => child.tagName === element.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(element) + 1;
        selector += `:nth-child(${index})`;
      }
    }
    
    return selector + attrSelectors.join('');
  }
  
  // Register an element with the global registry
  function registerElement(element) {
    // Skip invisible elements
    if (!isElementVisible(element)) return null;
    
    // Create DOMElement object
    const domElement = new DOMElement(element);
    
    // Assign a unique index
    domElement.highlightIndex = nextElementIndex++;
    
    // Store in registry
    ELEMENT_REGISTRY.set(domElement.highlightIndex, domElement);
    
    return domElement;
  }
  
  // Find all interactive elements in the DOM
  function findInteractiveElements() {
    // Reset registry and indices for fresh scan
    ELEMENT_REGISTRY.clear();
    nextElementIndex = 0;
    
    // Basic selectors for potentially interactive elements
    const selectors = [
      'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
      '[role="button"]', '[role="link"]', '[role="checkbox"]', 
      '[role="tab"]', '[role="menuitem"]', '[role="option"]',
      '[onclick]', '[tabindex]:not([tabindex="-1"])',
      '[class*="btn"]', '[class*="button"]'
    ];
    
    const potentialElements = document.querySelectorAll(selectors.join(','));
    const interactiveElements = [];
    
    // Register interactive elements
    for (const element of potentialElements) {
      if (isElementVisible(element) && isInteractiveElement(element)) {
        const domElement = registerElement(element);
        if (domElement) {
          interactiveElements.push(domElement);
        }
      }
    }
    
    return interactiveElements;
  }
  
  // Get DOM data including interactive elements
  window.taskTeacherDOMParser.getDOMData = function() {
    const interactiveElements = findInteractiveElements();
    
    return {
      url: window.location.href,
      title: document.title,
      clickableElements: interactiveElements.map(el => el.toString()).join('\n')
    };
  };
  
  // Get element by highlight index - returns actual DOM element
  window.taskTeacherDOMParser.getElementByIndex = function(index) {
    const domElement = ELEMENT_REGISTRY.get(index);
    return domElement ? domElement.element : null;
  };

  // Get DOM element object by highlight index
  window.taskTeacherDOMParser.getDomElementByIndex = function(index) {
    return ELEMENT_REGISTRY.get(index);
  };
  
  // Find element on page by various criteria
  window.taskTeacherDOMParser.findElement = function(criteria) {
    // Find by text content
    if (criteria.text) {
      for (const [_, domElement] of ELEMENT_REGISTRY.entries()) {
        if (domElement.text.includes(criteria.text)) {
          return domElement.element;
        }
      }
    }
    
    // Find by selector
    if (criteria.selector) {
      try {
        return document.querySelector(criteria.selector);
      } catch (e) {
        console.error('Invalid selector:', criteria.selector);
      }
    }
    
    // Find by xpath
    if (criteria.xpath) {
      try {
        const result = document.evaluate(
          criteria.xpath, document, null, 
          XPathResult.FIRST_ORDERED_NODE_TYPE, null
        );
        return result.singleNodeValue;
      } catch (e) {
        console.error('Invalid XPath:', criteria.xpath);
      }
    }
    
    return null;
  };
  
  // Clear registry (useful when page changes significantly)
  window.taskTeacherDOMParser.clearRegistry = function() {
    ELEMENT_REGISTRY.clear();
    nextElementIndex = 0;
  };
  
  console.log('DOM Parser initialized with enhanced element registry');
})();