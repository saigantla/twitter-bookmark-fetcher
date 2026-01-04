// Twitter Bookmark Scraper - Content Script

// DOM Selectors (using data-testid for reliability)
const SELECTORS = {
  tweet: '[data-testid="tweet"]',
  tweetText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  tweetPhoto: '[data-testid="tweetPhoto"]',
  time: 'time[datetime]',
  statusLink: 'a[href*="/status/"]',
  videoComponent: '[data-testid="videoComponent"]',
  showMore: '[data-testid="tweet-text-show-more-link"]'
};

// Configuration
const SCROLL_DELAY = 2000; // 2 seconds between scrolls
const MAX_NO_NEW_TWEETS = 3; // Stop after 3 scrolls with no new tweets

// State
let isRunning = false;
let tweets = new Map(); // Map<tweetId, tweetData>
let seenIds = new Set();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'start':
      if (!isRunning) {
        startScraping();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Already running' });
      }
      break;

    case 'stop':
      stopScraping();
      downloadCSV();
      sendResponse({ success: true });
      break;

    case 'getStatus':
      sendResponse({
        isRunning,
        count: tweets.size
      });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  return true; // Keep message channel open for async response
});

// Start the scraping process
async function startScraping() {
  isRunning = true;
  tweets.clear();
  seenIds.clear();

  let noNewTweetsCount = 0;

  while (isRunning) {
    const previousCount = tweets.size;

    // Scrape visible tweets
    await scrapeVisibleTweets();

    // Send progress update to popup
    sendProgress();

    // Check if we found new tweets
    if (tweets.size === previousCount) {
      noNewTweetsCount++;
      if (noNewTweetsCount >= MAX_NO_NEW_TWEETS) {
        // No new tweets after multiple scrolls - we've reached the end
        break;
      }
    } else {
      noNewTweetsCount = 0;
    }

    // Scroll down
    window.scrollTo(0, document.body.scrollHeight);

    // Wait for new content to load
    await sleep(SCROLL_DELAY);
  }

  // Export complete
  if (isRunning) {
    isRunning = false;
    downloadCSV();
    sendComplete();
  }
}

// Stop the scraping process
function stopScraping() {
  isRunning = false;
}

// Scrape all currently visible tweets
async function scrapeVisibleTweets() {
  const tweetElements = document.querySelectorAll(SELECTORS.tweet);

  // First, click all "Show more" buttons to expand truncated tweets
  await expandAllTweets(tweetElements);

  tweetElements.forEach((tweetEl) => {
    try {
      const tweetData = extractTweetData(tweetEl);
      if (tweetData && tweetData.id && !seenIds.has(tweetData.id)) {
        seenIds.add(tweetData.id);
        tweets.set(tweetData.id, tweetData);
      }
    } catch (e) {
      console.error('Error extracting tweet:', e);
    }
  });
}

// Click "Show more" buttons to expand truncated tweets
async function expandAllTweets(tweetElements) {
  const showMoreButtons = [];

  tweetElements.forEach((tweetEl) => {
    // Only expand tweets we haven't processed yet
    const statusLink = tweetEl.querySelector(SELECTORS.statusLink);
    if (!statusLink) return;

    const idMatch = statusLink.href.match(/\/status\/(\d+)/);
    if (!idMatch || seenIds.has(idMatch[1])) return;

    // Find "Show more" buttons in this tweet
    const allShowMoreBtns = tweetEl.querySelectorAll(SELECTORS.showMore);

    allShowMoreBtns.forEach((btn) => {
      // Skip if this button is inside a quoted tweet (nested article/tweet)
      // Check if there's a quoted tweet container between the button and main tweet
      const isInQuotedTweet = btn.closest('[data-testid="quoteTweet"]') ||
                              isNestedInQuote(btn, tweetEl);

      if (!isInQuotedTweet) {
        showMoreButtons.push(btn);
      }
    });
  });

  // Click all found "Show more" buttons
  if (showMoreButtons.length > 0) {
    showMoreButtons.forEach((btn) => {
      try {
        btn.click();
      } catch (e) {
        console.error('Error clicking Show more:', e);
      }
    });

    // Wait for content to expand
    await sleep(500);
  }
}

// Check if an element is inside a quoted tweet within the main tweet
function isNestedInQuote(element, mainTweetEl) {
  // Walk up from element to mainTweetEl and check for quote indicators
  let current = element.parentElement;

  while (current && current !== mainTweetEl) {
    // Check for common quote tweet container patterns
    // Quoted tweets are usually in a container with specific styling or role
    const testId = current.getAttribute('data-testid');
    if (testId && (testId.includes('quote') || testId.includes('Quote'))) {
      return true;
    }

    // Also check if we hit another article element (nested tweet)
    // The main tweet is an article, quoted tweets may also be articles
    if (current.tagName === 'ARTICLE' && current !== mainTweetEl) {
      return true;
    }

    // Check for the quoted tweet card container (usually has a border/different background)
    // These often have role="link" or are clickable containers
    if (current.getAttribute('role') === 'link' &&
        current.querySelector('time[datetime]')) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

// Extract data from a single tweet element
function extractTweetData(tweetEl) {
  // Get permalink and extract tweet ID
  const statusLink = tweetEl.querySelector(SELECTORS.statusLink);
  if (!statusLink) return null;

  const permalink = statusLink.href;
  const idMatch = permalink.match(/\/status\/(\d+)/);
  if (!idMatch) return null;

  const id = idMatch[1];

  // Get timestamp
  const timeEl = tweetEl.querySelector(SELECTORS.time);
  const date = timeEl ? timeEl.getAttribute('datetime') : '';

  // Get author name and handle
  const userNameEl = tweetEl.querySelector(SELECTORS.userName);
  let authorName = '';
  let handle = '';

  if (userNameEl) {
    // Author name is usually in the first text-containing span
    const nameSpans = userNameEl.querySelectorAll('span');
    for (const span of nameSpans) {
      const text = span.textContent.trim();
      if (text && !text.startsWith('@') && text !== '·' && !text.includes('Verified')) {
        authorName = text;
        break;
      }
    }

    // Handle contains @
    const handleLink = userNameEl.querySelector('a[href^="/"]');
    if (handleLink) {
      const handleText = handleLink.textContent.trim();
      if (handleText.startsWith('@')) {
        handle = handleText;
      } else {
        // Try to extract from href
        const hrefMatch = handleLink.href.match(/x\.com\/([^/]+)/) || handleLink.href.match(/twitter\.com\/([^/]+)/);
        if (hrefMatch) {
          handle = '@' + hrefMatch[1];
        }
      }
    }
  }

  // Get tweet text content
  const tweetTextEl = tweetEl.querySelector(SELECTORS.tweetText);
  const content = tweetTextEl ? tweetTextEl.innerText.trim() : '';

  // Get media URLs
  const mediaUrls = [];

  // Images
  const photos = tweetEl.querySelectorAll(`${SELECTORS.tweetPhoto} img`);
  photos.forEach((img) => {
    const src = img.src;
    if (src && !src.startsWith('blob:') && !src.includes('profile_images') && !src.includes('emoji')) {
      // Get the highest quality version
      const highQualitySrc = src.replace(/&name=\w+/, '&name=large');
      mediaUrls.push(highQualitySrc);
    }
  });

  // Videos - get poster or video source
  const videos = tweetEl.querySelectorAll(`${SELECTORS.videoComponent} video`);
  videos.forEach((video) => {
    if (video.poster && !video.poster.startsWith('blob:')) {
      mediaUrls.push(video.poster);
    }
    const source = video.querySelector('source');
    if (source && source.src && !source.src.startsWith('blob:')) {
      mediaUrls.push(source.src);
    }
  });

  // Deduplicate media URLs
  const uniqueMediaUrls = [...new Set(mediaUrls)];

  // Extract quoted tweet data (if present)
  const { quotedContent, quotedUrl } = extractQuotedTweet(tweetEl);

  return {
    id,
    date: formatDate(date),
    authorName,
    handle,
    content,
    url: permalink,
    media: uniqueMediaUrls.join(' | '),
    quotedContent,
    quotedUrl
  };
}

// Extract quoted tweet content and URL from a tweet element
function extractQuotedTweet(tweetEl) {
  // Find the quoted tweet container
  // Twitter uses various containers for quoted tweets
  const quotedTweetContainer = tweetEl.querySelector('[data-testid="quoteTweet"]') ||
                                findQuotedTweetContainer(tweetEl);

  if (!quotedTweetContainer) {
    return { quotedContent: '', quotedUrl: '' };
  }

  // Get quoted tweet URL from the link
  const quotedLink = quotedTweetContainer.querySelector('a[href*="/status/"]');
  let quotedUrl = '';
  if (quotedLink) {
    quotedUrl = quotedLink.href;
  }

  // Get quoted tweet text content
  const quotedTextEl = quotedTweetContainer.querySelector('[data-testid="tweetText"]');
  let quotedContent = '';
  if (quotedTextEl) {
    quotedContent = quotedTextEl.innerText.trim();
  }

  return { quotedContent, quotedUrl };
}

// Find quoted tweet container by looking for nested tweet-like structures
function findQuotedTweetContainer(tweetEl) {
  // Look for containers that have role="link" and contain tweet-like content
  const candidates = tweetEl.querySelectorAll('[role="link"]');

  for (const candidate of candidates) {
    // Check if this looks like a quoted tweet (has time element and text)
    const hasTime = candidate.querySelector('time[datetime]');
    const hasText = candidate.querySelector('[data-testid="tweetText"]');
    const hasUserName = candidate.querySelector('[data-testid="User-Name"]');

    // Make sure it's not the main tweet's elements
    if (hasTime && (hasText || hasUserName)) {
      // Verify this is a nested container, not the main tweet
      const isNested = candidate.closest('[data-testid="tweet"]') === tweetEl &&
                       candidate !== tweetEl;
      if (isNested) {
        return candidate;
      }
    }
  }

  return null;
}

// Format ISO date to readable format
function formatDate(isoDate) {
  if (!isoDate) return '';
  try {
    const date = new Date(isoDate);
    return date.toISOString().split('T')[0] + ' ' + date.toTimeString().split(' ')[0];
  } catch {
    return isoDate;
  }
}

// Generate and download CSV
function downloadCSV() {
  if (tweets.size === 0) {
    sendError('No tweets found to export');
    return;
  }

  const headers = ['Date', 'Author', 'Handle', 'Content', 'URL', 'Media', 'Quoted Content', 'Quoted URL'];
  const rows = [headers.join(',')];

  tweets.forEach((tweet) => {
    const row = [
      escapeCSV(tweet.date),
      escapeCSV(tweet.authorName),
      escapeCSV(tweet.handle),
      escapeCSV(tweet.content),
      escapeCSV(tweet.url),
      escapeCSV(tweet.media),
      escapeCSV(tweet.quotedContent),
      escapeCSV(tweet.quotedUrl)
    ];
    rows.push(row.join(','));
  });

  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  // Create download link
  const link = document.createElement('a');
  link.href = url;
  link.download = `twitter_bookmarks_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Cleanup
  URL.revokeObjectURL(url);
}

// Escape special characters for CSV
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Send progress update to popup
function sendProgress() {
  chrome.runtime.sendMessage({
    action: 'progress',
    count: tweets.size,
    status: `Scrolling... Found ${tweets.size} tweets`
  }).catch(() => {
    // Popup might be closed, ignore
  });
}

// Send completion message
function sendComplete() {
  chrome.runtime.sendMessage({
    action: 'complete',
    count: tweets.size
  }).catch(() => {
    // Popup might be closed, ignore
  });
}

// Send error message
function sendError(error) {
  chrome.runtime.sendMessage({
    action: 'error',
    error
  }).catch(() => {
    // Popup might be closed, ignore
  });
}

// Utility: Sleep for ms milliseconds
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Log that content script is loaded
console.log('Twitter Bookmark Exporter: Content script loaded');
