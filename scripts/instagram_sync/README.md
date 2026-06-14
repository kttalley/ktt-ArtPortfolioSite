# Instagram Sync Service

Automatically fetches posts from the `kristian.talley` Instagram profile and integrates them into the art portfolio.

## Setup

### 1. Run the setup script

```bash
cd scripts/instagram_sync
chmod +x setup.sh
./setup.sh
```

This will:
- Create a Python virtual environment
- Install dependencies (instaloader)
- Create the `public/instagram/` directory
- Create the placeholder `instagramImages.js` file

### 2. Authentication (required)

Instagram blocks all anonymous scraping (403/400), so a logged-in session is
required. Two ways to provide one — pick whichever fits the machine:

**A. Browser cookies (run on a machine with the browser + IG login):**

```bash
python sync_instagram.py --load-cookies chrome --limit 5
# also: --load-cookies firefox | chromium
```

Requires `browser_cookie3` (installed via requirements.txt). It reads and
decrypts the Instagram session from your browser. Close the browser first if
the cookie DB is locked.

**B. Raw sessionid (works anywhere, e.g. a headless server):**

In your browser, log into instagram.com → DevTools (F12) → Application →
Cookies → `https://www.instagram.com` → copy the `sessionid` value, then:

```bash
IG_SESSIONID='<paste-value>' python sync_instagram.py --limit 5
```

> **Important — datacenter IPs are blocked.** Even with a valid login,
> Instagram returns `403 Forbidden` on the posts GraphQL query from
> datacenter/VPS IPs. Run the sync from a residential connection (e.g. your
> laptop). Authentication will still *succeed* on a server, but fetching posts
> will 400/403.

The first successful auth saves a reusable session to `.ig_session`
(gitignored), so later runs don't need cookies/sessionid again.

### 3. Full sync

```bash
python sync_instagram.py  # Fetch all posts (uses saved session)
```

## Cron Job Setup

To run weekly on your nginx server:

```bash
crontab -e
```

Add this line (runs every Sunday at 3am):

```
0 3 * * 0 cd /var/www/art-portfolio/scripts/instagram_sync && ./venv/bin/python sync_instagram.py >> /var/log/instagram-sync.log 2>&1
```

## How It Works

1. **Fetches** posts from the public Instagram profile using Instaloader
2. **Downloads** images to `public/instagram/`
3. **Tracks** downloaded posts in `.sync_manifest.json` to avoid re-downloading
4. **Generates** `src/data/instagramImages.js` in the same format as tumblrImages.js

## File Structure

```
scripts/instagram_sync/
├── sync_instagram.py    # Main sync script
├── requirements.txt     # Python dependencies
├── setup.sh             # Setup script
├── README.md            # This file
└── venv/                # Python virtual environment (created by setup)

public/instagram/
├── .sync_manifest.json  # Tracks downloaded posts
└── *.jpg                # Downloaded images

src/data/
└── instagramImages.js   # Auto-generated image list
```

## Configuration

Edit `sync_instagram.py` to change:
- `INSTAGRAM_USERNAME` - The profile to fetch from
- Other paths if your project structure differs

## Rate Limiting

Instagram has rate limits. Instaloader handles this automatically, but:
- Don't run too frequently (weekly is fine)
- If you get blocked, wait a few hours and try again
- Consider using `--limit` for initial testing

## Troubleshooting

**"Error fetching profile"**
- Make sure the profile is public
- Check your internet connection
- Instagram may be rate limiting - wait and try later

**Missing images**
- Check `public/instagram/` for downloaded files
- Check `.sync_manifest.json` for tracking data
- Run with `--limit 1` to test a single post

**Build issues**
- After syncing, you may need to rebuild the static site
- Run `npm run build` after sync if hosting statically
