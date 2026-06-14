# Instagram Sync: Scraper Research & Ranked Recommendations

**Researched:** June 14, 2026  
**Context:** Fetching own posts (account: `kristian.talley`, public) — images + captions + timestamps — for an art portfolio gallery, ideally via cron automation.  
**Current failures:** instaloader 4.15.1 GraphQL 400/403; `i.instagram.com/api/v1/users/web_profile_info/` returns 429 after a handful of requests.

---

## Ranked Recommendations (best → worst for this use case)

| Rank | Option | Works 2026? | Cron-safe? | Ban risk | Cost |
|------|--------|-------------|------------|----------|------|
| 1 | **Official Graph API (Graph API + creator acct)** | Yes | Yes (token refresh cron) | None | Free |
| 2 | **instagrapi (private mobile API)** | Yes (fragile) | Yes with care | Low-moderate | Free |
| 3 | **gallery-dl (cookie auth)** | Yes | Yes with care | Low-moderate | Free |
| 4 | **DYI export (backfill) + lighter delta method** | Yes (one-shot) | No (manual) | None | Free |
| 5 | **HikerAPI / Apify (hosted scrapers)** | Yes | Yes | None | Paid |
| 6 | **instaloader 4.15.1** | Broken (403/400) | No | N/A | Free |

---

## Option 1: Official Instagram Graph API (RECOMMENDED)

### Status (June 2026)
Active and working. The **Instagram Basic Display API was permanently shut down December 4, 2024**. Its replacement is the **Instagram API with Instagram Login** (for consumer apps) and the classic **Instagram Graph API** (for Business/Creator management). For read-only media fetching from your own account, the Graph API with Instagram Login is the correct path.

### Requirements
- Convert account `kristian.talley` to a **Creator or Business** account (free, reversible in Settings → Account type)
- Create a **Meta Developer app** at developers.facebook.com (Business type)
- For Graph API: link the Instagram account to a **Facebook Page**
- For Instagram Login API: no Facebook Page needed, but still requires Business/Creator account

### What you get
Fields available on `GET /{ig-user-id}/media`:
```
id, caption, media_type, media_url, permalink, timestamp, like_count, comments_count
```
Returns up to 10,000 most recent posts. Supports IMAGE, VIDEO, CAROUSEL_ALBUM. `media_url` is a direct CDN link to the image.

### Example request
```bash
curl "https://graph.facebook.com/v22.0/me/media\
?fields=id,caption,media_type,media_url,permalink,timestamp\
&limit=100\
&access_token=YOUR_LONG_LIVED_TOKEN"
```

### Token management (critical for cron)
- Short-lived tokens: ~1 hour
- Long-lived tokens: **60 days from last refresh** (do NOT auto-expire if refreshed)
- Refresh endpoint (GET):
  ```
  https://graph.instagram.com/refresh_access_token
    ?grant_type=ig_refresh_token
    &access_token=<LONG_LIVED_TOKEN>
  ```
- Required permission for refresh: `instagram_business_basic`
- **Automate: run a cron every 50 days** to refresh before the 60-day window closes.

### App review
- In **development mode**, only accounts listed as developers/testers/admins on the app can authenticate — which includes your own account. You do NOT need to pass app review to read your own media in dev mode.
- If you ever want other users to connect, app review takes 1–4 weeks.

### Rate limits
- 200 API calls per hour per user token. More than enough for a portfolio sync cron.

### Cron automation sketch
```python
import requests, json, os

TOKEN_FILE = "ig_token.json"

def get_token():
    return json.load(open(TOKEN_FILE))["access_token"]

def refresh_token(token):
    r = requests.get(
        "https://graph.instagram.com/refresh_access_token",
        params={"grant_type": "ig_refresh_token", "access_token": token}
    )
    r.raise_for_status()
    data = r.json()
    json.dump({"access_token": data["access_token"]}, open(TOKEN_FILE, "w"))
    return data["access_token"]

def fetch_posts(token, limit=50):
    posts = []
    url = "https://graph.facebook.com/v22.0/me/media"
    params = {
        "fields": "id,caption,media_type,media_url,permalink,timestamp",
        "limit": limit,
        "access_token": token,
    }
    while url:
        r = requests.get(url, params=params)
        r.raise_for_status()
        data = r.json()
        posts.extend(data.get("data", []))
        url = data.get("paging", {}).get("next")
        params = {}  # next URL already has params encoded
    return posts
```

### ToS / ban risk
None — this is the official API. No account ban risk whatsoever.

### Verdict
Best option for this use case. Setup cost is ~2 hours once (account type conversion + dev app + OAuth flow + token storage). After that, a 50-day cron refresh is all that's needed. Delivers captions + timestamps + direct image URLs.

**Source:** [Meta Instagram Platform Docs](https://developers.facebook.com/docs/instagram-platform/), [Elfsight Graph API Guide 2026](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/), [Zernio Instagram API Overview](https://zernio.com/blog/instagram-api), [Phyllo Integration Guide](https://www.getphyllo.com/post/instagram-api-integration-101-for-developers-of-the-creator-economy)

---

## Option 2: instagrapi (Python, private mobile API)

### Status (June 2026)
**Working.** Latest release: **2.10.5, released June 14, 2026** (same day as this research). Actively maintained by subzeroid. Uses the Instagram private mobile app API — the same endpoints the iOS/Android app uses — combined with public web paths as fallback.

GitHub: https://github.com/subzeroid/instagrapi  
Stars: 6,300+, 924 forks.

Note: The Telegram support group was restricted by Meta; use the aiograpi_support group now.

### Auth model
Session-based with device emulation. First login generates a `session.json` file that persists device fingerprint, cookies, and auth tokens. Subsequent runs load from this file (critical — do NOT login fresh each cron run).

```python
from instagrapi import Client
import time

cl = Client()
SESSION_FILE = "session.json"

# First run or if session is stale
try:
    cl.load_settings(SESSION_FILE)
    cl.login("kristian.talley", "PASSWORD")
except Exception:
    cl.login("kristian.talley", "PASSWORD")
    cl.dump_settings(SESSION_FILE)

# Fetch your own posts
user_id = cl.user_id_from_username("kristian.talley")
medias = cl.user_medias(user_id, amount=0)  # amount=0 = all posts

for m in medias:
    print(m.code, m.taken_at, m.caption_text, m.thumbnail_url or m.resources)
    time.sleep(2)  # required delay between iterations
```

### Data returned
Each `Media` object includes:
- `taken_at` — timezone-aware `datetime`
- `caption_text` — full caption string
- `media_type` — 1=photo, 2=video, 8=carousel
- `thumbnail_url` — image URL (for photos)
- `resources` — list of carousel children with their URLs
- `like_count`, `comment_count`, `code` (post slug)

### Rate limit / blocking behavior
- 200 req/hour per IP, enforced by Instagram
- `ClientThrottledError` (429) and `PleaseWaitFewMinutes` are catchable exceptions
- `delay_range = [1, 3]` on the client adds random delays between all requests
- For a small personal account (~tens of posts), a full fetch is a handful of requests — well within limits
- For incremental cron runs (only new posts since last fetch), risk is minimal

### Ban risk
**Low-to-moderate for read-only, own account.** Key mitigations:
- Reuse saved session (`dump_settings` / `load_settings`), never login fresh each run
- Use a single consistent residential IP — do NOT rotate proxies
- Add delays between page fetches (`cl.delay_range = [2, 5]`)
- Read-only monitoring is significantly safer than write actions (likes, comments, follows)
- Maintainer's own docs note: "best suited for testing, research, and controlled internal automation"

### ToS risk
Violates Instagram ToS (automated access via private API). For a personal portfolio cron job with low request volume, real-world enforcement risk is very low, but it is technically against the rules.

### Cron feasibility
Yes — works well for cron with session reuse. Run no more frequently than needed (e.g., every 6–24 hours).

### Verdict
Strong #2 option. No setup bureaucracy. Works today. The main tradeoff vs. Graph API is ToS violation risk and fragility when Instagram changes their private API (has happened before; maintainer usually patches within days to weeks).

**Sources:** [instagrapi GitHub](https://github.com/subzeroid/instagrapi), [instagrapi Best Practices](https://subzeroid.github.io/instagrapi/usage-guide/best-practices.html), [instagrapi Python Guide](https://instagrapi.com/guides/instagram-scraper-python), [instagrapi ban risk discussion](https://github.com/subzeroid/instagrapi/discussions/2224)

---

## Option 3: gallery-dl (cookie-based downloader)

### Status (June 2026)
**Working** for posts. Latest version: **1.31.1 (January 2, 2026)**. Actively maintained. Username/password login is no longer supported — cookie auth only.

GitHub: https://github.com/mikf/gallery-dl

### Auth
Export cookies from a logged-in browser session (Firefox or Chrome). gallery-dl reads them via:
```bash
gallery-dl --cookies-from-browser firefox https://www.instagram.com/kristian.talley/
```
Or in config.json:
```json
{
  "extractor": {
    "instagram": {
      "cookies": "/path/to/cookies.txt",
      "sleep-request": [6.0, 12.0],
      "api": "rest"
    }
  }
}
```

### Data returned
- Downloads image files to disk
- With `--write-metadata` or `--write-info-json`: writes a `.json` sidecar per image containing caption, media_id, taken_at timestamp
- Caption is available in the metadata JSON

### Rate limits
- Gets 429 errors when hammering multiple profiles sequentially
- Single-profile own-account fetches are fine
- Recommend `"sleep-request": [6.0, 12.0]` in config
- A fix for 429 on stories was merged (labeled "fixed") in February 2026

### Ban risk
**Low-to-moderate.** Uses real browser cookies, so fingerprint matches a legitimate browser. Risk is higher when hitting 429 and not backing off.

### Cron feasibility
Yes, but less elegant than instagrapi for programmatic use. gallery-dl outputs files to disk; you'd need a post-processing script to parse the `.json` sidecars and load them into your gallery data. Not designed for "give me a Python list of posts" workflows.

### ToS risk
Same as instagrapi — violates ToS.

### Verdict
Good for bulk downloads (runs in shell, handles pagination automatically), but requires cookie refresh every time your session expires. More suited to manual/semi-manual syncs than fully automated cron pipelines. Metadata extraction works but requires sidecar file parsing.

**Sources:** [gallery-dl PyPI](https://pypi.org/project/gallery-dl/), [gallery-dl Instagram discussion](https://github.com/mikf/gallery-dl/discussions/5586), [gallery-dl cookies guide](https://gallery-dlp.github.io/cookies.html), [gallery-dl 429 issue Feb 2026](https://github.com/mikf/gallery-dl/issues/8978)

---

## Option 4: Instagram "Download Your Information" (DYI) Export

### Status (June 2026)
Available and fully functional. Accessed via: Instagram → Settings → Your Activity → Download Your Information → Download or Transfer Information → Some of your information → Posts. Choose JSON format.

### What you get
The export ZIP contains:
- `your_instagram_activity/content/posts_1.json` (and `posts_2.json`, etc.)
- Actual image files in `media/posts/`
- JSON structure per post:
```json
{
  "media": [
    {
      "uri": "media/posts/202311/filename.jpg",
      "creation_timestamp": 1700000000,
      "title": "Caption text here #hashtag",
      "media_metadata": { ... }
    }
  ]
}
```
- `uri` points to the image file included in the ZIP
- `creation_timestamp` is a Unix timestamp (seconds)
- `title` is the caption

### Limitations
- **Manual only** — no automation, no API, must be requested through the UI
- Meta takes 1–48 hours to prepare the export
- Image URLs in the export are relative paths to files in the ZIP, not CDN URLs; for a web gallery you must host them yourself
- Does not provide a delta/incremental update — you get a full dump each time

### Best use
Perfect for a **one-time backfill** of all historical posts. Parse with:
```python
import json, zipfile
from datetime import datetime

with zipfile.ZipFile("instagram-export.zip") as zf:
    posts_data = json.loads(zf.read("your_instagram_activity/content/posts_1.json"))
    for item in posts_data:
        for media in item.get("media", []):
            uri = media["uri"]                          # relative path inside zip
            ts = datetime.fromtimestamp(media["creation_timestamp"])
            caption = media.get("title", "")
            print(ts, caption, uri)
```

### Verdict
Excellent for initial seeding of your gallery data. Combine with Option 1 or 2 for ongoing deltas. Zero ToS risk, no ban risk, no technical fragility — just bureaucratic friction.

**Sources:** [Instagram export format (Pixelfed issue showing schema)](https://github.com/pixelfed/pixelfed/issues/4477), [Instagram data download guide](https://deciphertools.com/blog/how-to-export-instagram-data/), [DYI JSON structure gist](https://gist.github.com/90c01558ce1efe8a4961ca7cf3b5d09c)

---

## Option 5: Third-Party Hosted Scraping APIs (Apify, HikerAPI)

### Apify Instagram Post Scraper
- **Status:** Working in 2026. Handles proxies and rate limiting internally.
- **Data:** Returns captions, timestamps, image URLs, engagement metrics.
- **Pricing:** $1.00/1,000 posts (free plan); lower on paid tiers.
- **Automation:** Yes — schedule via Apify API or webhooks; Python/Node SDKs.
- **Rate limits:** Handled internally; uses 70M+ IP residential proxy pool.
- **ToS risk:** Moderate — Apify's own ToS prohibits violating third-party ToS, but enforcement falls on Apify's infrastructure, not your account. Your account is not directly touched.
- **Account ban risk:** Lower than self-operated scrapers; you provide an Instagram URL, not credentials.
- **Verdict:** Good option if you want zero infrastructure overhead and can afford ~$0.001/post. For a small portfolio (say 200 posts + 50 new/year), the cost is negligible ($0.20/full sync).
- **Source:** [Apify Instagram Post Scraper](https://apify.com/apify/instagram-post-scraper), [Best Instagram Scrapers 2026](https://brightdata.com/blog/web-data/best-instagram-scrapers)

### HikerAPI
- **Status:** Working in 2026. Managed REST wrapper around Instagram's private API.
- **Pricing:** $0.0006/request, 100 free requests for new users. For 1M requests: $600 (vs. $1,000+/month for competitors).
- **Data:** 100+ endpoints; profile, posts, reels, stories, comments.
- **Auth:** Simple API key (no Instagram credentials required on your end).
- **Automation:** Yes — standard REST calls.
- **Account ban risk:** None on your end; HikerAPI manages their own account/proxy infrastructure.
- **Verdict:** Excellent if you want the private API's breadth without the fragility. Cost for a portfolio with ~200 posts and monthly syncs is essentially $0.
- **Source:** [HikerAPI Best Instagram APIs 2026](https://hikerapi.com/help/best-instagram-api-for-developers-2026)

---

## Option 6: Instaloader 4.15.1 (CURRENTLY BROKEN)

### Status (June 2026)
**BROKEN for normal use.** Two active open GitHub issues:
- [Issue #2682](https://github.com/instaloader/instaloader/issues/2682) (March 2026): 403 Forbidden on `graphql/query` → throws `ProfileNotExistsException`. No fix, no assignees.
- [Issue #2695](https://github.com/instaloader/instaloader/issues/2695) (March 2026): 400 Bad Request "invalid request, execution error CRITICAL." Reportedly self-marked "solved" in thread but the 4.15.1 release (March 2024) predates these 2026 reports.

The root cause is Instagram's `doc_id` rotation for their GraphQL queries — these IDs change every 2–4 weeks and are hard-coded in instaloader. The 4.15.1 release migrated to new GraphQL endpoints but the 2026 reports suggest those endpoints have since been invalidated again.

### Known workarounds
- **Firefox cookie import script** (`615_import_firefox_session.py`): bypass instaloader's login procedure by importing your browser session. Documented at [Instaloader Troubleshooting](https://instaloader.github.io/troubleshooting.html). May help with auth issues but not with the underlying `doc_id` GraphQL breakage.
- **No working code-level workaround** for the 400/403 on GraphQL as of June 2026; no PR linked to fix it.
- If the project releases a 4.16 that reverses-engineers new `doc_id` values, it may work again.

### Verdict
Do not use until a new release fixes the GraphQL doc_id breakage. Monitor the repo for v4.16.

**Sources:** [instaloader #2682](https://github.com/instaloader/instaloader/issues/2682), [instaloader #2695](https://github.com/instaloader/instaloader/issues/2695), [instaloader troubleshooting docs](https://instaloader.github.io/troubleshooting.html)

---

## Rate Limiting & Blocking Mitigation (Cross-Option)

Applies to any private API / scraping approach (Options 2, 3):

| Technique | Effect |
|-----------|--------|
| Reuse saved session (never re-login each run) | Critical — fresh logins are high-signal suspicious |
| `delay_range = [2, 5]` between requests | Mimics human pacing |
| Consistent IP (no proxy rotation mid-session) | Instagram tracks IP consistency |
| 4G mobile residential proxies (if rotating is needed) | Highest trust level — shared by real mobile users |
| Exponential backoff on 429 | Required; tight retry loops cause escalating blocks |
| Run cron no more than 1–2x/day | Low request volume = low detection probability |
| Separate read-only session from any write-heavy automation | Read is safer than write; mixing elevates risk |
| Give account a 24h rest after hitting PleaseWaitFewMinutes | Continuing after this error is how bans happen |

**Sources:** [instagrapi Best Practices](https://subzeroid.github.io/instagrapi/usage-guide/best-practices.html), [Instagram Proxy Guide 2026](https://www.goproxy.com/blog/instagram-proxies-guide/), [Scrapfly 2026 scraping guide](https://scrapfly.io/blog/posts/how-to-scrape-instagram)

---

## Recommended Strategy for This Project

### Phase 1: Backfill (do now, no risk)
Use Instagram's **Download Your Information** export:
1. Instagram → Settings → Your Activity → Download Your Information
2. Choose JSON, select "Posts", all dates
3. Parse `posts_1.json` to extract `creation_timestamp`, `title` (caption), and `uri` (image path in ZIP)
4. Copy all images from the ZIP into the site's assets or an S3 bucket
5. Generate a `posts.json` file for the gallery

### Phase 2: Ongoing sync (automated, low-risk)
Set up the **Instagram Graph API**:
1. Convert `kristian.talley` to a Creator account (Instagram Settings → Account type and tools)
2. Create a Meta Developer app (developers.facebook.com)
3. Add Instagram product, link to a Facebook Page
4. In dev mode, generate a long-lived token for yourself (no app review needed for your own account)
5. Store the token encrypted (env var or secrets file, NOT git)
6. Write a `sync_instagram_api.py` script that calls `GET /me/media` and outputs `posts.json`
7. Set two crons:
   - `0 4 * * *` — daily media sync (pulls new posts since last run, using `since` pagination)
   - `0 0 15 * *` — monthly token refresh (call refresh endpoint, update stored token)

### If Graph API setup is too bureaucratic short-term
Fall back to **instagrapi** as a bridge solution while setting up Graph API:
- `pip install instagrapi`
- Use `sync_instagram.py` (already exists in this repo) with session file persistence
- Run cron every 6 hours max, with `delay_range = [2, 5]`
- Accept the ToS violation risk for the interim period

---

## Summary Table

| Option | Yields images+captions+timestamps? | Cron-automatable? | ToS compliant? | Ban risk | Cost | Setup effort |
|--------|-------------------------------------|-------------------|----------------|----------|------|--------------|
| Graph API (official) | Yes (CDN URLs + fields) | Yes | Yes | None | Free | Medium (1-2h) |
| instagrapi | Yes (full Media object) | Yes | No | Low-moderate | Free | Low (30min) |
| gallery-dl | Yes (files + sidecar JSON) | Semi (shell-based) | No | Low-moderate | Free | Low (30min) |
| DYI export | Yes (files in ZIP) | No (manual) | Yes | None | Free | Manual |
| Apify / HikerAPI | Yes | Yes | ToS-adjacent | None (for you) | Paid | Low |
| instaloader | BROKEN (403/400) | No | No | N/A | Free | N/A |

---

*Research conducted June 14, 2026. Instagram's private API landscape changes frequently; re-verify before implementing any unofficial option.*
