#!/usr/bin/env python3
"""
Instagram HTML "Download Your Information" importer
===================================================

Newer Instagram exports ship posts as HTML (your_instagram_activity/media/
posts_1.html) rather than JSON, so import_export.py (JSON-only) can't read
them. This parses the HTML export, extracts each post's caption / date /
images (including carousels), copies the photos into public/instagram/, and
generates src/data/instagramImages.js.

Each generated entry carries a full `images` array so the detail page can show
a horizontal carousel for multi-image posts; `src` is the cover (first image)
used by the masonry gallery.

Usage:
  python import_html_export.py --export ~/instagram-export.zip
  python import_html_export.py --export <zip-or-dir> --since-year 2017
"""

import os
import re
import sys
import html
import shutil
import zipfile
import argparse
import tempfile
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).parent.parent.parent
PUBLIC_DIR = PROJECT_ROOT / "public" / "instagram"
DATA_FILE = PROJECT_ROOT / "src" / "data" / "instagramImages.js"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# Posts to drop entirely (e.g. visual duplicates of the tumblr archive).
EXCLUDE_IDS = {
    "insta_17892453058036817",  # Telluric bronze — already in tumblr archive (Telluric II/III)
    # Removed per request (2026-06-14): off-topic / non-portfolio posts
    "insta_17986719011341690",
    "insta_18198620671054164",
    "insta_17964449131937599",
    "insta_18298653379033150",
    "insta_18228791221187546",
    "insta_17973872086560301",
    "insta_18105512272241429",
    "insta_18133189771160085",
    "insta_18104283004144404",
    "insta_17862656263924791",
    "insta_17911093822447379",
    "insta_17877205615648040",
    "insta_18013370692207429",
    "insta_17953742893256125",
    "insta_17944887547233735",
    "insta_18001550812119455",
    "insta_17923359106207200",
    "insta_17958890398046121",
    "insta_17943822766097238",
    "insta_17925857338148034",
    "insta_17889084625208059",
    "insta_17939249482022669",
    "insta_17923500121051724",
    "insta_17918886022084977",
    "insta_17931427750053682",
    "insta_17888670352140713",
    "insta_17917184635047763",
    "insta_17884972927139535",
    "insta_17884419346172162",
    "insta_17882567776170235",
    "insta_17893975075128036",
    "insta_17905787680020406",
    "insta_17878749097144164",
    "insta_17887556329125449",
    "insta_17875453288135425",
    "insta_17877734605061575",
    "insta_17885768482042346",
    "insta_17861980111090478",
    "insta_17853163843192290",
    "insta_17868559633018516",
}

# Per-post medium tags (id -> list). Posts not listed default to illustration.
MEDIUM_OVERRIDES = {
    "insta_17948902018825847": ["painting"],     # sunburnt wook in parking lot (acrylic on canvas)
    "insta_18007065539065349": ["illustration"], # oracle
}

# For-sale posts -> store URL. Surfaces an "Available for purchase" CTA that
# links to the store. Items without their own product page point at the store
# home as a placeholder until a product is created for them.
STORE_BASE = "https://store.kristiantalley.com"
STORE_LINKS = {
    "insta_17951063642001027": f"{STORE_BASE}/pyromancer",                     # paranoid pyromancer
    "insta_17948902018825847": f"{STORE_BASE}/sunburnt-wook-in-parking-lot",   # sunburnt wook
    "insta_18007065539065349": f"{STORE_BASE}/oracle",                         # oracle
    "insta_17938219943116048": f"{STORE_BASE}/panoptic-serpent-coaster",       # panoptic beer stain
}

POST_DELIM = '<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder">'
DATE_RE = re.compile(r'<div class="_3-94 _a6-o">([^<]+)</div>')
IMG_RE = re.compile(r'href="(media/(?:posts|other)/[^"]+)"')
H2_RE = re.compile(r"<h2[^>]*>(.*?)</h2>", re.S)
TAG_RE = re.compile(r"<[^>]+>")


def parse_date(s):
    for fmt in ("%b %d, %Y %I:%M %p", "%b %d, %Y"):
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            pass
    return None


def clean_text(raw_html):
    """Strip tags, unescape entities (e.g. &#064; -> @), collapse whitespace."""
    txt = html.unescape(TAG_RE.sub("", raw_html or ""))
    return txt.strip()


def find_export_root(path):
    p = Path(path).expanduser()
    if p.is_dir():
        return p, None
    if p.is_file() and p.suffix.lower() == ".zip":
        tmp = Path(tempfile.mkdtemp(prefix="ig_html_export_"))
        with zipfile.ZipFile(p) as z:
            z.extractall(tmp)
        return tmp, tmp
    raise SystemExit(f"--export must be a .zip or a directory: {path}")


def find_posts_html(root):
    matches = sorted(root.rglob("posts_*.html"))
    return [m for m in matches if re.search(r"posts_\d+\.html$", m.name)]


def parse_posts(html_text):
    """Yield {dt, caption, images:[relpath]} for each post block."""
    for block in html_text.split(POST_DELIM)[1:]:
        imgs = IMG_RE.findall(block)
        dates = DATE_RE.findall(block)
        dt = parse_date(dates[-1]) if dates else None
        h2 = H2_RE.findall(block)
        caption = clean_text(h2[0]) if h2 else ""
        yield {"dt": dt, "caption": caption, "images": imgs}


def js_escape(s):
    return (
        s.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\n", " ")
        .replace("\r", " ")
        .strip()
    )


def generate_js(entries):
    lines = [
        "// Auto-generated Instagram images list (from official HTML data export)",
        "// Last updated: " + datetime.now().isoformat(),
        "// Each entry's `images` array holds the full carousel; `src` is the cover.",
        "const instagramImages = [",
    ]
    for e in entries:
        imgs = ", ".join(f"'{i}'" for i in e["images"])
        lines.append("  {")
        lines.append(f"    id: '{e['id']}',")
        lines.append(f"    src: '{e['src']}',")
        lines.append(f"    images: [{imgs}],")
        lines.append(f"    title: '{js_escape(e['title'])}',")
        lines.append(f"    description: '{js_escape(e['description'])}',")
        lines.append(f"    date: '{js_escape(e['date'])}',")
        lines.append(f"    alt: '{js_escape(e['alt'])}',")
        if e.get("mediums"):
            meds = ", ".join(f"'{m}'" for m in e["mediums"])
            lines.append(f"    mediums: [{meds}],")
        if e.get("storeUrl"):
            lines.append(f"    storeUrl: '{js_escape(e['storeUrl'])}',")
        lines.append("  },")
    lines += ["];", "", "export default instagramImages;"]
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run(args):
    root, cleanup = find_export_root(args.export)
    try:
        html_files = find_posts_html(root)
        if not html_files:
            raise SystemExit(f"No posts_*.html found under {root}.")
        print(f"Found posts HTML: {[p.name for p in html_files]}")

        posts = []
        for hf in html_files:
            posts.extend(parse_posts(hf.read_text(encoding="utf-8", errors="replace")))
        print(f"Parsed {len(posts)} post blocks.")

        PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
        entries = []
        copied = skipped_video_only = filtered_old = 0

        for post in posts:
            dt = post["dt"]
            if dt is None or dt.year < args.since_year:
                if dt and dt.year < args.since_year:
                    filtered_old += 1
                continue

            pics = [i for i in post["images"] if Path(i).suffix.lower() in IMAGE_EXTS]
            if not pics:
                skipped_video_only += 1
                continue

            # Resolve identity and skip excluded posts BEFORE copying any images,
            # so excluded posts leave no orphaned files in public/instagram/.
            post_id = f"insta_{Path(pics[0]).stem}"
            if post_id in EXCLUDE_IDS:
                continue

            web_paths = []
            for rel in pics:
                src_path = root / rel
                if not src_path.exists():
                    found = next(root.rglob(Path(rel).name), None)
                    if found is None:
                        continue
                    src_path = found
                base = src_path.name
                dest = PUBLIC_DIR / base
                if not dest.exists():
                    shutil.copy2(src_path, dest)
                    copied += 1
                web_paths.append(f"/instagram/{base}")

            if not web_paths:
                continue

            caption = post["caption"]
            # Silent / no-caption posts get a clean "Untitled" rather than a
            # generic "Instagram post — <month>" placeholder.
            first_line = caption.splitlines()[0] if caption else ""
            title = first_line[:80].strip() or "Untitled"
            alt = (caption[:150] or "Untitled").replace("\n", " ")

            entry = {
                "id": post_id,
                "src": web_paths[0],
                "images": web_paths,
                "title": title,
                "description": caption,  # empty string for silent posts
                "date": dt.strftime("%B %d, %Y"),
                "alt": alt,
                "_ts": dt,
            }
            if post_id in MEDIUM_OVERRIDES:
                entry["mediums"] = MEDIUM_OVERRIDES[post_id]
            if post_id in STORE_LINKS:
                entry["storeUrl"] = STORE_LINKS[post_id]
            entries.append(entry)

        entries.sort(key=lambda e: e["_ts"], reverse=True)
        for e in entries:
            del e["_ts"]
        generate_js(entries)

        carousels = sum(1 for e in entries if len(e["images"]) > 1)
        print(
            f"\nImport complete: {len(entries)} posts "
            f"({carousels} carousels), {copied} new images copied."
        )
        print(f"Skipped {skipped_video_only} video-only posts, "
              f"filtered {filtered_old} posts before {args.since_year}.")
        print(f"Wrote {DATA_FILE}")
    finally:
        if cleanup:
            shutil.rmtree(cleanup, ignore_errors=True)


def main():
    p = argparse.ArgumentParser(description="Import Instagram HTML export into the portfolio")
    p.add_argument("--export", required=True, help="Path to export .zip or unzipped folder")
    p.add_argument("--since-year", type=int, default=2017, help="Only import posts from this year onward")
    run(p.parse_args())


if __name__ == "__main__":
    main()
