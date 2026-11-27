"""Download and extract the local offline Chinese -> English CTranslate2 model."""

import json
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
MODELS_ROOT = BACKEND_DIR / "data" / "models" / "zh-en"
INDEX_URL = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json"
USER_AGENT = "Mozilla/5.0 (compatible; ch-emon/1.0)"


def is_installed() -> bool:
    if not MODELS_ROOT.exists():
        return False
    return any(
        (sp.parent / "model" / "model.bin").exists()
        for sp in MODELS_ROOT.rglob("sentencepiece.model")
    )


def _download_file(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=180) as resp, dest.open("wb") as out:
        shutil.copyfileobj(resp, out)


def ensure_zh_en_model() -> None:
    if is_installed():
        print(f"Local zh -> en translation model is already installed in {MODELS_ROOT}.")
        return

    print(f"Fetching model index from {INDEX_URL} ...")
    idx_req = urllib.request.Request(INDEX_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(idx_req, timeout=30) as resp:
        index = json.loads(resp.read().decode("utf-8"))

    pkg = next(
        (
            item
            for item in index
            if item.get("from_code") == "zh" and item.get("to_code") == "en"
        ),
        None,
    )
    links = (pkg or {}).get("links") or []
    if not links:
        raise RuntimeError("Could not find zh -> en model link in Argos index.")

    MODELS_ROOT.mkdir(parents=True, exist_ok=True)
    last_err: Exception | None = None

    with tempfile.NamedTemporaryFile(suffix=".argosmodel") as tmp:
        tmp_path = Path(tmp.name)
        for url in links:
            try:
                print(f"Downloading zh -> en model from {url} ...")
                _download_file(url, tmp_path)
                last_err = None
                break
            except Exception as exc:
                print(f"Download from {url} failed: {exc}")
                last_err = exc

        if last_err is not None:
            raise last_err

        with zipfile.ZipFile(tmp_path, "r") as zf:
            zf.extractall(MODELS_ROOT)

    print(f"Successfully installed zh -> en translation model to {MODELS_ROOT}.")


if __name__ == "__main__":
    ensure_zh_en_model()
