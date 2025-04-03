/**
 * DOM Parser module for Task Teacher extension
 * This module is responsible for analyzing the DOM structure and extracting clickable elements
 * It's based on the DOM parsing logic from the uploaded files (views.py, service.py)
 */

(function() {
    // Create namespace
    window.taskTeacherDOMParser = {};
    
    // DOM element class (simplified version of DOMElementNode from views.py)
    class DOMElement {
      constructor(element, index = null) {
        this.element = element;
        this.tagName = element.tagName.toLowerCase();
        this.attributes = getElementAttributes(element);
        this.isVisible = isElementVisible(element);
        this.isInteractive = isInteractiveElement(element);
        this.isInViewport = isInViewport(element);
        this.highlightIndex = index;
        this.xpath = getXPath(element);
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
        const text = this.element.textContent.trim();
        if (text) {
          result += `>${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`;
        } else {
          result += '>';
        }
        
        result += `</${this.tagName}>`;
        return result;
      }
    }
    
    // Get element attributes
    function getElementAttributes(element) {
      const attributes = {};
      for (const attr of element.attributes) {
        attributes[attr.name] = attr.value;
      }
      return attributes;
    }
    
    // Check if element is visible
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
    
    // Check if element is interactive
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
      
      // Check for event listeners
      if (
        element.onclick ||
        element.addEventListener ||
        element.getAttribute('onclick') ||
        element.getAttribute('onmousedown') ||
        element.getAttribute('ontouchstart')
      ) {
        return true;
      }
      
      // Check for specific classes that often indicate interactivity
      const className = element.className || '';
      const interactiveClasses = ['btn', 'button', 'clickable', 'link'];
      if (interactiveClasses.some(cls => className.includes(cls))) {
        return true;
      }
      
      // Check tabindex
      if (element.getAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') {
        return true;
      }
      
      // Check cursor style
      const style = window.getComputedStyle(element);
      if (style.cursor === 'pointer') {
        return true;
      }
      
      return false;
    }
    
    // Check if element is in viewport
    function isInViewport(element) {
      const rect = element.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
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
    
    // Find all clickable elements in the DOM
    function findClickableElements() {
      // Basic selectors for potentially clickable elements
      const selectors = [
        'a', 'button', 'input[type="button"]', 'input[type="submit"]', 
        'input[type="checkbox"]', 'input[type="radio"]', 'select', 
        '[role="button"]', '[role="link"]', '[role="checkbox"]', 
        '[role="tab"]', '[onclick]', '[tabindex]:not([tabindex="-1"])'
      ];
      
      const potentialElements = document.querySelectorAll(selectors.join(','));
      const clickableElements = [];
      
      // Filter and create DOMElement objects
      for (let i = 0; i < potentialElements.length; i++) {
        const element = potentialElements[i];
        
        // Skip hidden elements
        if (!isElementVisible(element)) continue;
        
        // Create DOM element object
        const domElement = new DOMElement(element, clickableElements.length);
        clickableElements.push(domElement);
      }
      
      return clickableElements;
    }
    
    // Get DOM data including clickable elements
    window.taskTeacherDOMParser.getDOMData = function() {
      const clickableElements = findClickableElements();
      
      return {
        url: window.location.href,
        title: document.title,
        clickableElements: clickableElements.map(el => el.toString()).join('\n')
      };
    };
    
    // Get element by highlight index
    window.taskTeacherDOMParser.getElementByIndex = function(index) {
      const elements = findClickableElements();
      return elements[index] ? elements[index].element : null;
    };
    
    console.log('DOM Parser initialized');
  })();