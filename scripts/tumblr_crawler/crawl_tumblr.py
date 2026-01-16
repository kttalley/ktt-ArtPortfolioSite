#!/usr/bin/env python3
"""
Tumblr Crawler Agent with Vision Capabilities

Crawls kristiantalley.tumblr.com post by post, uses Claude's vision API
to analyze each artwork and extract metadata (title, description, date, medium),
then maps it to existing tumblr images in the codebase.

Usage:
    python crawl_tumblr.py                    # Process all posts
    python crawl_tumblr.py --limit 10         # Process only 10 posts
    python crawl_tumblr.py --start-offset 50  # Start from post 50
    python crawl_tumblr.py --dry-run          # Preview without saving

Environment variables required:
    TUMBLR_API_KEY - Your Tumblr API consumer key
    ANTHROPIC_API_KEY - Your Anthropic API key for Claude vision
"""

import os
import sys
import json
import argparse
import hashlib
import re
import time
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print("Error: requests not installed. Run: pip install requests")
    sys.exit(1)

try:
    import anthropic
except ImportError:
    print("Error: anthropic not installed. Run: pip install anthropic")
    sys.exit(1)

# Configuration
TUMBLR_BLOG = "kristiantalley"
PROJECT_ROOT = Path(__file__).parent.parent.parent
PUBLIC_TUMBLR_DIR = PROJECT_ROOT / "public" / "tumblr"
DATA_FILE = PROJECT_ROOT / "src" / "data" / "tumblrImages.js"
METADATA_CACHE = Path(__file__).parent / ".tumblr_metadata_cache.json"
PROGRESS_FILE = Path(__file__).parent / ".crawl_progress.json"

# Valid mediums that match the codebase
VALID_MEDIUMS = ["illustration", "painting", "sculpture", "printmaking", "programming"]


def get_api_keys():
    """Get API keys from environment variables."""
    tumblr_key = os.environ.get("TUMBLR_API_KEY")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")

    if not tumblr_key:
        print("Error: TUMBLR_API_KEY environment variable not set")
        print("Get your API key at: https://www.tumblr.com/oauth/apps")
        sys.exit(1)

    if not anthropic_key:
        print("Error: ANTHROPIC_API_KEY environment variable not set")
        print("Get your API key at: https://console.anthropic.com/")
        sys.exit(1)

    return tumblr_key, anthropic_key


def load_existing_tumblr_images():
    """Load existing tumblr image filenames from the public folder."""
    images = {}
    if PUBLIC_TUMBLR_DIR.exists():
        for f in PUBLIC_TUMBLR_DIR.iterdir():
            if f.is_file() and f.suffix.lower() in [".jpg", ".jpeg", ".png", ".gif"]:
                # Extract the tumblr ID from filename (e.g., tumblr_ldp9h07McW1qfchfvo1_1280.jpg)
                images[f.name] = f
    return images


def extract_tumblr_id_from_filename(filename):
    """Extract the unique tumblr post ID from a filename."""
    # Tumblr filenames are like: tumblr_[hash]_[size].jpg
    # The hash part is unique per post
    match = re.match(r'tumblr_([a-zA-Z0-9]+)_', filename)
    if match:
        return match.group(1)
    return None


def load_cache():
    """Load cached metadata to avoid re-analyzing already processed posts."""
    if METADATA_CACHE.exists():
        with open(METADATA_CACHE, "r") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    """Save metadata cache."""
    with open(METADATA_CACHE, "w") as f:
        json.dump(cache, f, indent=2)


def load_progress():
    """Load crawl progress."""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, "r") as f:
            return json.load(f)
    return {"last_offset": 0, "processed_posts": []}


def save_progress(progress):
    """Save crawl progress."""
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


def fetch_tumblr_posts(api_key, offset=0, limit=20):
    """Fetch posts from Tumblr API v2."""
    url = f"https://api.tumblr.com/v2/blog/{TUMBLR_BLOG}.tumblr.com/posts/photo"
    params = {
        "api_key": api_key,
        "offset": offset,
        "limit": min(limit, 20),  # Tumblr API max is 20 per request
    }

    response = requests.get(url, params=params)

    if response.status_code != 200:
        print(f"Error fetching posts: {response.status_code}")
        print(response.text)
        return None

    return response.json()


def get_image_url_from_post(post):
    """Extract the best quality image URL from a Tumblr post."""
    photos = post.get("photos", [])
    if not photos:
        return None, None

    # Get the first photo (main image)
    photo = photos[0]
    alt_sizes = photo.get("alt_sizes", [])
    original = photo.get("original_size", {})

    # Prefer original size, otherwise get largest alt
    if original.get("url"):
        return original["url"], original.get("width", 0)

    if alt_sizes:
        # Sort by width and get largest
        alt_sizes.sort(key=lambda x: x.get("width", 0), reverse=True)
        return alt_sizes[0].get("url"), alt_sizes[0].get("width", 0)

    return None, None


def extract_tumblr_hash_from_url(url):
    """Extract the tumblr hash from an image URL."""
    # URLs like: https://64.media.tumblr.com/abc123xyz/tumblr_ldp9h07McW1qfchfvo1_1280.jpg
    filename = urlparse(url).path.split("/")[-1]
    return extract_tumblr_id_from_filename(filename), filename


def analyze_artwork_with_vision(client, image_url, post_caption=""):
    """Use Claude's vision API to analyze an artwork image."""

    prompt = f"""Analyze this artwork image and provide metadata in JSON format.

The artwork is from an artist's portfolio. Based on what you see in the image, provide:

1. **title**: A descriptive title for the artwork. If you can identify text/title in the image, use that.
   Otherwise, create a concise, evocative title based on the subject matter (e.g., "Portrait Study in Blue",
   "Abstract Composition #3", "Urban Landscape at Dusk"). Avoid generic titles like "Untitled".

2. **description**: A brief description of the artwork including the apparent medium/technique
   (e.g., "Ink and watercolor illustration depicting...", "Digital painting exploring...",
   "Charcoal study of..."). Keep it under 100 words.

3. **medium**: Choose ONE OR MORE from this exact list that best describes the artwork:
   - "illustration" (digital art, ink drawings, sketches, character art)
   - "painting" (oil, acrylic, watercolor, gouache)
   - "sculpture" (3D works, installations)
   - "printmaking" (screenprints, lithographs, etchings, block prints)
   - "programming" (generative art, creative coding, interactive pieces)

4. **estimated_year**: If you can determine or estimate the year from any visible date,
   style indicators, or context, provide it. Otherwise, leave empty.

Post caption from Tumblr (may contain useful context):
{post_caption if post_caption else "(No caption available)"}

Respond ONLY with valid JSON in this exact format:
{{
    "title": "...",
    "description": "...",
    "mediums": ["...", "..."],
    "estimated_year": "..."
}}"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "url",
                                "url": image_url,
                            },
                        },
                        {
                            "type": "text",
                            "text": prompt,
                        }
                    ],
                }
            ],
        )

        # Extract JSON from response
        response_text = response.content[0].text.strip()

        # Try to parse JSON (handle markdown code blocks)
        if response_text.startswith("```"):
            response_text = re.sub(r'^```(?:json)?\n?', '', response_text)
            response_text = re.sub(r'\n?```$', '', response_text)

        metadata = json.loads(response_text)

        # Validate mediums
        validated_mediums = []
        for m in metadata.get("mediums", []):
            if m.lower() in VALID_MEDIUMS:
                validated_mediums.append(m.lower())

        if not validated_mediums:
            validated_mediums = ["illustration"]  # Default fallback

        return {
            "title": metadata.get("title", "Untitled"),
            "description": metadata.get("description", ""),
            "mediums": validated_mediums,
            "date": metadata.get("estimated_year", ""),
        }

    except json.JSONDecodeError as e:
        print(f"  Warning: Could not parse vision response as JSON: {e}")
        return None
    except anthropic.APIError as e:
        print(f"  Warning: Claude API error: {e}")
        return None


def match_post_to_local_file(post, local_images, verbose=False):
    """Try to match a Tumblr post to a local image file."""
    image_url, _ = get_image_url_from_post(post)
    if not image_url:
        if verbose:
            print(f"    [DEBUG] No image URL found in post")
        return None

    if verbose:
        print(f"    [DEBUG] Image URL: {image_url}")

    tumblr_hash, url_filename = extract_tumblr_hash_from_url(image_url)

    if verbose:
        print(f"    [DEBUG] Extracted hash: {tumblr_hash}, filename: {url_filename}")

    if not tumblr_hash:
        # Try alternate extraction - some URLs have hash in path
        path_parts = urlparse(image_url).path.split("/")
        for part in path_parts:
            if part.startswith("tumblr_"):
                tumblr_hash = extract_tumblr_id_from_filename(part)
                if tumblr_hash:
                    url_filename = part
                    if verbose:
                        print(f"    [DEBUG] Found hash in path: {tumblr_hash}")
                    break

    if not tumblr_hash:
        if verbose:
            print(f"    [DEBUG] Could not extract hash from URL")
        return None

    # Try to find matching local file by hash
    for local_filename, local_path in local_images.items():
        local_hash = extract_tumblr_id_from_filename(local_filename)
        if local_hash == tumblr_hash:
            if verbose:
                print(f"    [DEBUG] MATCH: {local_filename}")
            return local_filename

    if verbose:
        print(f"    [DEBUG] No local file matched hash: {tumblr_hash}")

    return None


def generate_enriched_js_file(enriched_data, existing_images):
    """Generate the updated tumblrImages.js with enriched metadata."""

    # Build complete list with enriched + existing placeholder data
    all_images = []

    # Sort by local filename to maintain consistent ordering
    sorted_filenames = sorted(existing_images.keys())

    for idx, filename in enumerate(sorted_filenames):
        img_id = f"tumblr-{idx}"
        src = f"/tumblr/{filename}"

        if filename in enriched_data:
            data = enriched_data[filename]
            all_images.append({
                "id": img_id,
                "src": src,
                "title": data.get("title", f"Archive {idx + 1}"),
                "description": data.get("description", "Archived work from tumblr"),
                "date": data.get("date", ""),
                "mediums": data.get("mediums", ["illustration"]),
                "alt": data.get("title", f"Tumblr artwork {idx + 1}"),
            })
        else:
            # Keep placeholder for unprocessed images
            all_images.append({
                "id": img_id,
                "src": src,
                "title": f"Archive {idx + 1}",
                "description": "Archived work from tumblr",
                "date": "",
                "mediums": ["illustration"],
                "alt": f"Tumblr artwork {idx + 1}",
            })

    # Generate JS content with full metadata
    js_content = """// Auto-generated tumblr images list with enriched metadata
// Last updated: {timestamp}
// Processed by tumblr_crawler with Claude vision analysis

const tumblrImages = [
""".format(timestamp=datetime.now().isoformat())

    for img in all_images:
        mediums_str = json.dumps(img["mediums"])
        # Escape any quotes in strings
        title = img["title"].replace("'", "\\'").replace('"', '\\"')
        description = img["description"].replace("'", "\\'").replace('"', '\\"')
        alt = img["alt"].replace("'", "\\'").replace('"', '\\"')

        js_content += f"""  {{
    id: '{img["id"]}',
    src: '{img["src"]}',
    title: '{title}',
    description: '{description}',
    date: '{img["date"]}',
    mediums: {mediums_str},
    alt: '{alt}'
  }},
"""

    js_content += """];

export default tumblrImages;
"""

    return js_content, all_images


def analyze_local_files(client, local_images, cache, args):
    """Analyze local tumblr images directly without API matching."""
    enriched_data = dict(cache)
    total_processed = 0
    total_analyzed = 0

    sorted_filenames = sorted(local_images.keys())
    total_files = len(sorted_filenames)

    # Apply offset and limit
    start_idx = args.start_offset
    end_idx = total_files if not args.limit else min(start_idx + args.limit, total_files)
    files_to_process = sorted_filenames[start_idx:end_idx]

    print(f"\nProcessing {len(files_to_process)} local files...")
    print(f"Range: {start_idx} to {end_idx} of {total_files}")
    print("-" * 50)

    for filename in files_to_process:
        total_processed += 1

        # Check cache
        if filename in cache and not args.skip_cache:
            print(f"  [{start_idx + total_processed}] {filename}: Using cached metadata")
            continue

        # Build local file URL for vision API (needs to be accessible)
        # Since local files aren't web-accessible, we'll read and base64 encode
        local_path = local_images[filename]

        print(f"  [{start_idx + total_processed}] {filename}: Analyzing with vision...")

        try:
            # Read image file and base64 encode
            import base64
            with open(local_path, "rb") as f:
                image_data = base64.standard_b64encode(f.read()).decode("utf-8")

            # Determine media type
            suffix = local_path.suffix.lower()
            media_type = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".gif": "image/gif",
            }.get(suffix, "image/jpeg")

            # Analyze with vision using base64
            metadata = analyze_artwork_with_vision_base64(client, image_data, media_type)

            if metadata:
                enriched_data[filename] = metadata
                total_analyzed += 1
                print(f"    -> Title: {metadata['title'][:50]}...")
                print(f"    -> Mediums: {metadata['mediums']}")

                # Save cache after each analysis
                if not args.dry_run:
                    save_cache(enriched_data)

            # Rate limiting
            time.sleep(1)

        except Exception as e:
            print(f"    Error analyzing {filename}: {e}")
            continue

    return enriched_data, total_processed, total_analyzed


def analyze_artwork_with_vision_base64(client, image_data, media_type):
    """Use Claude's vision API to analyze an artwork from base64 data."""

    prompt = """Analyze this artwork image and provide metadata in JSON format.

The artwork is from an artist's portfolio. Based on what you see in the image, provide:

1. **title**: A descriptive title for the artwork. If you can identify text/title in the image, use that.
   Otherwise, create a concise, evocative title based on the subject matter (e.g., "Portrait Study in Blue",
   "Abstract Composition #3", "Urban Landscape at Dusk"). Avoid generic titles like "Untitled".

2. **description**: A brief description of the artwork including the apparent medium/technique
   (e.g., "Ink and watercolor illustration depicting...", "Digital painting exploring...",
   "Charcoal study of..."). Keep it under 100 words.

3. **medium**: Choose ONE OR MORE from this exact list that best describes the artwork:
   - "illustration" (digital art, ink drawings, sketches, character art)
   - "painting" (oil, acrylic, watercolor, gouache)
   - "sculpture" (3D works, installations)
   - "printmaking" (screenprints, lithographs, etchings, block prints)
   - "programming" (generative art, creative coding, interactive pieces)

4. **estimated_year**: If you can determine or estimate the year from any visible date,
   style indicators, or context, provide it. Otherwise, leave empty.

Respond ONLY with valid JSON in this exact format:
{
    "title": "...",
    "description": "...",
    "mediums": ["...", "..."],
    "estimated_year": "..."
}"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_data,
                            },
                        },
                        {
                            "type": "text",
                            "text": prompt,
                        }
                    ],
                }
            ],
        )

        # Extract JSON from response
        response_text = response.content[0].text.strip()

        # Try to parse JSON (handle markdown code blocks)
        if response_text.startswith("```"):
            response_text = re.sub(r'^```(?:json)?\n?', '', response_text)
            response_text = re.sub(r'\n?```$', '', response_text)

        metadata = json.loads(response_text)

        # Validate mediums
        validated_mediums = []
        for m in metadata.get("mediums", []):
            if m.lower() in VALID_MEDIUMS:
                validated_mediums.append(m.lower())

        if not validated_mediums:
            validated_mediums = ["illustration"]

        return {
            "title": metadata.get("title", "Untitled"),
            "description": metadata.get("description", ""),
            "mediums": validated_mediums,
            "date": metadata.get("estimated_year", ""),
        }

    except json.JSONDecodeError as e:
        print(f"  Warning: Could not parse vision response as JSON: {e}")
        return None
    except anthropic.APIError as e:
        print(f"  Warning: Claude API error: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Crawl Tumblr blog and enrich artwork metadata using Claude vision"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of posts to process (default: all)",
    )
    parser.add_argument(
        "--start-offset",
        type=int,
        default=0,
        help="Start processing from this offset (default: 0)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview without saving files",
    )
    parser.add_argument(
        "--skip-cache",
        action="store_true",
        help="Skip cached entries and re-analyze all",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output file path (default: src/data/tumblrImages.js)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show detailed debug output for matching",
    )
    parser.add_argument(
        "--scan-all",
        action="store_true",
        help="Scan ALL posts to find matches (ignores --limit, useful for old archives)",
    )
    parser.add_argument(
        "--local-only",
        action="store_true",
        help="Analyze local files directly without fetching from Tumblr API (no TUMBLR_API_KEY needed)",
    )
    args = parser.parse_args()

    # Get API keys (Tumblr key not needed for local-only mode)
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if not anthropic_key:
        print("Error: ANTHROPIC_API_KEY environment variable not set")
        print("Get your API key at: https://console.anthropic.com/")
        sys.exit(1)

    tumblr_key = None
    if not args.local_only:
        tumblr_key = os.environ.get("TUMBLR_API_KEY")
        if not tumblr_key:
            print("Error: TUMBLR_API_KEY environment variable not set")
            print("Get your API key at: https://www.tumblr.com/oauth/apps")
            print("Or use --local-only to analyze local files without Tumblr API")
            sys.exit(1)

    # Initialize Anthropic client
    client = anthropic.Anthropic(api_key=anthropic_key)

    # Load existing local images
    print(f"Loading existing tumblr images from {PUBLIC_TUMBLR_DIR}...")
    local_images = load_existing_tumblr_images()
    print(f"Found {len(local_images)} local tumblr images")

    # Load cache
    cache = {} if args.skip_cache else load_cache()
    print(f"Loaded {len(cache)} cached entries")

    # LOCAL-ONLY MODE: Analyze files directly without Tumblr API
    if args.local_only:
        enriched_data, total_processed, total_analyzed = analyze_local_files(
            client, local_images, cache, args
        )

        print("\n" + "=" * 50)
        print("LOCAL ANALYSIS SUMMARY")
        print("=" * 50)
        print(f"Total files processed: {total_processed}")
        print(f"Files analyzed with vision: {total_analyzed}")
        print(f"Total enriched entries: {len(enriched_data)}")

        if args.dry_run:
            print("\n[DRY RUN] No files were saved.")
            print("\nSample enriched data:")
            for filename, data in list(enriched_data.items())[:3]:
                print(f"\n  {filename}:")
                print(f"    Title: {data.get('title')}")
                print(f"    Description: {data.get('description', '')[:80]}...")
                print(f"    Mediums: {data.get('mediums')}")
        else:
            output_path = Path(args.output) if args.output else DATA_FILE
            print(f"\nGenerating enriched tumblrImages.js...")
            js_content, all_images = generate_enriched_js_file(enriched_data, local_images)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "w") as f:
                f.write(js_content)
            print(f"Saved to: {output_path}")
            print(f"Total images in output: {len(all_images)}")

            backup_file = Path(__file__).parent / "enriched_metadata.json"
            with open(backup_file, "w") as f:
                json.dump(enriched_data, f, indent=2)
            print(f"Metadata backup saved to: {backup_file}")

        return

    # TUMBLR API MODE: Match posts to local files
    # Track enriched data
    enriched_data = dict(cache)  # Start with cached data

    # Fetch and process posts
    offset = args.start_offset
    total_processed = 0
    total_matched = 0
    total_analyzed = 0

    # Handle scan-all mode
    effective_limit = None if args.scan_all else args.limit

    print(f"\nStarting crawl of {TUMBLR_BLOG}.tumblr.com...")
    print(f"Offset: {offset}, Limit: {effective_limit or 'all'}")
    if args.scan_all:
        print("SCAN-ALL MODE: Will iterate through entire blog to find matching posts")
    print("-" * 50)

    while True:
        if effective_limit and total_processed >= effective_limit:
            break

        # Fetch batch of posts
        batch_size = min(20, effective_limit - total_processed if effective_limit else 20)
        print(f"\nFetching posts {offset} to {offset + batch_size}...")

        result = fetch_tumblr_posts(tumblr_key, offset=offset, limit=batch_size)

        if not result:
            print("Failed to fetch posts, stopping.")
            break

        posts = result.get("response", {}).get("posts", [])

        if not posts:
            print("No more posts found.")
            break

        total_posts = result.get("response", {}).get("total_posts", 0)
        print(f"Processing {len(posts)} posts (total on blog: {total_posts})")

        for post in posts:
            if effective_limit and total_processed >= effective_limit:
                break

            total_processed += 1
            post_id = post.get("id")
            post_date = post.get("date", "")
            post_caption = post.get("caption", "")

            # Clean HTML from caption
            post_caption_clean = re.sub(r'<[^>]+>', '', post_caption).strip()

            # Try to match to local file
            local_filename = match_post_to_local_file(post, local_images, verbose=args.verbose)

            if not local_filename:
                print(f"  [{total_processed}] Post {post_id}: No local match found")
                continue

            total_matched += 1

            # Check cache
            if local_filename in cache and not args.skip_cache:
                print(f"  [{total_processed}] {local_filename}: Using cached metadata")
                continue

            # Get image URL for vision analysis
            image_url, _ = get_image_url_from_post(post)

            if not image_url:
                print(f"  [{total_processed}] {local_filename}: No image URL found")
                continue

            print(f"  [{total_processed}] {local_filename}: Analyzing with vision...")

            # Analyze with Claude vision
            metadata = analyze_artwork_with_vision(client, image_url, post_caption_clean)

            if metadata:
                # Extract year from post date if vision didn't find one
                if not metadata.get("date") and post_date:
                    try:
                        year = datetime.strptime(post_date, "%Y-%m-%d %H:%M:%S GMT").year
                        metadata["date"] = str(year)
                    except:
                        pass

                enriched_data[local_filename] = metadata
                total_analyzed += 1
                print(f"    -> Title: {metadata['title'][:50]}...")
                print(f"    -> Mediums: {metadata['mediums']}")

                # Save cache after each analysis (in case of interruption)
                if not args.dry_run:
                    save_cache(enriched_data)

            # Rate limiting - be nice to APIs
            time.sleep(1)

        offset += len(posts)

        # Check if we've processed all posts
        if offset >= total_posts:
            print("\nReached end of blog posts.")
            break

    # Generate output
    print("\n" + "=" * 50)
    print("CRAWL SUMMARY")
    print("=" * 50)
    print(f"Total posts processed: {total_processed}")
    print(f"Posts matched to local files: {total_matched}")
    print(f"Posts analyzed with vision: {total_analyzed}")
    print(f"Total enriched entries: {len(enriched_data)}")

    if args.dry_run:
        print("\n[DRY RUN] No files were saved.")
        print("\nSample enriched data:")
        for filename, data in list(enriched_data.items())[:3]:
            print(f"\n  {filename}:")
            print(f"    Title: {data.get('title')}")
            print(f"    Description: {data.get('description', '')[:80]}...")
            print(f"    Mediums: {data.get('mediums')}")
            print(f"    Date: {data.get('date')}")
    else:
        # Generate and save enriched JS file
        output_path = Path(args.output) if args.output else DATA_FILE

        print(f"\nGenerating enriched tumblrImages.js...")
        js_content, all_images = generate_enriched_js_file(enriched_data, local_images)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            f.write(js_content)

        print(f"Saved to: {output_path}")
        print(f"Total images in output: {len(all_images)}")

        # Also save a JSON backup of the metadata
        backup_file = Path(__file__).parent / "enriched_metadata.json"
        with open(backup_file, "w") as f:
            json.dump(enriched_data, f, indent=2)
        print(f"Metadata backup saved to: {backup_file}")


if __name__ == "__main__":
    main()
