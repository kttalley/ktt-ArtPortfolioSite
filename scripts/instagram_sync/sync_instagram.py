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
import sys
import json
import glob
import sqlite3
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
# Reusable instaloader session (so you only authenticate once).
SCRIPT_DIR = Path(__file__).parent
SESSION_FILE = SCRIPT_DIR / ".ig_session"


def _load_browser_cookies(L, browser):
    """Import the Instagram session from a locally installed browser.

    Only works on a machine where `browser` is installed AND you are logged
    into instagram.com in it. Prefers `browser_cookie3`, which decrypts
    Chrome/Chromium-family cookie stores correctly on macOS/Windows/Linux
    (their values are encrypted at rest). Falls back to a plaintext Firefox
    SQLite read if the library is unavailable.
    """
    try:
        import browser_cookie3  # noqa: WPS433 (optional dependency)
    except ImportError:
        browser_cookie3 = None

    if browser_cookie3 is not None:
        loaders = {
            "firefox": browser_cookie3.firefox,
            "chrome": browser_cookie3.chrome,
            "chromium": browser_cookie3.chromium,
        }
        loader = loaders.get(browser)
        if loader is None:
            raise SystemExit(f"Unsupported browser for --load-cookies: {browser}")
        try:
            cookiejar = loader(domain_name="instagram.com")
        except Exception as e:
            raise SystemExit(
                f"Could not read {browser} cookies: {e}\n"
                f"Make sure {browser} is installed and you are logged into "
                f"instagram.com in it (close the browser if the DB is locked)."
            )
        L.context._session.cookies.update(cookiejar)
    else:
        # Fallback: plaintext Firefox only (Chrome values are encrypted).
        if browser != "firefox":
            raise SystemExit(
                "browser_cookie3 is not installed, so --load-cookies only supports "
                "firefox here. Install it (pip install browser_cookie3) or use "
                "the IG_SESSIONID method."
            )
        patterns = [
            "~/.mozilla/firefox/*/cookies.sqlite",
            "~/snap/firefox/common/.mozilla/firefox/*/cookies.sqlite",
            "~/.var/app/org.mozilla.firefox/.mozilla/firefox/*/cookies.sqlite",
        ]
        cookie_path = next(
            (m for pat in patterns for m in glob.glob(os.path.expanduser(pat))), None
        )
        if not cookie_path:
            raise SystemExit("No Firefox cookie store found on this machine.")
        conn = sqlite3.connect(f"file:{cookie_path}?immutable=1", uri=True)
        try:
            rows = conn.execute(
                "SELECT name, value FROM moz_cookies WHERE host LIKE '%instagram.com'"
            ).fetchall()
        finally:
            conn.close()
        for name, value in rows:
            L.context._session.cookies.set(name, value, domain=".instagram.com")

    username = L.test_login()
    if not username:
        raise SystemExit(
            f"Found {browser} cookies but they are not a valid Instagram login. "
            f"Make sure you are logged into instagram.com in {browser}."
        )
    L.context.username = username
    return username


def _load_sessionid(L, sessionid, login_user):
    """Authenticate using a raw `sessionid` cookie value.

    Grab it from your browser: log into instagram.com, open DevTools ->
    Application -> Cookies -> https://www.instagram.com -> copy `sessionid`.
    Provide it via the IG_SESSIONID env var (never committed).
    """
    L.context._session.cookies.set(
        "sessionid", sessionid, domain=".instagram.com"
    )
    username = L.test_login()
    if not username:
        raise SystemExit(
            "IG_SESSIONID was provided but Instagram rejected it. "
            "The session may be expired — grab a fresh sessionid from your browser."
        )
    L.context.username = username
    return username


def authenticate(L, args):
    """Set up a logged-in Instagram session (required — anonymous is blocked).

    Resolution order: saved session file -> browser cookies -> IG_SESSIONID.
    On success, the session is saved to SESSION_FILE for reuse.
    """
    login_user = os.environ.get("IG_LOGIN_USER", INSTAGRAM_USERNAME)

    # 1. Reuse a previously saved session if present.
    if SESSION_FILE.exists() and not args.load_cookies and not os.environ.get("IG_SESSIONID"):
        try:
            L.load_session_from_file(login_user, str(SESSION_FILE))
            if L.test_login():
                print(f"Authenticated via saved session ({L.test_login()})")
                return
            print("Saved session expired; re-authenticating...")
        except Exception as e:
            print(f"Could not load saved session ({e}); re-authenticating...")

    # 2. Browser cookie import (only on a machine with that browser).
    if args.load_cookies:
        user = _load_browser_cookies(L, args.load_cookies)
        print(f"Authenticated via {args.load_cookies} cookies ({user})")
    # 3. Raw sessionid from env.
    elif os.environ.get("IG_SESSIONID"):
        user = _load_sessionid(L, os.environ["IG_SESSIONID"].strip(), login_user)
        print(f"Authenticated via IG_SESSIONID ({user})")
    else:
        print(
            "\nERROR: No Instagram authentication available.\n"
            "Instagram blocks anonymous scraping, so a logged-in session is required.\n\n"
            "Option A (this is a headless box): on the machine where you use Instagram,\n"
            "  log into instagram.com, open DevTools -> Application -> Cookies ->\n"
            "  https://www.instagram.com, copy the `sessionid` value, then run:\n"
            "      IG_SESSIONID='<paste-value>' python sync_instagram.py --limit 5\n\n"
            "Option B (machine has the browser): python sync_instagram.py --load-cookies chrome\n"
        )
        raise SystemExit(1)

    # Persist the session for next time.
    try:
        L.save_session_to_file(str(SESSION_FILE))
        os.chmod(SESSION_FILE, 0o600)
        print(f"Saved session to {SESSION_FILE} (reused on future runs)")
    except Exception as e:
        print(f"Warning: could not save session file: {e}")


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


def sync_instagram(limit=None, args=None):
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

    # Authenticate (anonymous access is blocked by Instagram).
    authenticate(L, args)

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
    parser.add_argument(
        "--load-cookies",
        choices=["firefox", "chrome", "chromium"],
        default=None,
        help="Import Instagram login from a locally installed browser",
    )
    args = parser.parse_args()

    sync_instagram(limit=args.limit, args=args)


if __name__ == "__main__":
    main()
