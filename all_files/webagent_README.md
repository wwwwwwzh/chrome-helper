# Task Teacher Chrome Extension

Task Teacher is a Chrome extension that helps users learn how to complete tasks step by step with AI guidance.

## Features

- Input a task you want to learn
- AI searches Google to gather information about the task
- Step-by-step guidance with visual highlights
- Learn by doing - follow along any website

## Installation

### Development Installation

1. Clone this repository:
```
git clone https://github.com/yourusername/task-teacher.git
```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top-right corner

4. Click "Load unpacked" and select the project directory

5. The extension should now appear in your Chrome toolbar

### Configuration

Before using the extension, you need to set up your Deepseek API key:

1. Get an API key from [Deepseek](https://deepseek.com)
2. Click on the extension icon and go to settings
3. Enter your API key in the field provided
4. Click Save

> This is extremely cheap. You only need to top up the minimal 2 dollar and you'll likely never use it up unless you really like using our system. (Each usage costs < 0.001 dollar)

## Usage

1. Click on the Task Teacher icon in your Chrome toolbar
2. Enter a task you want to learn (e.g., "How to book a flight ticket online")
3. Click "Start Learning"
4. Follow the step-by-step instructions provided by the AI
5. When instructed, click on the highlighted elements on the page
6. Continue through each step until you complete the task

## Architecture

The extension consists of the following components:

- **Popup UI**: The user interface for initiating tasks and viewing step instructions
- **Background Script**: Manages extension state and communicates with the AI API
- **Content Scripts**: Analyze the DOM, highlight elements, and handle user interactions
- **DOM Parser**: Extracts clickable elements and webpage structure
- **Highlighter**: Visually highlights elements for the user to interact with
- **UI Controller**: Handles user interactions with highlighted elements

## Code Explanation & Workflow

### Entry Points

The extension has several entry points:

1. **Extension Installation**: When installed, `background.js` initializes via the `onInstalled` listener:
```javascript
chrome.runtime.onInstalled.addListener(() => {
  console.log('Task Teacher extension installed');
  // Clear any existing state
  chrome.storage.local.set({ taskState: null });
});
```

2. **Popup UI Initialization**: When the popup is opened, `popup.js` initializes and checks for any ongoing task:
```javascript
document.addEventListener('DOMContentLoaded', () => {
  // ...initialization code...
  initialize();
});

const initialize = async () => {
  currentTab = await getCurrentTab();
  
  // Check if there's an ongoing task
  chrome.storage.local.get(['taskState'], (result) => {
    const taskState = result.taskState;
    // Update UI based on task state
  });
};
```

3. **Content Script Injection**: When a page loads, Chrome injects `content.js` based on the manifest.json rules:
```javascript
// Main content script that runs in the web page context
if (!window.taskTeacherInitialized) {
  window.taskTeacherInitialized = true;
  
  // Load additional scripts
  loadModule('highlighter.js');
  loadModule('dom-parser.js');
  loadModule('ui-controller.js');
}
```

### Core Workflow

#### 1. Starting a Task

When the user enters a task prompt and clicks "Start Learning", the following sequence occurs:

```javascript
// In popup.js
startTaskBtn.addEventListener('click', startTask);

const startTask = async () => {
  // Get task prompt and validate
  const taskPrompt = taskPromptInput.value.trim();
  
  // Send message to background script
  const response = await chrome.runtime.sendMessage({
    action: 'startTask',
    taskPrompt,
    tabId: currentTab.id
  });
};
```

The background script handles the request:

```javascript
// In background.js
async function handleStartTask(taskPrompt, tabId) {
  // 1. Reset task state
  taskState = {
    inProgress: true,
    tabId,
    taskPrompt,
    // ...other properties
  };
  
  // 2. Search for information about the task
  const searchURL = GOOGLE_SEARCH_URL + encodeURIComponent(taskPrompt + ' tutorial steps');
  await chrome.tabs.update(tabId, { url: searchURL });
  
  // 3. Wait for navigation to complete
  await waitForTabLoad(tabId);
  
  // 4. Extract information from search results
  const searchResults = await executeContentScript(tabId, {
    function: getSearchResultsFromPage
  });
  
  // 5. Compile task knowledge using AI
  taskState.taskKnowledge = await compileTaskKnowledge(taskPrompt, searchResults);
  
  // 6. Request first step
  return await handleGetNextStep(tabId);
}
```

#### 2. DOM Analysis

The DOM Parser module analyzes the page to find clickable elements:

```javascript
// In dom-parser.js
window.taskTeacherDOMParser.getDOMData = function() {
  const clickableElements = findClickableElements();
  
  return {
    url: window.location.href,
    title: document.title,
    clickableElements: clickableElements.map(el => el.toString()).join('\n')
  };
};

function findClickableElements() {
  // Basic selectors for potentially clickable elements
  const selectors = [
    'a', 'button', 'input[type="button"]', 'input[type="submit"]', 
    '[role="button"]', // ...and more
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
```

#### 3. Getting AI Guidance

The background script uses the Deepseek API to determine the next step:

```javascript
// In background.js
async function handleGetNextStep(tabId) {
  // 1. Get current page DOM data
  const domData = await executeContentScript(tabId, {
    function: getDOMData
  });
  
  // 2. Update task knowledge with page data
  const enhancedKnowledge = taskState.taskKnowledge + '\n\nCurrent page DOM elements:\n' + domData.clickableElements;
  
  // 3. Get next step from AI
  const aiResponse = await getAIResponse(taskState.taskPrompt, enhancedKnowledge, taskState.stepHistory);
  
  // 4. Parse AI response
  const { stepInstruction, elementToClick, isComplete } = parseAIResponse(aiResponse);
  
  // 5. Update task state
  taskState.currentStep = stepInstruction;
  taskState.isComplete = isComplete;
  
  // 6. Highlight the element to click
  if (!isComplete && elementToClick) {
    await executeContentScript(tabId, {
      function: highlightElement,
      args: [elementToClick]
    });
  }
  
  return {
    success: true,
    stepInstruction,
    isComplete
  };
}
```

The AI response format is structured for easy parsing:

```javascript
// AI response format
STEP: <brief instruction for this specific step>
ELEMENT: <element identifier in [X] format>
EXPLANATION: <brief explanation of what this step accomplishes>

// Or for completion
COMPLETE: <final message>
```

#### 4. Element Highlighting

The highlighter module creates visual overlays for elements:

```javascript
// In highlighter.js
window.taskTeacherHighlighter.highlightElement = function(elementIdentifier) {
  // 1. Clear existing highlights
  window.taskTeacherHighlighter.clearHighlights();
  
  // 2. Parse index from [X] format
  const indexMatch = elementIdentifier.match(/\[(\d+)\]/);
  const index = parseInt(indexMatch[1]);
  
  // 3. Get element using DOM parser
  let element = window.taskTeacherDOMParser.getElementByIndex(index);
  
  // 4. Create highlight overlay
  createHighlightOverlay(element, index);
  
  // 5. Scroll element into view
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
  
  return true;
};

function createHighlightOverlay(element, index) {
  // 1. Get container for highlights
  const container = getHighlightContainer();
  
  // 2. Get element position
  const rect = element.getBoundingClientRect();
  
  // 3. Create and position overlay
  const overlay = document.createElement('div');
  overlay.className = 'task-teacher-highlight-overlay';
  overlay.style.top = `${rect.top}px`;
  overlay.style.left = `${rect.left}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  
  // 4. Create and position label
  const label = document.createElement('div');
  label.className = 'task-teacher-highlight-label';
  label.textContent = index;
  // ...position calculation...
  
  // 5. Add to container
  container.appendChild(overlay);
  container.appendChild(label);
  
  // 6. Update positions on scroll and resize
  const updatePositions = () => {
    // ...position update logic...
  };
  
  window.addEventListener('scroll', updatePositions, { passive: true });
  window.addEventListener('resize', updatePositions, { passive: true });
}
```

#### 5. User Interaction

The UI controller handles user interactions with highlighted elements:

```javascript
// In ui-controller.js
function addGlobalClickHandler() {
  const clickHandler = function(event) {
    // Only process if we have a highlighted element
    if (activeElementIndex === null) return;
    
    // Find if clicked element matches highlighted element
    let currentElement = event.target;
    let foundHighlightedElement = false;
    
    while (currentElement && !foundHighlightedElement) {
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
      // Report click to background script
      reportElementClick(activeElementIndex);
      
      // Clear highlights
      window.taskTeacherHighlighter.clearHighlights();
      activeElementIndex = null;
    }
  };
  
  document.addEventListener('click', clickHandler, true);
}
```

#### 6. Task Completion

When all steps are completed, the background script signals completion:

```javascript
// In background.js
function parseAIResponse(response) {
  // Check if task is complete
  if (response.includes('COMPLETE:')) {
    const completeMatch = response.match(/COMPLETE:\s*(.+)$/);
    return {
      stepInstruction: completeMatch ? completeMatch[1] : 'Task complete!',
      elementToClick: null,
      isComplete: true
    };
  }
  
  // ...parse step instruction and element to click...
}
```

The popup UI then shows the completion screen:

```javascript
// In popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateTaskState') {
    if (message.tabId === currentTab.id) {
      // Update UI based on task state
      statusText.textContent = message.statusText || 'In progress...';
      
      if (message.currentStep) {
        currentStepDiv.innerHTML = message.currentStep;
      }
      
      if (message.isComplete) {
        taskProgressSection.classList.add('hidden');
        taskCompleteSection.classList.remove('hidden');
      }
    }
  }
  
  return true;
});
```

### Key Technical Implementations

1. **DOM Parsing Logic**: Adapted from browser use repo
   - Uses similar node structure and traversal methods
   - Simplified for JavaScript implementation

2. **Highlighting Mechanism**: Inspired by the browser use `buildDomTree.js` file
   - Creates overlays that follow elements during scrolling
   - Uses CSS animations for visual feedback

3. **Message Passing**: Uses Chrome's messaging system for communication
   - Background script acts as the central coordinator
   - Content scripts report DOM state and handle UI manipulation
   - Popup UI receives updates and displays information

## Development

### Project Structure

```
task-teacher/
├── manifest.json        # Extension configuration
├── background.js        # Background service worker
├── popup/               # Popup UI files
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/             # Content scripts
│   ├── content.js       # Main content script
│   ├── dom-parser.js    # DOM analysis module
│   ├── highlighter.js   # Element highlighting module
│   └── ui-controller.js # User interaction module
├── lib/                 # Utility libraries
│   ├── dom-utils.js
│   └── ai-service.js
├── assets/              # Static assets
│   ├── icon-16.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── styles.css
└── README.md            # Documentation
```

### Plan for Production

For a production build:

1. Minify JavaScript files
2. Optimize assets
3. Package the extension as a ZIP file

A build script is not included in this minimal version.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request or email me at w@unc.edu.