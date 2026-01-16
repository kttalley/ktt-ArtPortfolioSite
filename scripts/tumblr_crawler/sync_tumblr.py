#!/usr/bin/env python3
"""
Tumblr Sync Script for Art Portfolio

Fetches posts from kristiantalley.tumblr.com and syncs artwork data.
Downloads images and extracts metadata (title, description, date, tags) from
the actual Tumblr posts.

Usage:
    python sync_tumblr.py                    # Sync all posts
    python sync_tumblr.py --limit 20         # Sync only 20 posts
    python sync_tumblr.py --dry-run          # Preview without saving
    python sync_tumblr.py --skip-download    # Use existing images, just update metadata

Environment variables required:
    TUMBLR_API_KEY - Your Tumblr API consumer key (get at tumblr.com/oauth/apps)
"""

import os
import sys
import json
import argparse
import re
import time
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse
import html

try:
    import requests
except ImportError:
    print("Error: requests not installed. Run: pip install requests")
    sys.exit(1)

# Configuration
TUMBLR_BLOG = "kristiantalley"
PROJECT_ROOT = Path(__file__).parent.parent.parent
PUBLIC_TUMBLR_DIR = PROJECT_ROOT / "public" / "tumblr"
DATA_FILE = PROJECT_ROOT / "src" / "data" / "tumblrImages.js"
MANIFEST_FILE = Path(__file__).parent / ".tumblr_manifest.json"

# Medium mapping from tags
MEDIUM_KEYWORDS = {
    "illustration": ["illustration", "drawing", "sketch", "ink", "digital", "character"],
    "painting": ["painting", "oil", "acrylic", "watercolor", "gouache", "canvas"],
    "sculpture": ["sculpture", "3d", "installation", "ceramic", "clay"],
    "printmaking": ["print", "screenprint", "lithograph", "etching", "woodcut", "block"],
    "programming": ["generative", "code", "processing", "interactive", "algorithmic"],
}


def get_api_key():
    """Get Tumblr API key from environment."""
    api_key = os.environ.get("TUMBLR_API_KEY")
    if not api_key:
        print("Error: TUMBLR_API_KEY environment variable not set")
        print("Get your API key at: https://www.tumblr.com/oauth/apps")
        sys.exit(1)
    return api_key


def load_manifest():
    """Load sync manifest."""
    if MANIFEST_FILE.exists():
        with open(MANIFEST_FILE, "r") as f:
            return json.load(f)
    return {"posts": {}, "last_sync": None}


def save_manifest(manifest):
    """Save sync manifest."""
    manifest["last_sync"] = datetime.now().isoformat()
    with open(MANIFEST_FILE, "w") as f:
        json.dump(manifest, f, indent=2)


def fetch_all_posts(api_key, limit=None):
    """Fetch all photo posts from the blog."""
    all_posts = []
    offset = 0
    batch_size = 20

    print(f"Fetching posts from {TUMBLR_BLOG}.tumblr.com...")

    while True:
        url = f"https://api.tumblr.com/v2/blog/{TUMBLR_BLOG}.tumblr.com/posts/photo"
        params = {
            "api_key": api_key,
            "offset": offset,
            "limit": batch_size,
        }

        response = requests.get(url, params=params)

        if response.status_code != 200:
            print(f"Error fetching posts: {response.status_code}")
            break

        data = response.json()
        posts = data.get("response", {}).get("posts", [])
        total = data.get("response", {}).get("total_posts", 0)

        if not posts:
            break

        all_posts.extend(posts)
        print(f"  Fetched {len(all_posts)} / {total} posts...")

        if limit and len(all_posts) >= limit:
            all_posts = all_posts[:limit]
            break

        if offset + batch_size >= total:
            break

        offset += batch_size
        time.sleep(0.5)  # Rate limiting

    print(f"Total posts fetched: {len(all_posts)}")
    return all_posts


def clean_html(text):
    """Remove HTML tags and decode entities."""
    if not text:
        return ""
    # Decode HTML entities
    text = html.unescape(text)
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Clean up whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_title_from_caption(caption):
    """Try to extract a title from the caption."""
    if not caption:
        return None

    clean = clean_html(caption)

    # If caption is short, use it as title
    if len(clean) < 100:
        return clean

    # Try to get first sentence or line
    first_line = clean.split('\n')[0].strip()
    if first_line and len(first_line) < 100:
        return first_line

    first_sentence = re.split(r'[.!?]', clean)[0].strip()
    if first_sentence and len(first_sentence) < 100:
        return first_sentence

    return clean[:80] + "..."


def detect_mediums(tags, caption):
    """Detect artwork mediums from tags and caption."""
    mediums = set()
    text = " ".join(tags).lower() + " " + clean_html(caption).lower()

    for medium, keywords in MEDIUM_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text:
                mediums.add(medium)
                break

    # Default to illustration if nothing detected
    if not mediums:
        mediums.add("illustration")

    return list(mediums)


def get_best_image_url(post):
    """Get the best quality image URL from a post."""
    photos = post.get("photos", [])
    if not photos:
        return None

    photo = photos[0]
    original = photo.get("original_size", {})

    if original.get("url"):
        return original["url"]

    alt_sizes = photo.get("alt_sizes", [])
    if alt_sizes:
        # Get largest
        alt_sizes.sort(key=lambda x: x.get("width", 0), reverse=True)
        return alt_sizes[0].get("url")

    return None


def download_image(url, filename, dest_dir):
    """Download an image to the destination directory."""
    try:
        response = requests.get(url, timeout=30)
        if response.status_code == 200:
            filepath = dest_dir / filename
            with open(filepath, "wb") as f:
                f.write(response.content)
            return True
    except Exception as e:
        print(f"    Error downloading: {e}")
    return False


def generate_filename_from_url(url):
    """Generate a local filename from a Tumblr image URL."""
    # Extract filename from URL path
    path = urlparse(url).path
    filename = path.split("/")[-1]

    # Ensure it has an extension
    if not any(filename.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".gif"]):
        filename += ".jpg"

    return filename


def process_posts(posts, skip_download=False, dry_run=False):
    """Process posts and extract artwork data."""
    artworks = []
    manifest = load_manifest()

    PUBLIC_TUMBLR_DIR.mkdir(parents=True, exist_ok=True)

    for i, post in enumerate(posts):
        post_id = str(post.get("id"))
        post_date = post.get("date", "")
        caption = post.get("caption", "")
        tags = post.get("tags", [])
        image_url = get_best_image_url(post)

        if not image_url:
            print(f"  [{i+1}] Post {post_id}: No image found, skipping")
            continue

        # Generate local filename
        filename = generate_filename_from_url(image_url)

        # Extract metadata
        title = extract_title_from_caption(caption)
        if not title:
            title = f"Artwork {i+1}"

        description = clean_html(caption)
        if len(description) > 200:
            description = description[:200] + "..."

        # Extract year from post date
        year = ""
        if post_date:
            try:
                dt = datetime.strptime(post_date, "%Y-%m-%d %H:%M:%S GMT")
                year = str(dt.year)
            except:
                pass

        mediums = detect_mediums(tags, caption)

        print(f"  [{i+1}] {title[:50]}... ({year}) [{', '.join(mediums)}]")

        # Download image if needed
        local_path = PUBLIC_TUMBLR_DIR / filename
        if not skip_download and not local_path.exists():
            if not dry_run:
                print(f"    Downloading {filename}...")
                download_image(image_url, filename, PUBLIC_TUMBLR_DIR)
            else:
                print(f"    [DRY RUN] Would download {filename}")

        artwork = {
            "id": f"tumblr-{post_id}",
            "src": f"/tumblr/{filename}",
            "title": title,
            "description": description,
            "date": year,
            "mediums": mediums,
            "alt": title,
            "tumblr_post_id": post_id,
            "tumblr_url": post.get("post_url", ""),
        }

        artworks.append(artwork)

        # Update manifest
        manifest["posts"][post_id] = {
            "filename": filename,
            "synced": datetime.now().isoformat(),
        }

    if not dry_run:
        save_manifest(manifest)

    return artworks


def generate_js_file(artworks):
    """Generate the tumblrImages.js file."""
    js_content = f"""// Auto-generated tumblr images list
// Synced from {TUMBLR_BLOG}.tumblr.com on {datetime.now().isoformat()}
// Total artworks: {len(artworks)}

const tumblrImages = [
"""

    for art in artworks:
        mediums_str = json.dumps(art["mediums"])
        # Escape quotes in strings
        title = art["title"].replace("'", "\\'").replace('"', '\\"')
        description = art["description"].replace("'", "\\'").replace('"', '\\"').replace('\n', ' ')
        alt = art["alt"].replace("'", "\\'").replace('"', '\\"')

        js_content += f"""  {{
    id: '{art["id"]}',
    src: '{art["src"]}',
    title: '{title}',
    description: '{description}',
    date: '{art["date"]}',
    mediums: {mediums_str},
    alt: '{alt}'
  }},
"""

    js_content += """];

export default tumblrImages;
"""

    return js_content


def main():
    parser = argparse.ArgumentParser(
        description="Sync Tumblr posts to art portfolio"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of posts to sync",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview without saving files",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip downloading images (use existing local files)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output file path",
    )
    args = parser.parse_args()

    api_key = get_api_key()

    # Fetch posts
    posts = fetch_all_posts(api_key, limit=args.limit)

    if not posts:
        print("No posts found!")
        return

    # Process posts
    print(f"\nProcessing {len(posts)} posts...")
    print("-" * 50)
    artworks = process_posts(posts, skip_download=args.skip_download, dry_run=args.dry_run)

    # Summary
    print("\n" + "=" * 50)
    print("SYNC SUMMARY")
    print("=" * 50)
    print(f"Total posts processed: {len(posts)}")
    print(f"Artworks extracted: {len(artworks)}")

    if args.dry_run:
        print("\n[DRY RUN] No files were saved.")
        print("\nSample data:")
        for art in artworks[:3]:
            print(f"\n  {art['title'][:50]}...")
            print(f"    Date: {art['date']}")
            print(f"    Mediums: {art['mediums']}")
            print(f"    Description: {art['description'][:60]}...")
    else:
        # Generate and save JS file
        output_path = Path(args.output) if args.output else DATA_FILE

        print(f"\nGenerating {output_path}...")
        js_content = generate_js_file(artworks)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            f.write(js_content)

        print(f"Saved {len(artworks)} artworks to {output_path}")

        # Save JSON backup
        backup_file = Path(__file__).parent / "tumblr_artworks.json"
        with open(backup_file, "w") as f:
            json.dump(artworks, f, indent=2)
        print(f"JSON backup saved to {backup_file}")


if __name__ == "__main__":
    main()
