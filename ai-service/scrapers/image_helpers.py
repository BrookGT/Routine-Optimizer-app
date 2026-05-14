"""
image_helpers.py — Normalise, validate, and back-fill event image URLs.

Used by scrapers and scraper_manager so thumbnails map to real posters/banners
whenever the source exposes them (og:image, <img>, Telegram CDN, etc.).
"""

from __future__ import annotations

import json
import logging
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

PLACEHOLDER_SUBSTRINGS = (
    "placeholder",
    "avatar-default",
    "spacer.png",
    "blank.gif",
    "pixel.gif",
    "1x1",
    "transparent.gif",
    "lazy-load",
    "data:image/svg",
)

# Tiny decorative icons / sprites (common WP themes)
_MAX_PLACEHOLDER_SIDE_PX = 64


def sanitize_image_url(raw: str | None, base_url: str = "") -> str:
    """Return an absolute https URL safe for mobile clients, or ""."""
    if not raw or not isinstance(raw, str):
        return ""
    u = raw.strip().strip('"').strip("'")
    if not u or u.startswith("data:"):
        return ""
    if u.startswith("//"):
        u = "https:" + u
    elif u.startswith("/") and base_url:
        u = urljoin(base_url.rstrip("/") + "/", u.lstrip("/"))
    elif not u.startswith("http"):
        if base_url:
            u = urljoin(base_url.rstrip("/") + "/", u)
        else:
            return ""
    parsed = urlparse(u)
    if parsed.scheme == "http":
        u = "https://" + u[7:]
    elif parsed.scheme != "https":
        return ""
    if is_placeholder_image_url(u):
        return ""
    return u


def is_placeholder_image_url(url: str) -> bool:
    if not url:
        return True
    low = url.lower()
    return any(s in low for s in PLACEHOLDER_SUBSTRINGS)


def is_usable_event_image(url: str | None) -> bool:
    """True if we should treat *url* as a real event thumbnail."""
    if not url or not isinstance(url, str):
        return False
    u = url.strip()
    if len(u) < 12:
        return False
    if not u.startswith("https://"):
        return False
    if is_placeholder_image_url(u):
        return False
    return True


def _parse_srcset_best(srcset: str, base_url: str) -> str:
    """Pick the widest candidate from a srcset string."""
    if not srcset:
        return ""
    best_url = ""
    best_w = -1
    for part in srcset.split(","):
        chunk = part.strip().split()
        if not chunk:
            continue
        cand = chunk[0]
        w = 0
        if len(chunk) > 1 and chunk[1].endswith("w"):
            try:
                w = int(chunk[1][:-1])
            except ValueError:
                w = 0
        if w >= best_w:
            best_w = w
            best_url = cand
    return sanitize_image_url(best_url, base_url)


def extract_image_from_img_tag(img_el, base_url: str = "") -> str:
    """Prefer srcset → data-src → src on a BeautifulSoup img element."""
    if not img_el:
        return ""
    for attr in ("srcset", "data-srcset"):
        raw = img_el.get(attr) or ""
        u = _parse_srcset_best(raw, base_url)
        if u:
            return u
    for attr in ("data-src", "data-lazy-src", "data-original", "src"):
        u = sanitize_image_url(img_el.get(attr) or "", base_url)
        if u:
            return u
    return ""


def _dims_from_attrs(img_el) -> tuple[int, int]:
    w = img_el.get("width") or ""
    h = img_el.get("height") or ""
    try:
        wi = int(str(w).replace("px", ""))
    except (ValueError, TypeError):
        wi = 9999
    try:
        hi = int(str(h).replace("px", ""))
    except (ValueError, TypeError):
        hi = 9999
    return wi, hi


def pick_best_image_from_container(container, base_url: str = "") -> str:
    """
    Scan <img> nodes inside *container*; skip obvious icons/spacers.
    """
    if not container:
        return ""
    best = ""
    best_score = -1
    for img in container.select("img"):
        url = extract_image_from_img_tag(img, base_url)
        if not url:
            continue
        w, h = _dims_from_attrs(img)
        if w > 0 and w <= _MAX_PLACEHOLDER_SIDE_PX and h > 0 and h <= _MAX_PLACEHOLDER_SIDE_PX:
            continue
        score = max(w, h, len(url))
        if score > best_score:
            best_score = score
            best = url
    return best


def fetch_og_image(page_url: str, headers: dict, timeout: float = 9.0) -> str:
    """
    GET *page_url* and return og:image / twitter:image / first large img.
    """
    if not page_url or not page_url.startswith("http"):
        return ""
    try:
        resp = requests.get(page_url, headers=headers, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.debug("[image] og fetch failed %s: %s", page_url, exc)
        return ""

    ctype = (resp.headers.get("Content-Type") or "").lower()
    if "html" not in ctype and "xml" not in ctype:
        return ""

    soup = BeautifulSoup(resp.text, "html.parser")
    base = f"{urlparse(page_url).scheme}://{urlparse(page_url).netloc}"

    for prop in ("og:image", "og:image:url", "twitter:image"):
        tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
        if tag and tag.get("content"):
            u = sanitize_image_url(tag["content"], base)
            if is_usable_event_image(u):
                return u

    # JSON-LD Event image
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                if item.get("@type") == "Event":
                    img = item.get("image", "")
                    if isinstance(img, list) and img:
                        img = img[0]
                    if isinstance(img, str):
                        u = sanitize_image_url(img, base)
                        if is_usable_event_image(u):
                            return u
        except (json.JSONDecodeError, TypeError, AttributeError):
            continue

    u = pick_best_image_from_container(soup.body or soup, page_url)
    return u if is_usable_event_image(u) else ""
