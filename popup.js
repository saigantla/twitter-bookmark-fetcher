// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const countEl = document.getElementById('count');
const messageEl = document.getElementById('message');
const errorEl = document.getElementById('error');

// State
let isRunning = false;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Check if we're on the bookmarks page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url || (!tab.url.includes('x.com/i/bookmarks') && !tab.url.includes('twitter.com/i/bookmarks'))) {
    showError('Please navigate to x.com/i/bookmarks first');
    startBtn.disabled = true;
    return;
  }

  // Request current status from content script
  try {
    const response = await sendMessage(tab.id, { action: 'getStatus' });
    if (response) {
      updateUI(response);
    }
  } catch (e) {
    // Content script might not be loaded yet
    console.log('Content script not ready');
  }
});

// Start export
startBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    hideError();
    const response = await sendMessage(tab.id, { action: 'start' });
    if (response && response.success) {
      isRunning = true;
      updateButtonState();
      messageEl.textContent = 'Scrolling and collecting tweets...';
    } else if (response && response.error) {
      showError(response.error);
    }
  } catch (e) {
    showError('Failed to start. Please refresh the page and try again.');
  }
});

// Stop export and download
stopBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    messageEl.textContent = 'Stopping and generating CSV...';
    const response = await sendMessage(tab.id, { action: 'stop' });
    if (response && response.success) {
      isRunning = false;
      updateButtonState();
      messageEl.textContent = 'Export complete! CSV downloaded.';
    }
  } catch (e) {
    showError('Failed to stop export.');
  }
});

// Listen for progress updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'progress') {
    countEl.textContent = message.count;
    if (message.status) {
      messageEl.textContent = message.status;
    }
  } else if (message.action === 'complete') {
    isRunning = false;
    updateButtonState();
    countEl.textContent = message.count;
    messageEl.textContent = 'Export complete! CSV downloaded.';
  } else if (message.action === 'error') {
    isRunning = false;
    updateButtonState();
    showError(message.error);
  }
  sendResponse({ received: true });
});

// Helper: Send message to content script
async function sendMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// Helper: Update button visibility
function updateButtonState() {
  if (isRunning) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
  } else {
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
  }
}

// Helper: Update UI from status
function updateUI(status) {
  countEl.textContent = status.count || 0;
  isRunning = status.isRunning || false;
  updateButtonState();

  if (isRunning) {
    messageEl.textContent = 'Scrolling and collecting tweets...';
  }
}

// Helper: Show error message
function showError(msg) {
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
}

// Helper: Hide error message
function hideError() {
  errorEl.style.display = 'none';
}
