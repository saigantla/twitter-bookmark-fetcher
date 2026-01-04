// Twitter Bookmark Exporter - Background Service Worker (MV3)

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Twitter Bookmark Exporter installed');
});

// Relay messages between popup and content scripts if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Forward progress/complete/error messages from content script to popup
  // The popup listens directly, but this ensures messages are relayed
  // if the popup reconnects after being closed

  if (message.action === 'progress' || message.action === 'complete' || message.action === 'error') {
    // Message is from content script, relay to any listening popups
    // This is handled automatically by chrome.runtime.onMessage in popup
    return false;
  }

  return false;
});

// Handle clicks on the extension icon when not on bookmarks page
chrome.action.onClicked.addListener(async (tab) => {
  // This won't fire when popup is defined, but keeping as fallback
  if (!tab.url.includes('x.com/i/bookmarks') && !tab.url.includes('twitter.com/i/bookmarks')) {
    // Could open bookmarks page automatically
    await chrome.tabs.create({ url: 'https://x.com/i/bookmarks' });
  }
});
