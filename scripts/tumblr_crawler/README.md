# Tumblr Sync for Art Portfolio

Scripts to sync artwork from kristiantalley.tumblr.com to your portfolio.

## Scripts

### `sync_tumblr.py` (Recommended)

Simple sync that pulls posts directly from the Tumblr API:
- Downloads images to `/public/tumblr/`
- Extracts title, description, date from post captions
- Detects mediums from tags and caption keywords
- Generates `tumblrImages.js` with all metadata

### `crawl_tumblr.py` (Advanced)

Uses Claude vision to analyze artwork images. Useful if:
- Tumblr posts don't have good captions
- You want AI-generated titles/descriptions
- You need to categorize old unlabeled artwork

---

## Quick Start

### 1. Install Dependencies

```bash
pip install requests
```

### 2. Get Tumblr API Key

1. Go to https://www.tumblr.com/oauth/apps
2. Register a new application
3. Copy the "OAuth Consumer Key"

### 3. Set Environment Variable

```bash
export TUMBLR_API_KEY="your-consumer-key"
```

### 4. Run Sync

```bash
# Preview first (dry run)
python sync_tumblr.py --limit 10 --dry-run

# Sync all posts
python sync_tumblr.py

# Sync without re-downloading images (faster if you have them)
python sync_tumblr.py --skip-download
```

---

## Usage Examples

```bash
# Sync only newest 50 posts
python sync_tumblr.py --limit 50

# Preview what would be synced
python sync_tumblr.py --dry-run

# Skip downloading (just update metadata from existing local files)
python sync_tumblr.py --skip-download

# Custom output file
python sync_tumblr.py --output ./test_output.js
```

---

## Output

- `src/data/tumblrImages.js` - Artwork data for the site
- `scripts/tumblr_crawler/tumblr_artworks.json` - JSON backup of all data
- `scripts/tumblr_crawler/.tumblr_manifest.json` - Sync tracking

---

## How It Works

1. **Fetches** all photo posts from the Tumblr API
2. **Extracts** metadata from each post:
   - **Title**: From caption (first line/sentence)
   - **Description**: Full caption text (cleaned of HTML)
   - **Date**: Year from post timestamp
   - **Mediums**: Detected from tags + caption keywords
3. **Downloads** images to `/public/tumblr/`
4. **Generates** `tumblrImages.js` with complete artwork data

### Medium Detection

Automatically categorizes artwork based on tags and caption keywords:

| Medium | Keywords |
|--------|----------|
| illustration | illustration, drawing, sketch, ink, digital, character |
| painting | painting, oil, acrylic, watercolor, gouache, canvas |
| sculpture | sculpture, 3d, installation, ceramic, clay |
| printmaking | print, screenprint, lithograph, etching, woodcut |
| programming | generative, code, processing, interactive |

---

## Advanced: Vision Analysis

If your Tumblr posts lack good captions, use `crawl_tumblr.py` with Claude vision:

```bash
export ANTHROPIC_API_KEY="your-key"

# Analyze local files with AI vision
python crawl_tumblr.py --local-only --limit 10
```

This uses Claude to generate titles and descriptions by analyzing the actual artwork images.
