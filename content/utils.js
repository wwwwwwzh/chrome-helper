// utils.js - New file to add to your project
const TaskTeacherUtils = {
    // DOM utilities
    dom: {
      isElementVisible: function(element) {
        if (!element) return false;
        
        const style = window.getComputedStyle(element);
        return (
          element.offsetWidth > 0 &&
          element.offsetHeight > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0'
        );
      },
      
      getElementAttributes: function(element) {
        const attributes = {};
        for (const attr of element.attributes) {
          attributes[attr.name] = attr.value;
        }
        return attributes;
      },
      
      getXPath: function(element) {
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
      },
      
      isInteractiveElement: function(element) {
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
      },
      
      getFallbackDOMData: function() {
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
    }
  };
  
  // Make it available globally if needed in page context
  if (typeof window !== 'undefined') {
    window.TaskTeacherUtils = TaskTeacherUtils;
  }