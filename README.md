# Twitter Bookmark Exporter

Chrome extension that exports Twitter/X bookmarks to CSV.

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `twitter-bookmark-fetcher` folder

## Usage

1. Navigate to `https://x.com/i/bookmarks`
2. Click the extension icon in your browser toolbar
3. Click "Start Export"
4. Wait for the scraper to scroll through all bookmarks
5. Click "Stop & Download" or wait for automatic completion
6. CSV file will download automatically

## CSV Output

The exported CSV includes these columns:

- Date
- Author
- Handle
- Content
- URL
- Media (image/video URLs)
- Quoted Content (if tweet quotes another tweet)
- Quoted URL (if tweet quotes another tweet)

## How It Works

- Auto-scrolls the bookmarks page to load all tweets
- Expands truncated tweets by clicking "Show more"
- Deduplicates tweets by ID
- Extracts quoted tweet content without navigation
- Filters out temporary blob URLs
