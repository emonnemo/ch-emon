from __future__ import annotations

import re
import threading
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import jieba
from pypinyin import Style, pinyin as get_pinyin
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.dictionary import DictionaryEntry
from app.services.pinyin_utils import normalize_pinyin_key

# Contiguous CJK Unified Ideographs (+ Extension A)
_HANZI_SPLIT_RE = re.compile(r"([\u4e00-\u9fff\u3400-\u4dbf]+)")
_HANZI_CHAR_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[。！？!?])")


@dataclass(slots=True)
class DictMeta:
    id: int
    pinyin_marks: str
    pinyin_key: str
    is_proper_noun: bool


class ChineseAnnotator:
    """Thread-safe local Chinese word segmenter, context-aware pinyin, and CC-CEDICT annotator."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = False
        self._dict_by_simplified: dict[str, list[DictMeta]] = {}

    def ensure_loaded(self, db: Session, *, force_reload: bool = False) -> None:
        if self._loaded and not force_reload:
            return
        with self._lock:
            if self._loaded and not force_reload:
                return

            rows = db.execute(
                select(
                    DictionaryEntry.id,
                    DictionaryEntry.simplified,
                    DictionaryEntry.pinyin_marks,
                    DictionaryEntry.is_proper_noun,
                ).order_by(
                    DictionaryEntry.is_proper_noun.asc(),
                    DictionaryEntry.id.asc(),
                )
            ).all()

            mapping: dict[str, list[DictMeta]] = {}
            for entry_id, simplified, pinyin_marks, is_proper_noun in rows:
                meta = DictMeta(
                    id=entry_id,
                    pinyin_marks=pinyin_marks,
                    pinyin_key=normalize_pinyin_key(pinyin_marks),
                    is_proper_noun=is_proper_noun,
                )
                mapping.setdefault(simplified, []).append(meta)

            jieba.initialize()
            existing_freq = jieba.dt.FREQ
            # Supplement jieba with multi-char CC-CEDICT words not already in jieba's core dict
            for word, metas in mapping.items():
                if 2 <= len(word) <= 6 and word not in existing_freq:
                    if all(_HANZI_CHAR_RE.fullmatch(ch) for ch in word):
                        freq = 50 if not metas[0].is_proper_noun else 10
                        jieba.add_word(word, freq=freq)

            self._dict_by_simplified = mapping
            self._loaded = True

    def count_hanzi(self, text: str) -> int:
        return len(_HANZI_CHAR_RE.findall(text))

    def chunk_text(self, text: str, target_chars: int = 1000) -> list[list[str]]:
        """Split raw text into sections, each containing a list of paragraph strings."""
        normalized = text.replace("\r\n", "\n").replace("\r", "\n")
        raw_paragraphs = [p.strip() for p in normalized.split("\n") if p.strip()]
        if not raw_paragraphs:
            return []

        # Break extraordinarily long single paragraphs along sentence boundaries
        paragraphs: list[str] = []
        max_para_len = max(target_chars * 2, 2000)
        for para in raw_paragraphs:
            if len(para) <= max_para_len:
                paragraphs.append(para)
            else:
                buf = ""
                for sentence in _SENTENCE_SPLIT_RE.split(para):
                    if not sentence:
                        continue
                    if buf and len(buf) + len(sentence) > target_chars:
                        paragraphs.append(buf.strip())
                        buf = sentence
                    else:
                        buf += sentence
                if buf.strip():
                    paragraphs.append(buf.strip())

        sections: list[list[str]] = []
        current_section: list[str] = []
        current_len = 0

        for para in paragraphs:
            if current_section and current_len + len(para) > target_chars:
                sections.append(current_section)
                current_section = [para]
                current_len = len(para)
            else:
                current_section.append(para)
                current_len += len(para)

        if current_section:
            sections.append(current_section)

        return sections

    def _resolve_word(self, word: str, context_pinyin: str) -> dict[str, Any]:
        entries = self._dict_by_simplified.get(word)
        if not entries:
            return {"t": word, "p": context_pinyin, "d": []}

        ctx_key = normalize_pinyin_key(context_pinyin)
        matched = [e for e in entries if e.pinyin_key == ctx_key]
        others = [e for e in entries if e.pinyin_key != ctx_key]
        ordered = matched + others

        # Prefer contextual match if found; if only one common reading exists in CC-CEDICT
        # (e.g. '喜欢' -> 'xǐ huan' neutral tone), prefer CC-CEDICT's canonical pinyin.
        non_proper = [e for e in entries if not e.is_proper_noun]
        if matched:
            chosen_pinyin = matched[0].pinyin_marks
        elif len(non_proper) == 1:
            chosen_pinyin = non_proper[0].pinyin_marks
        elif len(entries) == 1:
            chosen_pinyin = entries[0].pinyin_marks
        else:
            chosen_pinyin = context_pinyin

        return {
            "t": word,
            "p": chosen_pinyin,
            "d": [e.id for e in ordered],
        }

    def _split_unknown_word(self, word: str) -> list[str]:
        """Split a multi-character token not in CC-CEDICT into the cleanest CC-CEDICT words via DP."""
        n = len(word)
        if n <= 1 or word in self._dict_by_simplified:
            return [word]

        # dp[i] = (score_tuple, best_pieces) for word[i:]
        # Lower score is better: (missing_from_dict_count, total_tokens, single_char_tokens)
        dp: list[tuple[tuple[int, int, int], list[str]] | None] = [None] * (n + 1)
        dp[n] = ((0, 0, 0), [])

        for i in range(n - 1, -1, -1):
            best: tuple[tuple[int, int, int], list[str]] | None = None
            max_end = min(n, i + 6)
            for j in range(i + 1, max_end + 1):
                piece = word[i:j]
                in_dict = piece in self._dict_by_simplified
                # Only allow multi-character pieces if they exist in CC-CEDICT
                if j - i > 1 and not in_dict:
                    continue
                tail = dp[j]
                if tail is None:
                    continue
                tail_score, tail_pieces = tail
                score = (
                    tail_score[0] + (0 if in_dict else 1),
                    tail_score[1] + 1,
                    tail_score[2] + (1 if j - i == 1 else 0),
                )
                if best is None or score < best[0]:
                    best = (score, [piece, *tail_pieces])
            dp[i] = best

        return dp[0][1] if dp[0] is not None else [word]

    def annotate_paragraph(self, paragraph: str) -> list[dict[str, Any]]:
        tokens: list[dict[str, Any]] = []
        parts = _HANZI_SPLIT_RE.split(paragraph)

        for part in parts:
            if not part:
                continue
            if not _HANZI_CHAR_RE.search(part):
                tokens.append({"t": part, "w": False})
                continue

            # Run phrase-aware pypinyin across the full contiguous Chinese clause
            char_pinyins = [item[0] for item in get_pinyin(part, style=Style.TONE, errors="default")]
            raw_words = jieba.lcut(part, HMM=True)

            # Refine any multi-char jieba phrase not in CC-CEDICT (e.g. 今天天气 -> 今天 + 天气)
            words: list[str] = []
            for raw_word in raw_words:
                if not raw_word:
                    continue
                if len(raw_word) > 1 and raw_word not in self._dict_by_simplified:
                    words.extend(self._split_unknown_word(raw_word))
                else:
                    words.append(raw_word)

            offset = 0
            for word in words:
                if not word:
                    continue
                end = offset + len(word)
                word_py = " ".join(char_pinyins[offset:end])
                offset = end
                tokens.append(self._resolve_word(word, word_py))

        return tokens

    def digest_text(
        self, db: Session, text: str, target_chars: int = 1000
    ) -> list[dict[str, Any]]:
        """Digest full Chinese text into section payloads ready for DocumentSection creation."""
        self.ensure_loaded(db)
        section_paragraphs = self.chunk_text(text, target_chars=target_chars)

        digested: list[dict[str, Any]] = []
        for idx, paragraphs in enumerate(section_paragraphs):
            raw_text = "\n\n".join(paragraphs)
            annotated_paragraphs = [self.annotate_paragraph(p) for p in paragraphs]
            digested.append(
                {
                    "section_index": idx,
                    "title": f"Section {idx + 1}",
                    "raw_text": raw_text,
                    "char_count": self.count_hanzi(raw_text),
                    "tokens": annotated_paragraphs,
                }
            )
        return digested

    def digest_chapters(
        self,
        db: Session,
        chapters: list[tuple[str | None, list[str]]],
        target_chars: int = 1200,
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> list[dict[str, Any]]:
        """Digest structured chapters (from PDF/EPUB/TXT) into annotated sections with titles."""
        self.ensure_loaded(db)

        # First expand chapters into appropriately sized chunks so we know exact total count
        planned_sections: list[tuple[str, list[str]]] = []
        for chap_idx, (chap_title, raw_paragraphs) in enumerate(chapters):
            joined = "\n\n".join(raw_paragraphs)
            chunks = self.chunk_text(joined, target_chars=target_chars)
            if not chunks:
                continue
            base_title = (chap_title or f"Section {chap_idx + 1}").strip()[:220]
            if len(chunks) == 1:
                planned_sections.append((base_title, chunks[0]))
            else:
                for part_idx, chunk in enumerate(chunks, start=1):
                    planned_sections.append((f"{base_title} ({part_idx}/{len(chunks)})", chunk))

        total = len(planned_sections)
        digested: list[dict[str, Any]] = []
        for idx, (sec_title, paragraphs) in enumerate(planned_sections):
            raw_text = "\n\n".join(paragraphs)
            annotated_paragraphs = [self.annotate_paragraph(p) for p in paragraphs]
            digested.append(
                {
                    "section_index": idx,
                    "title": sec_title,
                    "raw_text": raw_text,
                    "char_count": self.count_hanzi(raw_text),
                    "tokens": annotated_paragraphs,
                }
            )
            if progress_callback:
                progress_callback(idx + 1, total)

        return digested


annotator = ChineseAnnotator()
