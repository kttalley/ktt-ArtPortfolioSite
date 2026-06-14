#!/usr/bin/env python3
"""
Instagram Sync (direct API) for Art Portfolio
=============================================

Drop-in alternative to sync_instagram.py that does NOT use instaloader's
web GraphQL path (which Instagram currently rejects with 400 "invalid
request"). Instead it calls the same private API endpoints the instagram.com
website/app use:

  * https://i.instagram.com/api/v1/users/web_profile_info/  (profile + first page)
  * https://i.instagram.com/api/v1/feed/user/<pk>/          (paginated posts)

Authentication: a logged-in session, same as the other script.
  IG_SESSIONID='<sessionid cookie>' python sync_instagram_api.py --limit 5
  python sync_instagram_api.py --load-cookies chrome          (needs browser_cookie3)

It is deliberately gentle: it sleeps between requests and backs off on HTTP 429
(rate limiting). Outputs are identical to sync_instagram.py:
  - downloads images to ../../public/instagram/
  - tracks posts in .sync_manifest.json
  - regenerates ../../src/data/instagramImages.js

Usage:
  python sync_instagram_api.py                 # full sync
  python sync_instagram_api.py --limit 5       # test with newest 5 posts
  python sync_instagram_api.py --delay 4       # seconds between API calls
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    print("Error: requests not installed. Run: pip install requests")
    sys.exit(1)

# ---- Configuration ---------------------------------------------------------
INSTAGRAM_USERNAME = "kristian.talley"
PROJECT_ROOT = Path(__file__).parent.parent.parent
PUBLIC_DIR = PROJECT_ROOT / "public" / "instagram"
DATA_FILE = PROJECT_ROOT / "src" / "data" / "instagramImages.js"
MANIFEST_FILE = PUBLIC_DIR / ".sync_manifest.json"

# Instagram's public web app id — required header for the private web API.
IG_APP_ID = "936619743392459"
DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
API_BASE = "https://i.instagram.com/api/v1"


# ---- Session / auth --------------------------------------------------------
def build_session(args):
    """Return a requests.Session carrying a valid Instagram login."""
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": DEFAULT_UA,
            "X-IG-App-ID": IG_APP_ID,
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": f"https://www.instagram.com/{INSTAGRAM_USERNAME}/",
        }
    )

    if args.load_cookies:
        try:
            import browser_cookie3
        except ImportError:
            raise SystemExit(
                "--load-cookies needs browser_cookie3 (pip install browser_cookie3)"
            )
        loader = {
            "firefox": browser_cookie3.firefox,
            "chrome": browser_cookie3.chrome,
            "chromium": browser_cookie3.chromium,
        }[args.load_cookies]
        cj = loader(domain_name="instagram.com")
        s.cookies.update(cj)
        sessionid = next((c.value for c in cj if c.name == "sessionid"), None)
    else:
        sessionid = os.environ.get("IG_SESSIONID", "").strip()
        if not sessionid:
            raise SystemExit(
                "No auth. Provide IG_SESSIONID='<sessionid cookie>' or --load-cookies <browser>."
            )
        s.cookies.set("sessionid", sessionid, domain=".instagram.com")

    if not sessionid:
        raise SystemExit("Could not find a sessionid cookie in the provided source.")

    # The logged-in user's numeric id is the prefix of the sessionid cookie.
    # (Used only as a fallback if web_profile_info doesn't return it.)
    s._fallback_uid = sessionid.split("%3A")[0].split(":")[0]
    # CSRF token, if present, is echoed back as a header on write-ish calls.
    csrf = s.cookies.get("csrftoken")
    if csrf:
        s.headers["X-CSRFToken"] = csrf
    return s


# ---- HTTP with backoff -----------------------------------------------------
def api_get(session, url, params, delay, label="request", max_retries=5):
    """GET with polite delay + exponential backoff on 429/5xx."""
    backoff = max(delay, 5)
    for attempt in range(1, max_retries + 1):
        time.sleep(delay)
        resp = session.get(url, params=params, timeout=30)
        if resp.status_code == 200:
            try:
                return resp.json()
            except ValueError:
                raise SystemExit(
                    f"{label}: 200 but non-JSON body (login may be invalid).\n"
                    f"  body[:200]: {resp.text[:200]!r}"
                )
        if resp.status_code in (429, 500, 502, 503):
            wait = backoff * attempt
            print(
                f"  {label}: HTTP {resp.status_code} (rate-limited). "
                f"Backing off {wait}s (attempt {attempt}/{max_retries})..."
            )
            time.sleep(wait)
            continue
        if resp.status_code in (401, 403):
            raise SystemExit(
                f"{label}: HTTP {resp.status_code} — session rejected. "
                f"Grab a fresh sessionid (your login may have expired)."
            )
        raise SystemExit(f"{label}: unexpected HTTP {resp.status_code}: {resp.text[:200]}")
    raise SystemExit(
        f"{label}: still rate-limited after {max_retries} retries. "
        f"Wait ~30-60 min and try again, or increase --delay."
    )


# ---- Profile + feed --------------------------------------------------------
def get_user_pk(session, delay):
    data = api_get(
        session,
        f"{API_BASE}/users/web_profile_info/",
        {"username": INSTAGRAM_USERNAME},
        delay,
        label="web_profile_info",
    )
    user = (data or {}).get("data", {}).get("user")
    if not user:
        raise SystemExit("web_profile_info returned no user — check the username/session.")
    pk = user.get("id") or session._fallback_uid
    total = user.get("edge_owner_to_timeline_media", {}).get("count")
    is_private = user.get("is_private")
    print(f"Profile: {INSTAGRAM_USERNAME} (pk={pk}) posts={total} private={is_private}")
    return pk, total


def iter_feed_items(session, pk, delay, limit=None):
    """Yield raw media items newest-first, paginating the user feed."""
    max_id = None
    fetched = 0
    while True:
        params = {"count": 33}
        if max_id:
            params["max_id"] = max_id
        data = api_get(
            session, f"{API_BASE}/feed/user/{pk}/", params, delay, label="user feed"
        )
        items = data.get("items", [])
        for item in items:
            yield item
            fetched += 1
            if limit and fetched >= limit:
                return
        if not data.get("more_available"):
            return
        max_id = data.get("next_max_id")
        if not max_id:
            return


# ---- Media extraction ------------------------------------------------------
def best_image_url(media):
    """Highest-resolution image URL from an image media node (or None)."""
    candidates = (media.get("image_versions2") or {}).get("candidates") or []
    if not candidates:
        return None
    # candidates are ordered largest-first, but sort defensively by area.
    best = max(candidates, key=lambda c: c.get("width", 0) * c.get("height", 0))
    return best.get("url")


def image_url_for_item(item):
    """Return (url) for a post's primary image, or None for video-only posts."""
    media_type = item.get("media_type")
    if media_type == 1:  # single image
        return best_image_url(item)
    if media_type == 8:  # carousel — use the first image child
        for child in item.get("carousel_media", []):
            if child.get("media_type") == 1:
                url = best_image_url(child)
                if url:
                    return url
        return None
    return None  # media_type 2 == video -> skip


# ---- Manifest + JS output (same format as sync_instagram.py) ---------------
def get_existing_manifest():
    if MANIFEST_FILE.exists():
        with open(MANIFEST_FILE, "r") as f:
            return json.load(f)
    return {}


def save_manifest(manifest):
    with open(MANIFEST_FILE, "w") as f:
        json.dump(manifest, f, indent=2)


def generate_js_file(images):
    js = "// Auto-generated Instagram images list (direct API)\n"
    js += "// Last updated: " + datetime.now().isoformat() + "\n"
    js += "const instagramImages = [\n"
    for img in images:
        title = img["title"].replace("\\", "\\\\").replace("'", "\\'")
        alt = img["alt"].replace("\\", "\\\\").replace("'", "\\'")
        js += (
            f"  {{ id: '{img['id']}', src: '{img['src']}', "
            f"title: '{title}', date: '{img['date']}', alt: '{alt}' }},\n"
        )
    js += "];\n\nexport default instagramImages;\n"
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w") as f:
        f.write(js)
    print(f"Generated {DATA_FILE} with {len(images)} images")


def download_image(session, url, dest, delay):
    time.sleep(delay)
    r = session.get(url, timeout=60)
    if r.status_code != 200 or not r.content:
        raise RuntimeError(f"download HTTP {r.status_code}")
    with open(dest, "wb") as f:
        f.write(r.content)


# ---- Main sync -------------------------------------------------------------
def sync(args):
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    manifest = get_existing_manifest()
    known = set(manifest.keys())

    session = build_session(args)
    pk, _total = get_user_pk(session, args.delay)

    images = []
    new_count = 0
    print(f"Fetching posts (limit: {args.limit or 'all'})...")

    for item in iter_feed_items(session, pk, args.delay, limit=args.limit):
        code = item.get("code")
        if not code:
            continue

        taken_at = item.get("taken_at")
        date_iso = (
            datetime.fromtimestamp(taken_at, tz=timezone.utc).isoformat()
            if taken_at
            else ""
        )
        caption_obj = item.get("caption") or {}
        caption = (caption_obj.get("text") or "").strip()
        # First line of caption makes a decent title; fall back to the date.
        first_line = caption.splitlines()[0] if caption else ""
        nice_date = (
            datetime.fromtimestamp(taken_at, tz=timezone.utc).strftime("%B %Y")
            if taken_at
            else ""
        )
        title = (first_line[:80] or f"Instagram post — {nice_date}").strip()
        alt = (caption[:150] or f"Instagram post from {nice_date}").replace("\n", " ")

        filename = f"{code}.jpg"
        dest = PUBLIC_DIR / filename
        record = {
            "id": f"insta_{code}",
            "src": f"/instagram/{filename}",
            "title": title,
            "date": date_iso,
            "alt": alt,
        }

        # Already have it on disk + in manifest -> reuse, no re-download.
        if code in known and dest.exists():
            stored = manifest[code]
            record["title"] = stored.get("title", title)
            record["date"] = stored.get("date", date_iso)
            record["alt"] = stored.get("alt", alt)
            images.append(record)
            continue

        url = image_url_for_item(item)
        if not url:
            # Video-only post — skip (parity with original behaviour).
            continue

        try:
            download_image(session, url, dest, args.delay)
        except Exception as e:
            print(f"  Error downloading {code}: {e}")
            continue

        manifest[code] = {
            "filename": filename,
            "date": date_iso,
            "downloaded": datetime.now().isoformat(),
            "title": title,
            "alt": alt,
        }
        images.append(record)
        new_count += 1
        print(f"  Downloaded: {code}  {title[:50]}")

    # Newest first.
    images.sort(key=lambda x: x.get("date", ""), reverse=True)
    save_manifest(manifest)
    generate_js_file(images)
    print(f"\nSync complete: {new_count} new posts. Total images: {len(images)}")


def main():
    p = argparse.ArgumentParser(description="Sync Instagram posts (direct API)")
    p.add_argument("--limit", type=int, default=None, help="Only fetch newest N posts")
    p.add_argument(
        "--load-cookies",
        choices=["firefox", "chrome", "chromium"],
        default=None,
        help="Import login from a locally installed browser (needs browser_cookie3)",
    )
    p.add_argument(
        "--delay",
        type=float,
        default=3.0,
        help="Seconds to wait between API calls (raise this if rate-limited)",
    )
    sync(p.parse_args())


if __name__ == "__main__":
    main()
