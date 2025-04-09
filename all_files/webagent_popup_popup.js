document.addEventListener('DOMContentLoaded', () => {
    // DOM elements - Task UI
    const taskPromptInput = document.getElementById('task-prompt');
    const startTaskBtn = document.getElementById('start-task-btn');
    const nextStepBtn = document.getElementById('next-step-btn');
    const endTaskBtn = document.getElementById('end-task-btn');
    const newTaskBtn = document.getElementById('new-task-btn');
    const statusText = document.getElementById('status-text');
    const currentStepDiv = document.getElementById('current-step');

    // DOM elements - Settings UI
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.querySelector('.settings-panel');
    const apiKeyInput = document.getElementById('api-key');
    const toggleApiVisibility = document.getElementById('toggle-api-visibility');
    const saveSettingsBtn = document.getElementById('save-settings');
    const closeSettingsBtn = document.getElementById('close-settings');

    // UI sections
    const taskInputSection = document.querySelector('.task-input');
    const taskProgressSection = document.querySelector('.task-progress');
    const taskCompleteSection = document.querySelector('.task-complete');

    // State
    let currentTab = null;

    // Get the current active tab
    const getCurrentTab = async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    };

    // Initialize the popup based on extension state
    const initialize = async () => {
        currentTab = await getCurrentTab();

        // Load API key
        loadApiKey();

        // Check if there's an ongoing task
        chrome.storage.local.get(['taskState'], (result) => {
            const taskState = result.taskState;

            if (taskState && taskState.inProgress && taskState.tabId === currentTab.id) {
                // Show task progress UI
                taskInputSection.classList.add('hidden');
                taskProgressSection.classList.remove('hidden');
                taskCompleteSection.classList.add('hidden');

                // Update status
                statusText.textContent = taskState.statusText || 'In progress...';

                // Show current step instruction
                if (taskState.currentStep) {
                    currentStepDiv.innerHTML = taskState.currentStep;
                }
            }
        });
    };

    // Start a new task
    const startTask = async () => {
        const taskPrompt = taskPromptInput.value.trim();

        if (!taskPrompt) {
            alert('Please enter a task you want to learn.');
            return;
        }

        // Check if API key is set
        const apiKey = await getApiKey();
        if (!apiKey) {
            showSettingsPanel();
            alert('Please set your DeepSeek API key before starting a task.');
            return;
        }

        // Update UI
        taskInputSection.classList.add('hidden');
        taskProgressSection.classList.remove('hidden');
        statusText.textContent = 'Initializing...';

        try {
            // Start the task in the current tab
            const response = await chrome.runtime.sendMessage({
                action: 'startTask',
                taskPrompt,
                tabId: currentTab.id
            });

            if (response.success) {
                statusText.textContent = 'Searching for information...';
            } else {
                throw new Error(response.error || 'Failed to start task');
            }
        } catch (error) {
            console.error('Error starting task:', error);
            statusText.textContent = 'Error: ' + error.message;

            // Return to input UI after a delay
            setTimeout(() => {
                taskInputSection.classList.remove('hidden');
                taskProgressSection.classList.add('hidden');
            }, 3000);
        }
    };

    // Request the next step
    const requestNextStep = async () => {
        statusText.textContent = 'Processing next step...';

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getNextStep',
                tabId: currentTab.id
            });

            if (response.success) {
                if (response.isComplete) {
                    // Task is complete
                    taskProgressSection.classList.add('hidden');
                    taskCompleteSection.classList.remove('hidden');
                } else {
                    // Update current step
                    currentStepDiv.innerHTML = response.stepInstruction || 'Follow the highlighted element on the page.';
                    statusText.textContent = 'Ready for next action';
                }
            } else {
                throw new Error(response.error || 'Failed to get next step');
            }
        } catch (error) {
            console.error('Error getting next step:', error);
            statusText.textContent = 'Error: ' + error.message;
        }
    };

    // End the current task
    const endTask = async () => {
        try {
            await chrome.runtime.sendMessage({
                action: 'endTask',
                tabId: currentTab.id
            });

            // Reset UI
            taskInputSection.classList.remove('hidden');
            taskProgressSection.classList.add('hidden');
            taskCompleteSection.classList.add('hidden');
            taskPromptInput.value = '';
        } catch (error) {
            console.error('Error ending task:', error);
        }
    };

    // Settings Panel Functions

    // Show settings panel
    const showSettingsPanel = () => {
        settingsPanel.classList.remove('hidden');
        taskInputSection.classList.add('hidden');
        taskProgressSection.classList.add('hidden');
        taskCompleteSection.classList.add('hidden');
    };

    // Hide settings panel
    const hideSettingsPanel = () => {
        settingsPanel.classList.add('hidden');

        // Check task state to determine which UI to show
        chrome.storage.local.get(['taskState'], (result) => {
            const taskState = result.taskState;

            if (taskState && taskState.inProgress && taskState.tabId === currentTab.id) {
                if (taskState.isComplete) {
                    taskCompleteSection.classList.remove('hidden');
                } else {
                    taskProgressSection.classList.remove('hidden');
                }
            } else {
                taskInputSection.classList.remove('hidden');
            }
        });
    };

    // Toggle API key visibility
    const toggleApiKeyVisibility = () => {
        const type = apiKeyInput.type === 'password' ? 'text' : 'password';
        apiKeyInput.type = type;
        toggleApiVisibility.textContent = type === 'password' ? '👁️' : '🔒';
    };

    // Save API key
    const saveApiKey = async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            alert('Please enter a valid API key.');
            return;
        }

        try {
            // Test API key before saving (optional)
            const isValid = await testApiKey(apiKey);

            if (isValid) {
                await chrome.runtime.sendMessage({
                    action: 'setApiKey',
                    apiKey
                });

                alert('API key saved successfully.');
                hideSettingsPanel();
            } else {
                alert('Invalid API key. Please check and try again.');
            }
        } catch (error) {
            console.error('Error saving API key:', error);
            alert('Error saving API key: ' + error.message);
        }
    };

    // Test if API key is valid
    // Function to test the API key
    async function testApiKey(apiKey) {
        try {
            const response = await fetch('https://api.deepseek.com/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey.trim()}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('API Key Test Error:', response.status, errorData);
                return {
                    valid: false,
                    error: `API returned ${response.status}: ${errorData.error?.message || response.statusText}`
                };
            }

            return { valid: true };
        } catch (error) {
            console.error('API Key Test Error:', error);
            return {
                valid: false,
                error: error.message
            };
        }
    }

    // Load API key from storage
    const loadApiKey = async () => {
        chrome.storage.local.get(['apiKey'], (result) => {
            if (result.apiKey) {
                apiKeyInput.value = result.apiKey;
            }
        });
    };

    // Get API key from storage
    const getApiKey = async () => {
        return new Promise((resolve) => {
            chrome.storage.local.get(['apiKey'], (result) => {
                resolve(result.apiKey || '');
            });
        });
    };

    // Event listeners - Task UI
    startTaskBtn.addEventListener('click', startTask);
    nextStepBtn.addEventListener('click', requestNextStep);
    endTaskBtn.addEventListener('click', endTask);
    newTaskBtn.addEventListener('click', endTask);

    // Event listeners - Settings UI
    settingsToggle.addEventListener('click', showSettingsPanel);
    closeSettingsBtn.addEventListener('click', hideSettingsPanel);
    saveSettingsBtn.addEventListener('click', saveApiKey);
    toggleApiVisibility.addEventListener('click', toggleApiKeyVisibility);

    // Listen for messages from the background script
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

        // Always return true for async response
        return true;
    });

    // Initialize popup
    initialize();
});