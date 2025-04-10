/**
 * Optimized DOM Parser for Task Teacher extension
 * With efficient element indexing and caching
 */

(function () {
  // Initialize if not already done
  if (window.taskTeacherDOMParser) return;

  // Create namespace
  window.taskTeacherDOMParser = {};

  // Global element registry with a Map for fast lookups
  const ELEMENT_REGISTRY = new Map();
  let nextElementIndex = 0;

  // DOM element cache for expensive operations
  const DOM_CACHE = {
    boundingRects: new WeakMap(),
    computedStyles: new WeakMap()
  };

  DOM_CACHE.lastParsedTimestamp = 0;
  DOM_CACHE.lastUrl = '';


  // DOMElement class that holds metadata and reference to the actual element
  class DOMElement {
    constructor(element) {
      this.element = element; // Store reference to actual DOM element
      this.tagName = element.tagName.toLowerCase();
      this.attributes = getElementAttributes(element);
      this.isVisible = isElementVisible(element);
      this.isInteractive = isElementInteractive(element);
      this.xpath = getXPath(element);
      this.highlightIndex = null; // Will be set during registration
      this.text = getElementText(element);
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
        result += `>${this.text}`;
      } else {
        result += '>';
      }

      result += `</${this.tagName}>`;
      return result;
    }
  }

  // Get element text with sensible maximum length
  function getElementText(element) {
    const MAX_TEXT_LENGTH = 50;
    let text = element.textContent?.trim() || '';
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.substring(0, MAX_TEXT_LENGTH) + '...';
    }
    return text;
  }

  // Get bounding rect with caching
  function getCachedBoundingRect(element) {
    if (DOM_CACHE.boundingRects.has(element)) {
      return DOM_CACHE.boundingRects.get(element);
    }

    const rect = element.getBoundingClientRect();
    DOM_CACHE.boundingRects.set(element, rect);
    return rect;
  }

  // Get computed style with caching
  function getCachedComputedStyle(element) {
    if (DOM_CACHE.computedStyles.has(element)) {
      return DOM_CACHE.computedStyles.get(element);
    }

    const style = window.getComputedStyle(element);
    DOM_CACHE.computedStyles.set(element, style);
    return style;
  }

  // Get element attributes efficiently
  function getElementAttributes(element) {
    const attributes = {};
    const attributeNames = element.getAttributeNames ? element.getAttributeNames() : [];

    // For performance, only collect important attributes
    const importantAttrs = new Set([
      'id', 'class', 'type', 'role', 'name', 'aria-label', 'placeholder',
      'href', 'src', 'alt', 'title', 'value', 'checked', 'selected', 'tabindex'
    ]);

    for (const name of attributeNames) {
      if (importantAttrs.has(name)) {
        attributes[name] = element.getAttribute(name);
      }
    }

    return attributes;
  }

  // Get XPath efficiently
  function getXPath(element) {
    if (!element) return '';

    const segments = [];
    let currentElement = element;

    // Limit XPath generation to a reasonable depth to prevent performance issues
    const MAX_DEPTH = 10;
    let depth = 0;

    while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE && depth < MAX_DEPTH) {
      let index = 0;
      let sibling = currentElement.previousSibling;

      // Count only element siblings with same tag
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE &&
          sibling.tagName === currentElement.tagName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      const tagName = currentElement.tagName.toLowerCase();
      const pathIndex = index > 0 ? `[${index + 1}]` : '';
      segments.unshift(`${tagName}${pathIndex}`);

      currentElement = currentElement.parentNode;
      depth++;
    }

    return '/' + segments.join('/');
  }

  // Check if element is visible - optimized with early returns
  function isElementVisible(element) {
    // Quick check before expensive operations
    if (!element ||
      element.offsetWidth === 0 ||
      element.offsetHeight === 0 ||
      element.style.display === 'none' ||
      element.style.visibility === 'hidden') {
      return false;
    }

    // Use cached computed style
    const style = getCachedComputedStyle(element);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0';
  }

  // Check if element is interactive - optimized with set lookups
  function isElementInteractive(element) {
    if (!element) return false;

    // Common interactive elements
    const interactiveTags = new Set([
      'a', 'button', 'select', 'textarea', 'input',
      'summary', 'details', 'video', 'audio'
    ]);

    // Check tag name
    if (interactiveTags.has(element.tagName.toLowerCase())) {
      return true;
    }

    // Check common interactive roles
    const interactiveRoles = new Set([
      'button', 'link', 'checkbox', 'radio', 'tab', 'menuitem',
      'option', 'switch', 'menu', 'slider', 'listbox'
    ]);

    const role = element.getAttribute('role');
    if (role && interactiveRoles.has(role)) {
      return true;
    }

    // Check for event listeners and other interactive attributes
    if (element.onclick ||
      element.getAttribute('onclick') ||
      element.getAttribute('ng-click') ||
      element.getAttribute('@click') ||
      element.getAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') {
      return true;
    }

    // Check cursor style for potential interactive elements
    const style = getCachedComputedStyle(element);
    if (style.cursor === 'pointer') {
      return true;
    }

    return false;
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

  // Find interactive elements using an efficient selector strategy
  function findInteractiveElements() {
    // Use a more specific selector to reduce the initial set size
    const selectors = [
      'a[href]',                       // Links with hrefs (skip empty links)
      'button:not([disabled])',        // Enabled buttons
      'input:not([type="hidden"])',    // Visible inputs
      'select:not([disabled])',        // Enabled select boxes
      '[role="button"]',               // ARIA buttons
      '[role="link"]',                 // ARIA links
      '[onclick]',                     // Elements with click handlers
      '[tabindex]:not([tabindex="-1"])', // Focusable elements
      '.btn, .button'                  // Common button classes
    ];

    // Combine selectors for a single query (more efficient)
    const potentialElements = document.querySelectorAll(selectors.join(','));
    const interactiveElements = [];

    // Register interactive elements (using a faster for-loop instead of forEach)
    for (let i = 0; i < potentialElements.length; i++) {
      const element = potentialElements[i];

      // Skip invisible elements early for performance
      if (!isElementVisible(element)) continue;

      // Register element if truly interactive
      if (isElementInteractive(element)) {
        const domElement = registerElement(element);
        if (domElement) {
          interactiveElements.push(domElement);
        }
      }
    }

    return interactiveElements;
  }

  // Get DOM data with interactive elements
  window.taskTeacherDOMParser.getDOMData = function (forceRefresh = false) {
    const currentUrl = window.location.href;
    const currentTime = Date.now();

    // If it's been less than 500ms since our last parse and we're on the same page,
    // and we're not forced to refresh, use cached data
    if (!forceRefresh &&
      currentTime - DOM_CACHE.lastParsedTimestamp < 500 &&
      currentUrl === DOM_CACHE.lastUrl &&
      ELEMENT_REGISTRY.size > 0) {
      console.log('Using cached DOM data');
      return {
        url: currentUrl,
        title: document.title,
        clickableElements: Array.from(ELEMENT_REGISTRY.values())
          .map(el => el.toString())
          .join('\n')
      };
    }

    // Update cache metadata
    DOM_CACHE.lastParsedTimestamp = currentTime;
    DOM_CACHE.lastUrl = currentUrl;

    // Clear element registry and style caches
    ELEMENT_REGISTRY.clear();
    DOM_CACHE.boundingRects = new WeakMap();
    DOM_CACHE.computedStyles = new WeakMap();
    nextElementIndex = 0;

    // Find interactive elements
    const interactiveElements = findInteractiveElements();

    return {
      url: currentUrl,
      title: document.title,
      clickableElements: interactiveElements.map(el => el.toString()).join('\n')
    };
  };

  // Get element by highlight index - returns actual DOM element
  window.taskTeacherDOMParser.getElementByIndex = function (index) {
    const domElement = ELEMENT_REGISTRY.get(index);
    return domElement ? domElement.element : null;
  };

  // Get DOM element object by highlight index
  window.taskTeacherDOMParser.getDomElementByIndex = function (index) {
    return ELEMENT_REGISTRY.get(index);
  };

  // Find element on page by various criteria
  window.taskTeacherDOMParser.findElement = function (criteria) {
    // Find by text content
    if (criteria.text) {
      // Convert to lowercase for case-insensitive matching
      const targetText = criteria.text.toLowerCase();

      // Use entries for faster iteration with early return
      for (const [index, domElement] of ELEMENT_REGISTRY.entries()) {
        if (domElement.text.toLowerCase().includes(targetText)) {
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
          criteria.xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        return result.singleNodeValue;
      } catch (e) {
        console.error('Invalid XPath:', criteria.xpath);
      }
    }

    return null;
  };

  // Clear registry and caches
  window.taskTeacherDOMParser.clearRegistry = function () {
    ELEMENT_REGISTRY.clear();
    nextElementIndex = 0;
    DOM_CACHE.boundingRects = new WeakMap();
    DOM_CACHE.computedStyles = new WeakMap();
  };

  console.log('DOM Parser initialized with optimized element detection and caching');
})();