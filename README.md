# Task Teacher Chrome Extension

Task Teacher is a Chrome extension that helps users learn how to complete tasks step by step with AI guidance.

## Features

- Input a task you want to learn
- AI searches Google to gather information about the task
- Step-by-step guidance with visual highlights
- Learn by doing - follow along with real websites

## Installation

### Development Installation

1. Clone this repository:
```
git clone 
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

### Building for Production

For a production build, you would need to:

1. Minify JavaScript files
2. Optimize assets
3. Package the extension as a ZIP file

A build script is not included in this minimal version.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.