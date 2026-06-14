#!/usr/bin/env python3
"""
Instagram "Download Your Information" (DYI) importer
====================================================

Reliable, no-scraping backfill: takes Instagram's official data export and
turns it into the portfolio's instagramImages.js + copies the photos into
public/instagram/. No API calls, no rate limits, includes real captions/dates.

How to get the export:
  Instagram -> Settings -> Accounts Center -> Your information and permissions
  -> Download your information -> select Posts -> FORMAT: JSON, quality: High.
  You'll receive a .zip by email.

Usage:
  python import_export.py --export ~/Downloads/instagram-export.zip
  python import_export.py --export ~/Downloads/instagram-kristian/   # already unzipped
  python import_export.py --export <path> --carousel first   # one image per post

Output (same shape as sync_instagram_api.py, consumed by src/data/artworks.js):
  public/instagram/<file>.jpg ...
  src/data/instagramImages.js  -> [{ id, src, title, date, alt }, ...]
"""

import os
import sys
import json
import shutil
import zipfile
import argparse
import tempfile
from pathlib import Path
from datetime import datetime, timezone

PROJECT_ROOT = Path(__file__).parent.parent.parent
PUBLIC_DIR = PROJECT_ROOT / "public" / "instagram"
DATA_FILE = PROJECT_ROOT / "src" / "data" / "instagramImages.js"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
VIDEO_EXTS = {".mp4", ".mov", ".gif"}


def fix_mojibake(s):
    """Instagram exports JSON as UTF-8 bytes mis-decoded as latin-1. Repair it."""
    if not s:
        return s
    try:
        return s.encode("latin1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def find_export_root(path):
    """Return a directory containing the unzipped export (extract zip if needed)."""
    p = Path(path).expanduser()
    if p.is_dir():
        return p, None
    if p.is_file() and p.suffix.lower() == ".zip":
        tmp = Path(tempfile.mkdtemp(prefix="ig_export_"))
        with zipfile.ZipFile(p) as z:
            z.extractall(tmp)
        return tmp, tmp
    raise SystemExit(f"--export must be a .zip or a directory: {path}")


def find_posts_json(root):
    """Locate posts_*.json files in the export (path varies by export version)."""
    matches = sorted(root.rglob("posts_*.json"))
    # Some exports name it content/posts.json
    matches += sorted(root.rglob("posts.json"))
    # De-dupe, keep ones under a 'content' or 'posts' dir first
    seen, ordered = set(), []
    for m in matches:
        if m in seen:
            continue
        seen.add(m)
        ordered.append(m)
    return ordered


def load_posts(posts_file):
    """Yield normalized posts: {timestamp:int|None, caption:str, media:[Path-relative-uris]}."""
    data = json.loads(posts_file.read_text(encoding="utf-8"))
    # Export is usually a top-level list; sometimes wrapped in a dict.
    if isinstance(data, dict):
        for key in ("ig_posts", "posts", "media", "ig_profile_picture"):
            if key in data and isinstance(data[key], list):
                data = data[key]
                break
        else:
            data = [data]
    for post in data:
        if not isinstance(post, dict):
            continue
        media_list = post.get("media") or []
        if isinstance(media_list, dict):
            media_list = [media_list]
        post_caption = fix_mojibake(post.get("title") or "")
        post_ts = post.get("creation_timestamp")
        uris = []
        caption = post_caption
        ts = post_ts
        for m in media_list:
            if not isinstance(m, dict):
                continue
            uri = m.get("uri")
            if not uri:
                continue
            uris.append(uri)
            # Per-media caption/timestamp fallback (single-image posts use these).
            if not caption:
                caption = fix_mojibake(m.get("title") or "")
            if ts is None:
                ts = m.get("creation_timestamp")
        if uris:
            yield {"timestamp": ts, "caption": caption, "uris": uris}


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
        "// Auto-generated Instagram images list (from official data export)",
        "// Last updated: " + datetime.now().isoformat(),
        "const instagramImages = [",
    ]
    for e in entries:
        lines.append(
            "  {{ id: '{id}', src: '{src}', title: '{title}', date: '{date}', alt: '{alt}' }},".format(
                id=e["id"],
                src=e["src"],
                title=js_escape(e["title"]),
                date=e["date"],
                alt=js_escape(e["alt"]),
            )
        )
    lines += ["];", "", "export default instagramImages;"]
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run(args):
    root, cleanup = find_export_root(args.export)
    try:
        posts_files = find_posts_json(root)
        if not posts_files:
            raise SystemExit(
                f"No posts_*.json found under {root}. Make sure you exported in "
                f"JSON format and selected 'Posts'."
            )
        print(f"Found {len(posts_files)} posts file(s): {[p.name for p in posts_files]}")

        PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
        entries = []
        used_names = set()
        copied, skipped_video, missing = 0, 0, 0

        all_posts = []
        for pf in posts_files:
            all_posts.extend(load_posts(pf))
        print(f"Parsed {len(all_posts)} posts.")

        for post in all_posts:
            ts = post["timestamp"]
            date_iso = (
                datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else ""
            )
            nice_date = (
                datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%B %Y")
                if ts
                else ""
            )
            caption = post["caption"] or ""
            first_line = caption.splitlines()[0] if caption else ""
            title = (first_line[:80] or f"Instagram post — {nice_date}").strip()
            alt = (caption[:150] or f"Instagram post from {nice_date}").replace("\n", " ")

            uris = post["uris"]
            if args.carousel == "first":
                uris = uris[:1]

            for uri in uris:
                src_path = (root / uri)
                if not src_path.exists():
                    # try resolving relative to each posts file's parent
                    alt_path = next(root.rglob(Path(uri).name), None)
                    if alt_path is None:
                        missing += 1
                        continue
                    src_path = alt_path
                ext = src_path.suffix.lower()
                if ext in VIDEO_EXTS:
                    skipped_video += 1
                    continue
                if ext not in IMAGE_EXTS:
                    continue

                base = src_path.name
                if base in used_names:
                    stem = src_path.stem
                    base = f"{stem}_{copied}{ext}"
                used_names.add(base)

                dest = PUBLIC_DIR / base
                if not dest.exists():
                    shutil.copy2(src_path, dest)
                copied += 1

                entries.append(
                    {
                        "id": f"insta_{src_path.stem}",
                        "src": f"/instagram/{base}",
                        "title": title,
                        "date": date_iso,
                        "alt": alt,
                    }
                )

        # Newest first.
        entries.sort(key=lambda x: x["date"], reverse=True)
        generate_js(entries)

        print(
            f"\nImport complete: {copied} images copied, "
            f"{skipped_video} videos skipped, {missing} media files missing."
        )
        print(f"Wrote {len(entries)} entries to {DATA_FILE}")
        print("Next: npm run build, then redeploy dist/.")
    finally:
        if cleanup:
            shutil.rmtree(cleanup, ignore_errors=True)


def main():
    p = argparse.ArgumentParser(description="Import Instagram DYI export into the portfolio")
    p.add_argument("--export", required=True, help="Path to the export .zip or unzipped folder")
    p.add_argument(
        "--carousel",
        choices=["all", "first"],
        default="all",
        help="For multi-image posts: import all images (default) or just the first",
    )
    run(p.parse_args())


if __name__ == "__main__":
    main()
