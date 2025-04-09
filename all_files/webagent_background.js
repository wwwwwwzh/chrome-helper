// Listen for tab updates to detect page navigations
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only process for the active task tab
    if (!taskState.inProgress || taskState.tabId !== tabId) {
        return;
    }

    // When page finished loading
    if (changeInfo.status === 'complete') {
        console.log('Page loaded in task tab:', tab.url);

        // Update task status
        taskState.statusText = 'Page loaded, analyzing...';
        updateTaskStateUI();

        // Wait a moment for any post-load scripts to run, then get next step
        setTimeout(async () => {
            try {
                if (taskState.inProgress && taskState.tabId === tabId) {
                    await handleGetNextStep(tabId);
                }
            } catch (error) {
                console.log('Error getting next step after page load:', error);
            }
        }, 1500);
    }
});// Handle element click from the content script
async function handleElementClick(elementIndex, tabId, url) {
    try {
        // Verify this is for the current task
        if (!taskState.inProgress || taskState.tabId !== tabId) {
            return { success: false, error: 'No active task for this tab' };
        }

        console.log(`Element [${elementIndex}] clicked in tab ${tabId}`);

        // Add to step history
        if (taskState.stepHistory.length > 0) {
            const lastStep = taskState.stepHistory[taskState.stepHistory.length - 1];
            lastStep.clicked = true;
            lastStep.elementClicked = `[${elementIndex}]`;
        }

        // Save task state
        await chrome.storage.local.set({ taskState });

        // Wait a moment to let any page navigation start
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if we're still on the same page
        let currentUrl = url;
        try {
            const tab = await chrome.tabs.get(tabId);
            currentUrl = tab.url;
        } catch (e) {
            console.log('Error getting tab URL:', e);
        }

        // If we're still on the same page, automatically request next step
        if (currentUrl === url) {
            // Delay a bit to let any dynamic page changes occur
            setTimeout(async () => {
                if (taskState.inProgress && taskState.tabId === tabId) {
                    try {
                        await handleGetNextStep(tabId);
                    } catch (error) {
                        console.log('Error getting next step after click:', error);
                    }
                }
            }, 1500); // Wait 1.5 seconds
        } else {
            // Page is changing, wait for load completion
            console.log('Page navigation detected, waiting for page load...');

            taskState.statusText = 'Page loading...';
            updateTaskStateUI();

            // We'll rely on the tab update listener to trigger the next step
        }

        return { success: true };
    } catch (error) {
        console.log('Error handling element click:', error);
        return { success: false, error: error.message };
    }
}// Background script that manages the extension's state and communicates with the AI service

// Constants
const DEEPSEEK_API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q=';

// Global state
let taskState = {
    inProgress: false,
    tabId: null,
    taskPrompt: '',
    taskKnowledge: '',
    currentStep: '',
    stepHistory: [],
    statusText: '',
    isComplete: false
};

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('Task Teacher extension installed');

    // Clear any existing state
    chrome.storage.local.set({ taskState: null });
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message);

    switch (message.action) {
        case 'startTask':
            handleStartTask(message.taskPrompt, message.tabId)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true; // Keep channel open for async response

        case 'getNextStep':
            handleGetNextStep(message.tabId)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        case 'endTask':
            handleEndTask(message.tabId)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        case 'reportUIState':
            // Content script reporting the UI state and DOM information
            handleUIStateReport(message.domData, message.tabId)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        case 'setApiKey':
            // Handle API key setting
            setApiKey(message.apiKey)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        case 'elementClicked':
            // Handle element click event from content script
            handleElementClick(message.elementIndex, message.tabId, message.url)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        default:
            sendResponse({ success: false, error: 'Unknown action' });
            return false;
    }
});

// Handle starting a new task
async function handleStartTask(taskPrompt, tabId) {
    try {
        // Reset task state
        taskState = {
            inProgress: true,
            tabId,
            taskPrompt,
            taskKnowledge: '',
            currentStep: '',
            stepHistory: [],
            statusText: 'Searching for information...',
            isComplete: false
        };

        // Save state
        await chrome.storage.local.set({ taskState });

        // Update UI
        updateTaskStateUI();

        // Search for information about the task
        // const searchURL = GOOGLE_SEARCH_URL + encodeURIComponent(taskPrompt + ' tutorial steps');

        // // Navigate to Google search
        // await chrome.tabs.update(tabId, { url: searchURL });

        // // Wait for navigation to complete
        // await waitForTabLoad(tabId);

        // // Get info from search results
        // taskState.statusText = 'Gathering search results...';
        // console.log(taskState.statusText)

        // updateTaskStateUI();

        // // Extract information from search results
        // const searchResults = await executeContentScript(tabId, {
        //     function: getSearchResultsFromPage
        // });

        // // Visit first result page to get detailed information
        // if (searchResults && searchResults.length > 0) {
        //     const firstResult = searchResults[0];

        //     taskState.statusText = 'Visiting top resource...';
        //     updateTaskStateUI();

        //     // Navigate to the first result
        //     await chrome.tabs.update(tabId, { url: firstResult.url });

        //     // Wait for page to load
        //     await waitForTabLoad(tabId);

        //     // Extract main content from the page
        //     taskState.statusText = 'Extracting detailed information...';
        //     updateTaskStateUI();

        //     const pageContent = await executeContentScript(tabId, {
        //         function: extractMainContent
        //     });

        //     // Add page content to search results
        //     searchResults.unshift({
        //         title: firstResult.title,
        //         url: firstResult.url,
        //         content: pageContent,
        //         isMainContent: true
        //     });
        // }

        // // Compile task knowledge
        // taskState.statusText = 'Analyzing information...';
        // updateTaskStateUI();

        // taskState.taskKnowledge = await compileTaskKnowledge(taskPrompt, searchResults);
        // taskState.statusText = 'Ready to begin!';

        // Save state
        await chrome.storage.local.set({ taskState });
        updateTaskStateUI();

        // Request first step
        return await handleGetNextStep(tabId);

    } catch (error) {
        console.log('Error starting task:', error);
        taskState.inProgress = false;
        await chrome.storage.local.set({ taskState });
        return { success: false, error: error.message };
    }
}

// Handle getting the next step
async function handleGetNextStep(tabId) {
    try {
        if (!taskState.inProgress || taskState.tabId !== tabId) {
            throw new Error('No active task for this tab');
        }

        taskState.statusText = 'Analyzing current page...';
        updateTaskStateUI();

        // Get current page DOM data
        const domData = await executeContentScript(tabId, {
            function: getDOMData
        });

        // Update task knowledge with page data
        const enhancedKnowledge = taskState.taskKnowledge + '\n\nCurrent page DOM elements:\n' + domData.clickableElements;

        // Get next step from AI
        const aiResponse = await getAIResponse(taskState.taskPrompt, enhancedKnowledge, taskState.stepHistory);

        // Parse AI response to get step and element to click
        const { stepInstruction, elementToClick, isComplete } = parseAIResponse(aiResponse);

        // Update task state
        taskState.currentStep = stepInstruction;
        taskState.isComplete = isComplete;
        taskState.statusText = isComplete ? 'Task complete!' : 'Ready for next action';

        // Add to step history
        taskState.stepHistory.push({
            instruction: stepInstruction,
            elementToClick
        });

        // Save state
        await chrome.storage.local.set({ taskState });
        updateTaskStateUI();

        // If not complete, highlight the element to click
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

    } catch (error) {
        console.log('Error getting next step:', error);
        return { success: false, error: error.message };
    }
}

// Handle ending the task
async function handleEndTask(tabId) {
    try {
        // Clear highlights on the page
        if (taskState.inProgress && taskState.tabId === tabId) {
            await executeContentScript(tabId, {
                function: clearHighlights
            });
        }

        // Reset task state
        taskState = {
            inProgress: false,
            tabId: null,
            taskPrompt: '',
            taskKnowledge: '',
            currentStep: '',
            stepHistory: [],
            statusText: '',
            isComplete: false
        };

        // Save state
        await chrome.storage.local.set({ taskState });

        return { success: true };

    } catch (error) {
        console.log('Error ending task:', error);
        return { success: false, error: error.message };
    }
}

// Handle UI state reports from content script
async function handleUIStateReport(domData, tabId) {
    if (!taskState.inProgress || taskState.tabId !== tabId) {
        return { success: false, error: 'No active task for this tab' };
    }

    // Store the DOM data for future use
    taskState.latestDOMData = domData;

    return { success: true };
}

// Update UI in the popup
function updateTaskStateUI() {
    if (taskState.inProgress) {
        chrome.runtime.sendMessage({
            action: 'updateTaskState',
            tabId: taskState.tabId,
            statusText: taskState.statusText,
            currentStep: taskState.currentStep,
            isComplete: taskState.isComplete
        });
    }
}

// Utility to execute a function in the content script
async function executeContentScript(tabId, details) {
    return new Promise((resolve, reject) => {
        try {
            // First check if tab exists
            chrome.tabs.get(tabId, (tab) => {
                if (chrome.runtime.lastError) {
                    return reject(new Error(`Tab does not exist: ${chrome.runtime.lastError.message}`));
                }

                // Then execute the script
                chrome.scripting.executeScript({
                    target: { tabId },
                    function: details.function,
                    args: details.args || []
                }, (results) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(`Script execution failed: ${chrome.runtime.lastError.message}`));
                    } else if (results && results.length > 0) {
                        resolve(results[0].result);
                    } else {
                        reject(new Error('No results from content script'));
                    }
                });
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Wait for tab to finish loading
function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
        const listener = (changedTabId, changeInfo) => {
            if (changedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                // Give the page a moment to fully initialize
                setTimeout(resolve, 1000);
            }
        };

        chrome.tabs.onUpdated.addListener(listener);

        // Check if already loaded
        chrome.tabs.get(tabId, (tab) => {
            if (tab.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                // Give the page a moment to fully initialize
                setTimeout(resolve, 1000);
            }
        });
    });
}

// Get search results from the Google search page
function getSearchResultsFromPage() {
    const results = [];

    // Extract search results
    const searchResults = document.querySelectorAll('.g');

    searchResults.forEach((result) => {
        const titleElement = result.querySelector('h3');
        const linkElement = result.querySelector('a');
        const snippetElement = result.querySelector('.VwiC3b');

        if (titleElement && linkElement && snippetElement) {
            results.push({
                title: titleElement.textContent,
                url: linkElement.href,
                snippet: snippetElement.textContent
            });
        }
    });

    return results.slice(0, 5); // Limit to 5 results for brevity
}

// Extract main content from a webpage
function extractMainContent() {
    // Helper function to calculate text density (text length / element size)
    function calculateTextDensity(element) {
        if (!element) return 0;
        const text = element.textContent || '';
        const textLength = text.trim().length;
        if (textLength === 0) return 0;

        // Get element dimensions
        const rect = element.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area === 0) return 0;

        return textLength / area;
    }

    // Helper to calculate the content score
    function calculateContentScore(element) {
        if (!element) return 0;

        // Tags that likely contain main content
        const contentTags = ['article', 'main', 'section', 'div', '.content', '.post', '.entry'];

        // Headline tags
        const headingTags = ['h1', 'h2', 'h3'];

        // Content indicator tags
        const paragraphTags = ['p', 'li', 'blockquote'];

        let score = 0;

        // Check if element has content-indicating tag
        contentTags.forEach(tag => {
            if (tag.startsWith('.')) {
                // Class selector
                const className = tag.substring(1);
                if (element.classList.contains(className)) {
                    score += 30;
                }
            } else if (element.tagName.toLowerCase() === tag) {
                // Tag selector
                score += 20;
            }
        });

        // Check if element contains headings
        const headings = element.querySelectorAll(headingTags.join(','));
        score += headings.length * 10;

        // Check if element contains paragraph-like elements
        const paragraphs = element.querySelectorAll(paragraphTags.join(','));
        score += paragraphs.length * 5;

        // Check text density
        const density = calculateTextDensity(element);
        score += density * 100;

        // Penalize for common non-content elements
        const hasNavbar = element.querySelector('nav') !== null;
        const hasFooter = element.querySelector('footer') !== null;
        const hasSidebar = element.querySelector('aside, .sidebar, [id*="sidebar"]') !== null;
        const hasComments = element.querySelector('[id*="comment"], [class*="comment"]') !== null;

        if (hasNavbar) score -= 30;
        if (hasFooter) score -= 30;
        if (hasSidebar) score -= 20;
        if (hasComments) score -= 20;

        return score;
    }

    // Find the most likely content element
    function findMainContent() {
        // Try common content containers first
        const contentSelectors = [
            'article',
            'main',
            '.post-content',
            '.article-content',
            '.entry-content',
            '.post',
            '.content'
        ];

        for (const selector of contentSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim().length > 500) {
                return element;
            }
        }

        // If common selectors didn't work, try scoring approach
        const containers = document.querySelectorAll('div, section, article, main');
        let bestElement = null;
        let bestScore = 0;

        for (const container of containers) {
            const score = calculateContentScore(container);
            if (score > bestScore) {
                bestScore = score;
                bestElement = container;
            }
        }

        return bestElement;
    }

    // Find and extract content
    const mainContentElement = findMainContent();

    if (!mainContentElement) {
        // Fallback: Just grab visible text from the page
        const bodyText = document.body.innerText;
        return bodyText.substring(0, 5000); // Limit to 5000 chars
    }

    // Extract structured content
    const result = {
        title: document.title,
        url: window.location.href,
        headings: [],
        content: ''
    };

    // Extract headings
    const headings = mainContentElement.querySelectorAll('h1, h2, h3, h4');
    headings.forEach(heading => {
        result.headings.push({
            level: parseInt(heading.tagName.substring(1)),
            text: heading.textContent.trim()
        });
    });

    // Extract paragraphs and lists
    const contentElements = mainContentElement.querySelectorAll('p, li, blockquote');
    const contentTexts = [];

    contentElements.forEach(element => {
        const text = element.textContent.trim();
        if (text.length > 20) { // Skip very short elements
            if (element.tagName.toLowerCase() === 'li') {
                contentTexts.push(`• ${text}`);
            } else {
                contentTexts.push(text);
            }
        }
    });

    result.content = contentTexts.join('\n\n');

    // Limit total content size
    if (result.content.length > 8000) {
        result.content = result.content.substring(0, 8000) + '... (content truncated)';
    }

    return result;
}

// Get DOM data from the current page
function getDOMData() {
    // First, check if our content script is already running
    if (window.taskTeacherDOMParser) {
        return window.taskTeacherDOMParser.getDOMData();
    }

    // Fallback: simple implementation to extract clickable elements
    const clickableElements = [];
    const selectors = [
        'a', 'button', 'input[type="button"]', 'input[type="submit"]',
        '[role="button"]', '[onclick]', '.btn', '.button'
    ];

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

    return {
        url: window.location.href,
        title: document.title,
        clickableElements: clickableElements.join('\n')
    };
}

// Highlight an element on the page
function highlightElement(elementIdentifier) {
    // Check if our content script is running
    if (window.taskTeacherHighlighter) {
        return window.taskTeacherHighlighter.highlightElement(elementIdentifier);
    }

    // Fallback: Simple highlighting by index
    const index = parseInt(elementIdentifier.replace(/[^\d]/g, ''));
    const selectors = [
        'a', 'button', 'input[type="button"]', 'input[type="submit"]',
        '[role="button"]', '[onclick]', '.btn', '.button'
    ];

    const elements = document.querySelectorAll(selectors.join(','));
    let visibleElements = [];

    for (const el of elements) {
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
            visibleElements.push(el);
        }
    }

    const element = visibleElements[index];

    if (!element) {
        console.log('Element not found:', elementIdentifier);
        return false;
    }

    // Create highlight overlay
    const overlay = document.createElement('div');
    overlay.id = 'task-teacher-highlight';
    overlay.style.position = 'absolute';
    overlay.style.border = '2px solid #4285f4';
    overlay.style.borderRadius = '3px';
    overlay.style.backgroundColor = 'rgba(66, 133, 244, 0.1)';
    overlay.style.zIndex = '9999';
    overlay.style.pointerEvents = 'none';
    overlay.style.boxShadow = '0 0 10px rgba(66, 133, 244, 0.5)';
    overlay.style.animation = 'task-teacher-pulse 1.5s infinite';

    // Add styles if they don't exist
    if (!document.querySelector('#task-teacher-styles')) {
        const style = document.createElement('style');
        style.id = 'task-teacher-styles';
        style.textContent = `
        @keyframes task-teacher-pulse {
          0% { box-shadow: 0 0 5px rgba(66, 133, 244, 0.5); }
          50% { box-shadow: 0 0 20px rgba(66, 133, 244, 0.8); }
          100% { box-shadow: 0 0 5px rgba(66, 133, 244, 0.5); }
        }
      `;
        document.head.appendChild(style);
    }

    // Position overlay
    const rect = element.getBoundingClientRect();
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    // Remove any existing highlight
    const existing = document.getElementById('task-teacher-highlight');
    if (existing) {
        existing.remove();
    }

    document.body.appendChild(overlay);

    // Scroll element into view if needed
    element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });

    return true;
}

// Clear all highlights
function clearHighlights() {
    // Check if our content script is running
    if (window.taskTeacherHighlighter) {
        return window.taskTeacherHighlighter.clearHighlights();
    }

    // Fallback: Remove highlight overlay
    const highlight = document.getElementById('task-teacher-highlight');
    if (highlight) {
        highlight.remove();
    }

    return true;
}

// Compile task knowledge from search results
async function compileTaskKnowledge(taskPrompt, searchResults) {
    // Check if we have main content from a page
    let mainContent = '';
    let formattedResults = '';

    // Find the main content result (if any)
    const mainContentResult = searchResults.find(result => result.isMainContent);

    if (mainContentResult && mainContentResult.content) {
        // Format the main content
        mainContent = `# Main Content from ${mainContentResult.title}\n\n`;

        if (typeof mainContentResult.content === 'string') {
            mainContent += mainContentResult.content;
        } else {
            // Structured content
            mainContent += `URL: ${mainContentResult.content.url}\n\n`;

            // Add headings in a structured way
            if (mainContentResult.content.headings && mainContentResult.content.headings.length > 0) {
                mainContent += "## Table of Contents\n";
                mainContentResult.content.headings.forEach(heading => {
                    const indent = "  ".repeat(heading.level - 1);
                    mainContent += `${indent}- ${heading.text}\n`;
                });
                mainContent += "\n";
            }

            // Add main content
            mainContent += mainContentResult.content.content;
        }
    }

    // Format regular search results
    formattedResults = searchResults
        .filter(result => !result.isMainContent)
        .map(result =>
            `Title: ${result.title}\nURL: ${result.url}\nSnippet: ${result.snippet || ''}`
        ).join('\n\n');

    // Combine both sources
    const combinedContent = mainContent + '\n\n# Additional Search Results\n\n' + formattedResults;

    // Get AI to extract relevant knowledge
    const systemPrompt = `You are a helpful assistant that helps users learn how to complete tasks step by step.
    
  TASK: "${taskPrompt}"
  
  Your job is to:
  1. Extract the most relevant information about how to complete this task
  2. Organize it into a clear, step-by-step procedure
  3. Include important details, prerequisites, and potential challenges
  4. Focus on actionable instructions rather than general information
  5. If steps require interacting with website UI elements, be specific about what to click, enter, or select
  
  Return your response as a structured knowledge base that will be used to guide the user through each step of the task.`;
    console.log(combinedContent)
    try {
        const response = await fetch(DEEPSEEK_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await getApiKey()}`
            },
            body: JSON.stringify({
                model: DEEPSEEK_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: combinedContent }
                ],
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.log('Error compiling task knowledge:', error);
        return `Information about ${taskPrompt}:\n- This task involves multiple steps\n- The extension will guide you through each step`;
    }
}

// Get AI response for the next step
async function getAIResponse(taskPrompt, knowledge, stepHistory) {
    const systemPrompt = `You are an AI assistant that helps users complete tasks step-by-step.
    
  Your goal is to provide clear, concise instructions for each step of the task, and identify which clickable element on the current page the user should interact with next.
  
  The user has asked to learn: "${taskPrompt}"
  
  You have the following knowledge about this task:
  ${knowledge}
  
  Guidelines:
  1. Provide ONE clear instruction for the next step only
  2. Based on the DOM elements available, specify EXACTLY which element should be clicked using the format [X] where X is the index number
  3. Your response must be in this exact format:
     STEP: <brief instruction for this specific step>
     ELEMENT: <element identifier in [X] format>
     EXPLANATION: <brief explanation of what this step accomplishes>
  4. If the task is complete, respond with "COMPLETE: <final message>"
  5. Focus on the most likely next action based on the current page state
  6. If no suitable element exists on the page, suggest navigating to a relevant page first`;

    // Build conversation history
    const messages = [
        { role: 'system', content: systemPrompt }
    ];

    // Add step history as conversation context
    if (stepHistory.length > 0) {
        messages.push({
            role: 'user',
            content: `I've completed the following steps:\n${stepHistory.map((step, i) =>
                `${i + 1}. ${step.instruction} (clicked: ${step.elementToClick || 'N/A'})`
            ).join('\n')}`
        });
    }

    // Add current request
    messages.push({
        role: 'user',
        content: `I'm now on a page with these elements. What should I do next?`
    });

    console.log(messages)

    try {
        const response = await fetch(DEEPSEEK_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await getApiKey()}`
            },
            body: JSON.stringify({
                model: DEEPSEEK_MODEL,
                messages: messages,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.log('Error getting AI response:', error);
        return 'STEP: Continue with the task\nELEMENT: [0]\nEXPLANATION: Unable to get AI guidance, try clicking this element to proceed.';
    }
}

// Parse AI response to extract step, element, and completion status
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

    // Extract step instruction
    let stepInstruction = '';
    const stepMatch = response.match(/STEP:\s*(.+?)(\n|$)/);
    if (stepMatch) {
        stepInstruction = stepMatch[1];
    }

    // Extract element to click
    let elementToClick = null;
    const elementMatch = response.match(/ELEMENT:\s*\[(\d+)\]/);
    if (elementMatch) {
        elementToClick = `[${elementMatch[1]}]`;
    }

    // Extract explanation and add it to the instruction
    const explanationMatch = response.match(/EXPLANATION:\s*(.+?)(\n|$)/);
    if (explanationMatch) {
        stepInstruction += `\n\n${explanationMatch[1]}`;
    }

    return {
        stepInstruction,
        elementToClick,
        isComplete: false
    };
}

// Get API key from storage
async function getApiKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['apiKey'], (result) => {
            if (result.apiKey) {
                resolve(result.apiKey);
            } else {
                console.warn('DeepSeek API key not found, checking for environment key');
                // If not in storage, try to use one set during installation
                const deepseekKey = 'YOUR_DEEPSEEK_API_KEY'; // Replace this with your actual key

                // Save it for future use
                chrome.storage.local.set({ apiKey: deepseekKey });
                resolve(deepseekKey);
            }
        });
    });
}

// Add this function to set the API key from the popup
async function setApiKey(apiKey) {
    await chrome.storage.local.set({ apiKey });
    return { success: true };
}