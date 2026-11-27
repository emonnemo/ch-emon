from __future__ import annotations

import os
import re
import tempfile
from dataclasses import dataclass
from typing import Iterable

import fitz  # PyMuPDF
from bs4 import BeautifulSoup
from ebooklib import ITEM_DOCUMENT, epub


class DocumentParseError(Exception):
    """Raised when an uploaded PDF, EPUB, or TXT cannot be parsed into readable text."""


@dataclass(slots=True)
class ParsedChapter:
    title: str | None
    paragraphs: list[str]


@dataclass(slots=True)
class ParsedBook:
    title: str | None
    chapters: list[ParsedChapter]


_PAGE_NUM_RE = re.compile(r"^[\s\-—–·•]*(?:第\s*\d+\s*[页頁]|\d{1,5})[\s\-—–·•]*$")
_CJK_CHAR_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]")
_SENTENCE_END_RE = re.compile(r"[。！？!?…\"”’》）】]$")
_ASCII_WORD_RE = re.compile(r"[A-Za-z0-9]")


def _clean_pdf_block(raw_block: str) -> list[str]:
    """Repair Chinese PDF hard line wraps inside a layout block while preserving real paragraphs."""
    lines = [line.rstrip() for line in raw_block.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    lines = [line for line in lines if line.strip() and not _PAGE_NUM_RE.match(line.strip())]
    if not lines:
        return []

    paragraphs: list[str] = []
    buf = ""

    for line in lines:
        has_indent = line.startswith("\u3000\u3000") or line.startswith("    ")
        stripped = line.strip()
        if not stripped:
            continue

        if not buf:
            buf = stripped
            continue

        # Start a new paragraph if the next line is explicitly indented after sentence end
        if has_indent and _SENTENCE_END_RE.search(buf):
            paragraphs.append(buf)
            buf = stripped
            continue

        prev_char = buf[-1]
        next_char = stripped[0]

        # Rejoin CJK lines seamlessly without inserting spaces; keep space between ASCII words
        if _CJK_CHAR_RE.match(prev_char) or _CJK_CHAR_RE.match(next_char):
            buf += stripped
        elif _ASCII_WORD_RE.match(prev_char) and _ASCII_WORD_RE.match(next_char):
            buf += " " + stripped
        else:
            buf += stripped

    if buf:
        paragraphs.append(buf)
    return paragraphs


def _extract_pdf_page_paragraphs(page: fitz.Page) -> list[str]:
    blocks = page.get_text("blocks")
    # Sort top-to-bottom, left-to-right
    text_blocks = [b for b in blocks if len(b) >= 7 and b[6] == 0]
    text_blocks.sort(key=lambda b: (round(b[1], 1), round(b[0], 1)))

    paragraphs: list[str] = []
    for block in text_blocks:
        raw = str(block[4])
        paragraphs.extend(_clean_pdf_block(raw))
    return paragraphs


def parse_pdf(data: bytes) -> ParsedBook:
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise DocumentParseError("Could not open PDF file. It may be corrupted or encrypted.") from exc

    try:
        if doc.is_encrypted:
            raise DocumentParseError("Password-protected PDFs are not supported.")

        meta_title = (doc.metadata or {}).get("title")
        meta_title = meta_title.strip() if isinstance(meta_title, str) and meta_title.strip() else None
        num_pages = doc.page_count
        if num_pages == 0:
            raise DocumentParseError("PDF has no pages.")

        # Check for a usable Table of Contents
        raw_toc = doc.get_toc(simple=True) or []
        toc_entries: list[tuple[str, int]] = []
        seen_pages: set[int] = set()
        for entry in raw_toc:
            if len(entry) < 3:
                continue
            level, title, page_1based = entry[0], str(entry[1]).strip(), int(entry[2])
            if level <= 2 and title and 1 <= page_1based <= num_pages and page_1based not in seen_pages:
                toc_entries.append((title, page_1based - 1))
                seen_pages.add(page_1based)

        chapters: list[ParsedChapter] = []

        if len(toc_entries) >= 2:
            toc_entries.sort(key=lambda item: item[1])
            # Capture front matter before first TOC chapter if any
            if toc_entries[0][1] > 0:
                front_paras: list[str] = []
                for p_idx in range(0, toc_entries[0][1]):
                    front_paras.extend(_extract_pdf_page_paragraphs(doc.load_page(p_idx)))
                if front_paras:
                    chapters.append(ParsedChapter(title="Front Matter", paragraphs=front_paras))

            for idx, (chap_title, start_page) in enumerate(toc_entries):
                end_page = toc_entries[idx + 1][1] if idx + 1 < len(toc_entries) else num_pages
                chap_paras: list[str] = []
                for p_idx in range(start_page, end_page):
                    chap_paras.extend(_extract_pdf_page_paragraphs(doc.load_page(p_idx)))
                if chap_paras:
                    chapters.append(ParsedChapter(title=chap_title, paragraphs=chap_paras))
        else:
            # No TOC: group pages into readable sections (~1,200 chars each) with page labels
            current_paras: list[str] = []
            current_chars = 0
            start_page_1based = 1

            for p_idx in range(num_pages):
                page_paras = _extract_pdf_page_paragraphs(doc.load_page(p_idx))
                if not page_paras:
                    continue
                page_len = sum(len(p) for p in page_paras)
                if current_paras and current_chars + page_len > 1400:
                    end_page_1based = p_idx
                    label = (
                        f"Page {start_page_1based}"
                        if start_page_1based == end_page_1based
                        else f"Pages {start_page_1based}–{end_page_1based}"
                    )
                    chapters.append(ParsedChapter(title=label, paragraphs=current_paras))
                    current_paras = list(page_paras)
                    current_chars = page_len
                    start_page_1based = p_idx + 1
                else:
                    if not current_paras:
                        start_page_1based = p_idx + 1
                    current_paras.extend(page_paras)
                    current_chars += page_len

            if current_paras:
                label = (
                    f"Page {start_page_1based}"
                    if start_page_1based == num_pages
                    else f"Pages {start_page_1based}–{num_pages}"
                )
                chapters.append(ParsedChapter(title=label, paragraphs=current_paras))

        total_text_len = sum(len(p) for ch in chapters for p in ch.paragraphs)
        if total_text_len < 5:
            raise DocumentParseError(
                "No selectable text was found in this PDF. Scanned or image-only PDFs are not supported yet."
            )

        return ParsedBook(title=meta_title, chapters=chapters)
    finally:
        doc.close()


def _collect_epub_toc(toc_items: Iterable, mapping: dict[str, str]) -> None:
    for item in toc_items:
        if isinstance(item, tuple) and len(item) == 2:
            section, children = item
            href = getattr(section, "href", None)
            title = getattr(section, "title", None)
            if href and title:
                base_href = href.split("#")[0].lstrip("./")
                mapping.setdefault(base_href, str(title).strip())
            if children:
                _collect_epub_toc(children, mapping)
        else:
            href = getattr(item, "href", None)
            title = getattr(item, "title", None)
            if href and title:
                base_href = href.split("#")[0].lstrip("./")
                mapping.setdefault(base_href, str(title).strip())


def _extract_html_chapter(html_bytes: bytes, fallback_title: str | None) -> tuple[str | None, list[str]]:
    soup = BeautifulSoup(html_bytes, "html.parser")

    # Strip non-body / ruby annotation tags to prevent duplicate pinyin/furigana text
    for tag in soup(["script", "style", "rt", "rp", "nav"]):
        tag.decompose()

    heading_title: str | None = None
    for h_tag in ("h1", "h2", "h3"):
        found = soup.find(h_tag)
        if found:
            text = found.get_text(" ", strip=True)
            if text:
                heading_title = text
                break

    title = fallback_title or heading_title
    body = soup.body or soup

    paragraphs: list[str] = []
    block_tags = body.find_all(["h1", "h2", "h3", "h4", "p", "li", "blockquote"])
    for tag in block_tags:
        # Skip outer blocks that wrap inner <p> tags
        if tag.name == "blockquote" and tag.find("p"):
            continue
        text = re.sub(r"\s+", " ", tag.get_text("", strip=True)).strip()
        if text:
            paragraphs.append(text)

    if not paragraphs:
        # Fallback for simple <div>/<br> EPUB markup
        raw = body.get_text("\n")
        paragraphs = [line.strip() for line in raw.splitlines() if line.strip()]

    return title, paragraphs


def parse_epub(data: bytes) -> ParsedBook:
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".epub", delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        try:
            book = epub.read_epub(tmp_path)
        except Exception as exc:
            raise DocumentParseError("Could not open EPUB file. It may be corrupted.") from exc

        meta_titles = book.get_metadata("DC", "title")
        meta_title = (
            str(meta_titles[0][0]).strip()
            if meta_titles and meta_titles[0] and str(meta_titles[0][0]).strip()
            else None
        )

        toc_map: dict[str, str] = {}
        if book.toc:
            _collect_epub_toc(book.toc, toc_map)

        # Follow spine order first so chapters stay in exact reading order
        ordered_items = []
        seen_ids: set[str] = set()
        for spine_entry in book.spine:
            item_id = spine_entry[0] if isinstance(spine_entry, tuple) else spine_entry
            item = book.get_item_with_id(item_id)
            if item and item.get_type() == ITEM_DOCUMENT:
                ordered_items.append(item)
                seen_ids.add(item_id)

        # Fallback if spine was empty
        if not ordered_items:
            ordered_items = list(book.get_items_of_type(ITEM_DOCUMENT))

        chapters: list[ParsedChapter] = []
        for idx, item in enumerate(ordered_items):
            item_name = (item.get_name() or "").lstrip("./")
            toc_title = toc_map.get(item_name) or toc_map.get(os.path.basename(item_name))
            chap_title, paragraphs = _extract_html_chapter(item.get_content(), toc_title)
            if not paragraphs:
                continue
            chapters.append(
                ParsedChapter(
                    title=chap_title or f"Chapter {len(chapters) + 1}",
                    paragraphs=paragraphs,
                )
            )

        total_text_len = sum(len(p) for ch in chapters for p in ch.paragraphs)
        if total_text_len < 5:
            raise DocumentParseError("No readable text was found in this EPUB file.")

        return ParsedBook(title=meta_title, chapters=chapters)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def parse_txt(data: bytes) -> ParsedBook:
    decoded: str | None = None
    for encoding in ("utf-8-sig", "utf-8", "gb18030", "utf-16"):
        try:
            decoded = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if decoded is None:
        raise DocumentParseError("Could not decode text file. Please save as UTF-8 or GB18030.")

    paragraphs = [p.strip() for p in decoded.replace("\r\n", "\n").replace("\r", "\n").split("\n") if p.strip()]
    if not paragraphs:
        raise DocumentParseError("Uploaded text file is empty.")

    return ParsedBook(title=None, chapters=[ParsedChapter(title=None, paragraphs=paragraphs)])
