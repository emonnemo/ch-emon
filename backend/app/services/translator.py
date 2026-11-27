import hashlib
import re
import threading
from pathlib import Path

import ctranslate2
import sentencepiece as spm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.translation import TranslationCache

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
MODELS_ROOT = BACKEND_DIR / "data" / "models" / "zh-en"

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[。！？!?])")
_BRACKET_CITATION_RE = re.compile(r"[\[［〔【]\s*\d{1,4}(?:\s*[-–—,，]\s*\d{1,4})*\s*[\]］〕】]")
_PAREN_INDEX_RE = re.compile(r"[（(]\s*\d{1,3}\s*[）)]")
_CIRCLED_SUPERSCRIPT_RE = re.compile(r"[①-⑳⁰¹²³⁴⁵⁶⁷⁸⁹]+")


def strip_citations(text: str) -> str:
    """Remove inline footnote citations like [1], [5], (5), ① while keeping years like 1996."""
    cleaned = _BRACKET_CITATION_RE.sub("", text)
    cleaned = _PAREN_INDEX_RE.sub("", cleaned)
    cleaned = _CIRCLED_SUPERSCRIPT_RE.sub("", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+([，。！？；：、”’》）】])", r"\1", cleaned)
    return cleaned.strip()


class TranslationUnavailableError(Exception):
    """Raised when the local zh -> en CTranslate2 model is not installed or fails."""


def _find_model_paths() -> tuple[Path, Path]:
    if not MODELS_ROOT.exists():
        raise TranslationUnavailableError(
            "Local zh -> en translation model is not installed. "
            "Run `python scripts/install_translation_model.py`."
        )

    for sp_path in MODELS_ROOT.rglob("sentencepiece.model"):
        model_dir = sp_path.parent / "model"
        if (model_dir / "model.bin").exists():
            return model_dir, sp_path

    raise TranslationUnavailableError(
        "Local zh -> en translation model files not found in backend/data/models/zh-en. "
        "Run `python scripts/install_translation_model.py`."
    )


class LocalTranslator:
    """Thread-safe offline Chinese -> English sentence translator via CTranslate2 + SentencePiece."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ct2: ctranslate2.Translator | None = None
        self._sp: spm.SentencePieceProcessor | None = None

    def _ensure_loaded(self) -> tuple[ctranslate2.Translator, spm.SentencePieceProcessor]:
        if self._ct2 is not None and self._sp is not None:
            return self._ct2, self._sp
        with self._lock:
            if self._ct2 is not None and self._sp is not None:
                return self._ct2, self._sp

            model_dir, sp_path = _find_model_paths()
            sp = spm.SentencePieceProcessor()
            sp.load(str(sp_path))
            ct2 = ctranslate2.Translator(str(model_dir), device="cpu", inter_threads=2)

            self._sp = sp
            self._ct2 = ct2
            return ct2, sp

    def _translate_raw(self, text: str) -> str:
        ct2, sp = self._ensure_loaded()
        paragraphs = [p.strip() for p in text.splitlines() if p.strip()]
        translated_paragraphs: list[str] = []

        for para in paragraphs:
            sentences = [s.strip() for s in _SENTENCE_SPLIT_RE.split(para) if s.strip()]
            if not sentences:
                continue
            tokenized = [sp.encode(s, out_type=str) for s in sentences]
            results = ct2.translate_batch(tokenized, beam_size=4, max_decoding_length=256)
            decoded = []
            for res in results:
                text_out = sp.decode(res.hypotheses[0]).replace("\u2581", " ")
                text_out = re.sub(r"\s+", " ", text_out).strip()
                if text_out:
                    decoded.append(text_out)
            translated_paragraphs.append(" ".join(decoded))

        return "\n".join(translated_paragraphs).strip()

    def translate(self, db: Session, text: str) -> tuple[str, bool]:
        cleaned = strip_citations(text)
        if not cleaned:
            return "", True

        text_hash = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()
        cached = db.scalar(
            select(TranslationCache).where(TranslationCache.text_hash == text_hash)
        )
        if cached:
            return cached.translated_text, True

        translated = self._translate_raw(cleaned)

        db.add(
            TranslationCache(
                text_hash=text_hash,
                source_text=cleaned,
                translated_text=translated,
                engine="ct2-zh-en",
            )
        )
        try:
            db.commit()
        except Exception:
            db.rollback()

        return translated, False


translator = LocalTranslator()
