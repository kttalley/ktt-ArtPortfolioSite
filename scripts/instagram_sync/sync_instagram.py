#!/usr/bin/env python3
"""
Instagram Sync Script for Art Portfolio
Downloads new posts from kristian.talley Instagram profile
Generates/updates instagramImages.js data file

Usage:
    python sync_instagram.py
    python sync_instagram.py --limit 20  # Only fetch latest 20 posts
"""

import os
import json
import argparse
from pathlib import Path
from datetime import datetime

try:
    import instaloader
except ImportError:
    print("Error: instaloader not installed. Run: pip install instaloader")
    exit(1)

# Configuration
INSTAGRAM_USERNAME = "kristian.talley"
PROJECT_ROOT = Path(__file__).parent.parent.parent
PUBLIC_DIR = PROJECT_ROOT / "public" / "instagram"
DATA_FILE = PROJECT_ROOT / "src" / "data" / "instagramImages.js"
MANIFEST_FILE = PUBLIC_DIR / ".sync_manifest.json"


def get_existing_manifest():
    """Load manifest of already downloaded posts"""
    if MANIFEST_FILE.exists():
        with open(MANIFEST_FILE, "r") as f:
            return json.load(f)
    return {}


def save_manifest(manifest):
    """Save manifest of downloaded posts"""
    with open(MANIFEST_FILE, "w") as f:
        json.dump(manifest, f, indent=2)


def generate_js_file(images):
    """Generate instagramImages.js in same format as tumblrImages.js"""
    js_content = "// Auto-generated Instagram images list\n"
    js_content += "// Last updated: " + datetime.now().isoformat() + "\n"
    js_content += "const instagramImages = [\n"

    for img in images:
        js_content += f"  {{ id: '{img['id']}', src: '{img['src']}', alt: '{img['alt']}' }},\n"

    js_content += "];\n\n"
    js_content += "export default instagramImages;\n"

    # Ensure data directory exists
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(DATA_FILE, "w") as f:
        f.write(js_content)

    print(f"Generated {DATA_FILE} with {len(images)} images")


def sync_instagram(limit=None):
    """Main sync function"""
    # Ensure directories exist
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    # Load existing manifest
    manifest = get_existing_manifest()
    existing_shortcodes = set(manifest.keys())

    # Initialize Instaloader with minimal settings
    L = instaloader.Instaloader(
        download_pictures=True,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        post_metadata_txt_pattern="",
        filename_pattern="{shortcode}",
    )

    # Get profile
    print(f"Fetching profile: {INSTAGRAM_USERNAME}")
    try:
        profile = instaloader.Profile.from_username(L.context, INSTAGRAM_USERNAME)
    except Exception as e:
        print(f"Error fetching profile: {e}")
        return

    new_posts = 0
    images = []
    post_count = 0

    print(f"Processing posts (limit: {limit or 'all'})...")

    # Iterate through posts
    for post in profile.get_posts():
        if limit and post_count >= limit:
            break
        post_count += 1

        shortcode = post.shortcode

        # Skip videos
        if post.is_video:
            continue

        # Check if already downloaded
        if shortcode in existing_shortcodes:
            # Add to images list (already downloaded)
            img_filename = manifest[shortcode]["filename"]
            images.append(
                {
                    "id": f"insta_{shortcode}",
                    "src": f"/instagram/{img_filename}",
                    "alt": manifest[shortcode].get(
                        "alt", f"Instagram post from {post.date_local.strftime('%B %Y')}"
                    ),
                }
            )
            continue

        # Download new post
        try:
            img_filename = f"{shortcode}.jpg"
            img_path = PUBLIC_DIR / img_filename

            # Download the image
            L.download_pic(
                filename=str(PUBLIC_DIR / shortcode),
                url=post.url,
                mtime=post.date_utc,
            )

            # Rename to .jpg if needed (instaloader may save without extension)
            for f in PUBLIC_DIR.glob(f"{shortcode}*"):
                if f.is_file() and f.suffix in ["", ".jpg", ".jpeg", ".png"]:
                    if f.suffix != ".jpg":
                        f.rename(img_path)
                    break

            # Create alt text from caption (first 100 chars) or date
            caption = post.caption or ""
            alt_text = (
                caption[:100].replace("'", "\\'").replace("\n", " ")
                if caption
                else f"Instagram post from {post.date_local.strftime('%B %Y')}"
            )

            # Update manifest
            manifest[shortcode] = {
                "filename": img_filename,
                "date": post.date_utc.isoformat(),
                "downloaded": datetime.now().isoformat(),
                "alt": alt_text,
            }

            # Add to images list
            images.append(
                {
                    "id": f"insta_{shortcode}",
                    "src": f"/instagram/{img_filename}",
                    "alt": alt_text,
                }
            )

            new_posts += 1
            print(f"  Downloaded: {shortcode}")

        except Exception as e:
            print(f"  Error downloading {shortcode}: {e}")
            continue

    # Sort images by date (newest first)
    images.sort(
        key=lambda x: manifest.get(x["id"].replace("insta_", ""), {}).get("date", ""),
        reverse=True,
    )

    # Save manifest and generate JS file
    save_manifest(manifest)
    generate_js_file(images)

    print(f"\nSync complete: {new_posts} new posts downloaded")
    print(f"Total images: {len(images)}")


def main():
    parser = argparse.ArgumentParser(
        description="Sync Instagram posts for art portfolio"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of posts to fetch (default: all)",
    )
    args = parser.parse_args()

    sync_instagram(limit=args.limit)


if __name__ == "__main__":
    main()
