"""Download (if needed) and import CC-CEDICT into PostgreSQL dictionary_entries."""

from __future__ import annotations

import argparse
import gzip
import re
import sys
import urllib.request
from pathlib import Path

# Allow running directly as `python scripts/import_cedict.py` from backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import delete, func, insert, select

from app.core.database import SessionLocal
from app.models.dictionary import DictionaryEntry
from app.services.pinyin_utils import numbered_to_toned_pinyin

CEDICT_URL = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz"
DATA_DIR = BACKEND_DIR / "data"
DEFAULT_ARCHIVE_PATH = DATA_DIR / "cedict_ts.u8.gz"

LINE_RE = re.compile(r"^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+/(.+)/$")
BATCH_SIZE = 5000


def download_cedict(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading CC-CEDICT from {CEDICT_URL} ...")
    req = urllib.request.Request(CEDICT_URL, headers={"User-Agent": "ch-emon-importer/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp, dest.open("wb") as out:
        out.write(resp.read())
    print(f"Saved CC-CEDICT archive to {dest}")


def parse_cedict_lines(path: Path):
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as fh:
        for raw_line in fh:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            match = LINE_RE.match(line)
            if not match:
                continue
            traditional, simplified, pinyin_num, defs_raw = match.groups()
            definitions = [d.strip() for d in defs_raw.split("/") if d.strip()]
            if not definitions:
                continue
            if len(simplified) > 64 or len(traditional) > 64 or len(pinyin_num) > 255:
                continue
            yield {
                "simplified": simplified,
                "traditional": traditional,
                "pinyin_num": pinyin_num,
                "pinyin_marks": numbered_to_toned_pinyin(pinyin_num),
                "definitions": definitions,
                "is_proper_noun": bool(pinyin_num and pinyin_num[0].isupper()),
            }


def import_cedict(file_path: Path, force: bool = False) -> int:
    if not file_path.exists():
        download_cedict(file_path)

    with SessionLocal() as db:
        existing_count = db.scalar(select(func.count()).select_from(DictionaryEntry)) or 0
        if existing_count > 0 and not force:
            print(f"dictionary_entries already contains {existing_count} rows. Use --force to reimport.")
            return existing_count

        if existing_count > 0 and force:
            print(f"Clearing {existing_count} existing rows from dictionary_entries...")
            db.execute(delete(DictionaryEntry))
            db.commit()

        batch: list[dict] = []
        total = 0
        for row in parse_cedict_lines(file_path):
            batch.append(row)
            if len(batch) >= BATCH_SIZE:
                db.execute(insert(DictionaryEntry), batch)
                db.commit()
                total += len(batch)
                batch.clear()
                print(f"Inserted {total} entries...")

        if batch:
            db.execute(insert(DictionaryEntry), batch)
            db.commit()
            total += len(batch)

        print(f"Successfully imported {total} CC-CEDICT entries.")
        return total


def main() -> None:
    parser = argparse.ArgumentParser(description="Import CC-CEDICT into PostgreSQL.")
    parser.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_ARCHIVE_PATH,
        help="Path to CC-CEDICT .gz or plain text file (downloads automatically if missing).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Clear and reimport dictionary_entries even if already populated.",
    )
    args = parser.parse_args()
    import_cedict(args.file, force=args.force)


if __name__ == "__main__":
    main()
