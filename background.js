// Enhanced background script for Task Teacher extension
// Handles communication between popup and content scripts,
// manages task state, and coordinates with the AI service

// Global state for active tasks
const taskState = {
    inProgress: false,
    tabId: null,
    taskPrompt: '',
    currentStep: '',
    stepHistory: [],
    statusText: '',
    isComplete: false,
    domData: null, // Current DOM state of active tab
    expectedNavigation: false // Flag when we expect navigation
};

// Constants
const AI_SERVICE = {
    ENDPOINT: 'https://api.deepseek.com/v1/chat/completions',
    MODEL: 'deepseek-chat',
    MAX_TOKENS: 1000
};

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('Task Teacher extension installed');

    // Clear any existing state
    chrome.storage.local.set({ taskState: null });
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);

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
            // Content script is reporting DOM data
            handleUIStateReport(message.domData, sender.tab?.id)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        case 'elementClicked':
            // Content script is reporting element was clicked
            handleElementClick(message.elementIndex, message.elementDetails, sender.tab?.id, message.url)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        case 'getCurrentTabId':
            // Get current active tab ID
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs && tabs.length > 0) {
                    sendResponse({ success: true, tabId: tabs[0].id });
                } else {
                    sendResponse({ success: false, error: 'No active tab found' });
                }
            });
            return true;

        case 'setApiKey':
            // Handle API key setting from popup
            setApiKey(message.apiKey)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        default:
            sendResponse({ success: false, error: 'Unknown action' });
            return false;
    }
});

// Handle tab updates to detect page navigations
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
        taskState.expectedNavigation = false;
        updateTaskStateUI();

        // Wait a moment for any post-load scripts to run, then analyze DOM
        setTimeout(async () => {
            try {
                if (taskState.inProgress && taskState.tabId === tabId) {
                    // Inject content scripts if not already present
                    await ensureContentScriptsInjected(tabId);

                    // Request DOM data from content script
                    await executeContentScript(tabId, {
                        function: refreshDOMData,
                        args: [tabId]
                    });

                    // Update UI with current step
                    updateTaskStateUI();
                }
            } catch (error) {
                console.error('Error processing page load:', error);
            }
        }, 1000);
    }
});

// Handle tab updates to detect page navigations
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
        taskState.expectedNavigation = false;
        updateTaskStateUI();

        // Wait a moment for any post-load scripts to run, then analyze DOM
        setTimeout(async () => {
            try {
                if (taskState.inProgress && taskState.tabId === tabId) {
                    // Important: Update stored tabId to match current tab
                    // This ensures continuity across navigations
                    taskState.tabId = tabId;

                    // Re-save state to ensure it's current
                    await chrome.storage.local.set({ taskState });

                    // Inject content scripts if not already present
                    await ensureContentScriptsInjected(tabId);

                    // Request DOM data from content script
                    await executeContentScript(tabId, {
                        function: refreshDOMData,
                        args: [tabId]
                    });

                    // Update UI with current step
                    updateTaskStateUI();
                }
            } catch (error) {
                console.error('Error processing page load:', error);
            }
        }, 1000);
    }
});

// Add to background.js
chrome.webNavigation.onCommitted.addListener((details) => {
    // Only care about main frame navigation
    if (details.frameId !== 0) return;
    
    // Check if this is the task tab
    if (taskState.inProgress && taskState.tabId === details.tabId) {
        console.log('Navigation detected in task tab:', details.url);
        
        // Set navigation flag to avoid premature next step calls
        taskState.expectedNavigation = true;
        taskState.statusText = 'Navigation in progress...';
        updateTaskStateUI();
        
        // No need to clear anything here, we'll handle it in onCompleted
    }
});

// Handle element click from the content script
async function handleElementClick(elementIndex, elementDetails, tabId, url, expectingNavigation) {
    try {
        // Verify this is for the current task
        if (!taskState.inProgress || taskState.tabId !== tabId) {
            return { success: false, error: 'No active task for this tab' };
        }

        console.log(`Element [${elementIndex}] clicked in tab ${tabId}:`, elementDetails);

        // Add to step history
        if (taskState.stepHistory.length > 0) {
            const lastStep = taskState.stepHistory[taskState.stepHistory.length - 1];
            lastStep.clicked = true;
            lastStep.elementClicked = {
                index: elementIndex,
                ...elementDetails
            };
        }

        // Set navigation expectation flag based on what the content script reported
        taskState.expectedNavigation = expectingNavigation;

        // Save task state
        await chrome.storage.local.set({ taskState });

        // The next step request will be handled by the content script's auto-progression
        // We don't need to manually trigger it here anymore

        // Update UI status
        if (taskState.expectedNavigation) {
            taskState.statusText = 'Navigation in progress...';
        } else {
            taskState.statusText = 'Action completed, proceeding to next step...';
        }
        updateTaskStateUI();

        return { success: true };
    } catch (error) {
        console.error('Error handling element click:', error);
        return { success: false, error: error.message };
    }
}

// Handle UI state report from content script
async function handleUIStateReport(domData, tabId) {
    if (!taskState.inProgress || taskState.tabId !== tabId) {
        console.warn('DOM data rejected for tab:', tabId, 'expected:', taskState.tabId);
        return { success: false, error: 'No active task for this tab' };
    }
    taskState.domData = domData;
    // console.log('Updated domData:', JSON.stringify(taskState.domData));
    return { success: true };
}


// Handle starting a new task
async function handleStartTask(taskPrompt, tabId) {
    try {
        // Reset task state
        taskState.inProgress = true;
        taskState.tabId = tabId;
        taskState.taskPrompt = taskPrompt;
        taskState.currentStep = '';
        taskState.stepHistory = [];
        taskState.statusText = 'Analyzing page...';
        taskState.isComplete = false;
        taskState.expectedNavigation = false;

        // Save state
        await chrome.storage.local.set({ taskState });

        // Update UI
        updateTaskStateUI();

        // Ensure content scripts are injected
        await ensureContentScriptsInjected(tabId);

        // Get initial DOM data
        await executeContentScript(tabId, {
            function: refreshDOMData,
            args: [tabId]
        });

        // Save state
        console.log("task starting: current state is")
        console.log(taskState)

        await chrome.storage.local.set({ taskState });

        // Request first step
        return await handleGetNextStep(tabId);
    } catch (error) {
        console.error('Error starting task:', error);
        taskState.inProgress = false;
        await chrome.storage.local.set({ taskState });
        return { success: false, error: error.message };
    }
}

// Get next step from AI
async function handleGetNextStep(tabId) {
    try {
        // First verify tab exists and matches our expectations
        const tab = await chrome.tabs.get(tabId);
        if (!tab) {
            throw new Error('Tab does not exist');
        }
        
        console.log(`Processing next step for tab ${tabId} (${tab.url})`);
        
        // If task state doesn't match this tabId, check if we need to update it
        if (!taskState.inProgress || taskState.tabId !== tabId) {
            // Check if there's a saved task for this tab
            const savedState = await chrome.storage.local.get('taskState');
            if (savedState.taskState && savedState.taskState.tabId === tabId) {
                // Restore from saved state
                Object.assign(taskState, savedState.taskState);
                console.log('Restored task state for tab:', tabId);
            } else {
                throw new Error('No active task for this tab');
            }
        }

        taskState.statusText = 'Analyzing current page...';
        updateTaskStateUI();

        // Ensure we have current DOM data
        if (!taskState.domData) {
            await executeContentScript(tabId, {
                function: refreshDOMData,
                args: [tabId]
            });
        }

        // Check if we have API key
        const apiKey = await getApiKey();
        if (!apiKey) {
            return {
                success: false,
                error: 'API key not set. Please configure the API key in settings.'
            };
        }

        // Generate prompt for AI
        const prompt = generatePrompt();

        // Get next step from AI
        const aiResponse = await getAIResponse(prompt, apiKey);

        // Parse AI response
        const { stepInstruction, elementToClick, isComplete } = parseAIResponse(aiResponse);
        console.log(stepInstruction, elementToClick, isComplete)

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
                args: [elementToClick, stepInstruction]
            });
        }

        return {
            success: true,
            stepInstruction,
            isComplete
        };
    } catch (error) {
        console.error('Error getting next step:', error);
        return { success: false, error: error.message };
    }
}

// End the current task
async function handleEndTask(tabId) {
    try {
        // Clear highlights on the page
        if (taskState.inProgress && taskState.tabId === tabId) {
            await executeContentScript(tabId, {
                function: clearHighlights
            });
        }

        // Reset task state
        taskState.inProgress = false;
        taskState.tabId = null;
        taskState.taskPrompt = '';
        taskState.currentStep = '';
        taskState.stepHistory = [];
        taskState.statusText = '';
        taskState.isComplete = false;
        taskState.domData = null;

        // Save state
        await chrome.storage.local.set({ taskState });

        return { success: true };
    } catch (error) {
        console.error('Error ending task:', error);
        return { success: false, error: error.message };
    }
}

// Generate prompt for AI based on current task and DOM state
function generatePrompt() {
    const MAX_CLICKABLE_ELEMENTS = 200; // Limit number of elements to keep prompt size reasonable

    // Process clickable elements to limit size
    let clickableElements = [];

    if (taskState.domData && taskState.domData.clickableElements) {
        clickableElements = taskState.domData.clickableElements
            .split('\n')
            .slice(0, MAX_CLICKABLE_ELEMENTS);
    }

    // Format step history for context
    const stepHistoryText = taskState.stepHistory.map((step, i) => {
        return `Step ${i + 1}: ${step.instruction} ${step.clicked ? `(Clicked: ${JSON.stringify(step.elementClicked)})` : ''}`;
    }).join('\n');

    // Build prompt
    const prompt = `
You are Task Teacher, a helpful assistant that guides users on how to complete tasks in their web browser. 
Your job is to provide step-by-step instructions and identify which elements they should click or interact with.

TASK: "${taskState.taskPrompt}"

Current webpage: ${taskState.domData?.url || 'Unknown'} - "${taskState.domData?.title || 'Unknown'}"

${stepHistoryText ? `Previous steps:\n${stepHistoryText}\n` : ''}

The page has the following clickable elements (showing the first ${MAX_CLICKABLE_ELEMENTS} elements):
${clickableElements.join('\n')}

Provide ONE clear instruction for the NEXT step only. Focus on concrete actions the user should take right now.

Your response must be in this exact format:
STEP: <brief instruction for this specific step>
ELEMENT: <element identifier in [X] format, matching one of the displayed elements>
EXPLANATION: <brief explanation of what this step accomplishes>

If the task is complete, respond with:
COMPLETE: <final message explaining what the user accomplished>

Limitations:
1. You can ONLY reference elements by their index [X] as shown in the list above
2. Only suggest one action per step
3. Be precise about what to click - if you're unsure, be descriptive about what to look for
4. Avoid suggesting actions that require scrolling or accessing elements not in the current view
`;
    console.log(prompt)
    return prompt;
}

// Call AI service for next step guidance
async function getAIResponse(prompt, apiKey) {
    try {
        const response = await fetch(AI_SERVICE.ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: AI_SERVICE.MODEL,
                messages: [
                    { role: 'user', content: prompt }
                ],
                max_tokens: AI_SERVICE.MAX_TOKENS
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('Error getting AI response:', error);
        throw error;
    }
}

// Parse AI response to extract step and element
function parseAIResponse(response) {

    // Check if task is complete
    if (response.includes('COMPLETE:')) {
        const completeMatch = response.match(/COMPLETE:\s*(.+)$/s);
        return {
            stepInstruction: completeMatch ? completeMatch[1].trim() : 'Task complete!',
            elementToClick: null,
            isComplete: true
        };
    }
    console.log(response)

    // Extract step instruction
    let stepInstruction = '';
    const stepMatch = response.match(/STEP:\s*(.+?)(\n|$)/s);
    if (stepMatch) {
        stepInstruction = stepMatch[1].trim();
    }

    // Extract element to click
    let elementToClick = null;
    const elementMatch = response.match(/ELEMENT:\s*\[(\d+)\]/);
    if (elementMatch) {
        elementToClick = `[${elementMatch[1]}]`;
    }

    // Extract explanation and add it to the instruction
    const explanationMatch = response.match(/EXPLANATION:\s*(.+?)(\n|$)/s);
    if (explanationMatch) {
        stepInstruction += `\n\n${explanationMatch[1].trim()}`;
    }

    return {
        stepInstruction,
        elementToClick,
        isComplete: false
    };
}

// Update UI in the popup
function updateTaskStateUI() {
    chrome.runtime.sendMessage({
        action: 'updateTaskState',
        tabId: taskState.tabId,
        statusText: taskState.statusText,
        currentStep: taskState.currentStep,
        isComplete: taskState.isComplete
    }).catch(error => {
        // This can happen if popup is closed, which is fine
        console.debug('Error updating popup UI:', error);
    });
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

// Ensure content scripts are injected in the tab
async function ensureContentScriptsInjected(tabId) {
    try {
        // Check if our content script is already injected
        const isInjected = await executeContentScript(tabId, {
            function: () => typeof window.taskTeacherInitialized !== 'undefined'
        });

        if (isInjected) {
            return true;
        }

        // Inject main content script
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content/content.js']
        });

        // Wait for script initialization
        await new Promise(resolve => setTimeout(resolve, 100));

        return true;
    } catch (error) {
        console.error('Error injecting content scripts:', error);
        throw error;
    }
}

// Function to be executed in content script to refresh DOM data
function refreshDOMData(passedTabId) {
    console.log("Getting DOM data, tabId:", passedTabId);
    let domData;
    if (window.taskTeacherDOMParser) {
        window.taskTeacherDOMParser.clearRegistry();
        domData = window.taskTeacherDOMParser.getDOMData();
    } else {
        domData = getFallbackDOMData();
    }

    chrome.runtime.sendMessage({
        action: 'reportUIState',
        domData,
        tabId: passedTabId  // Make sure to pass this back
    }).catch(err => {
        console.error('Error reporting DOM state:', err);
    });

    return domData;
}


// Fallback function to get DOM data if module isn't loaded
function getFallbackDOMData() {
    console.log("using fallback dom data")
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

// Highlight an element on the page
function highlightElement(elementIdentifier, instruction) {
    console.log("highlightElement")
    // Check if our content script is running
    if (window.taskTeacherUIController) {
        console.log("window.taskTeacherUIController found")
        const index = parseInt(elementIdentifier.replace(/[^\d]/g, ''));
        return window.taskTeacherUIController.highlightElement(index, instruction);
    }

    // Fallback: Simple highlighting by index
    if (window.taskTeacherHighlighter) {
        return window.taskTeacherHighlighter.highlightElement(elementIdentifier, instruction);
    }

    // Last resort fallback if no modules available
    const index = parseInt(elementIdentifier.replace(/[^\d]/g, ''));
    const selectors = [
        'a', 'button', 'input[type="button"]', 'input[type="submit"]',
        '[role="button"]', '[onclick]', '.btn', '.button'
    ];

    // Get all potential clickable elements
    const elements = document.querySelectorAll(selectors.join(','));
    let visibleElements = [];

    // Filter for visible elements
    for (const el of elements) {
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
            visibleElements.push(el);
        }
    }

    const element = visibleElements[index];

    if (!element) {
        console.error('Element not found:', elementIdentifier);
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

    // Create instruction tooltip if provided
    if (instruction) {
        const tooltip = document.createElement('div');
        tooltip.id = 'task-teacher-instruction';
        tooltip.style.position = 'fixed';
        tooltip.style.bottom = '20px';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        tooltip.style.color = 'white';
        tooltip.style.padding = '10px 20px';
        tooltip.style.borderRadius = '6px';
        tooltip.style.fontFamily = 'Arial, sans-serif';
        tooltip.style.zIndex = '10000';
        tooltip.style.maxWidth = '80%';
        tooltip.textContent = instruction;
        document.body.appendChild(tooltip);
    }

    // Position overlay
    const rect = element.getBoundingClientRect();
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    // Remove any existing highlight
    clearHighlights();

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

    const instruction = document.getElementById('task-teacher-instruction');
    if (instruction) {
        instruction.remove();
    }

    return true;
}

// Get API key from storage
async function getApiKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['apiKey'], (result) => {
            resolve(result.apiKey || '');
        });
    });
}

// Set API key in storage
async function setApiKey(apiKey) {
    await chrome.storage.local.set({ apiKey });
    return { success: true };
}