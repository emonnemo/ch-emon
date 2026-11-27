"""Download and extract the local offline Chinese -> English CTranslate2 model."""

import json
import tempfile
import urllib.request
import zipfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
MODELS_ROOT = BACKEND_DIR / "data" / "models" / "zh-en"
INDEX_URL = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json"


def is_installed() -> bool:
    return any(
        (sp.parent / "model" / "model.bin").exists()
        for sp in MODELS_ROOT.rglob("sentencepiece.model")
    ) if MODELS_ROOT.exists() else False


def ensure_zh_en_model() -> None:
    if is_installed():
        print(f"Local zh -> en translation model is already installed in {MODELS_ROOT}.")
        return

    print(f"Fetching model index from {INDEX_URL} ...")
    with urllib.request.urlopen(INDEX_URL, timeout=30) as resp:
        index = json.loads(resp.read().decode("utf-8"))

    pkg = next(
        (
            item
            for item in index
            if item.get("from_code") == "zh" and item.get("to_code") == "en"
        ),
        None,
    )
    if not pkg or not pkg.get("links"):
        raise RuntimeError("Could not find zh -> en model link in Argos index.")

    url = pkg["links"][0]
    MODELS_ROOT.mkdir(parents=True, exist_ok=True)
    print(f"Downloading zh -> en model from {url} ...")
    with tempfile.NamedTemporaryFile(suffix=".argosmodel") as tmp:
        urllib.request.urlretrieve(url, tmp.name)
        with zipfile.ZipFile(tmp.name, "r") as zf:
            zf.extractall(MODELS_ROOT)

    print(f"Successfully installed zh -> en translation model to {MODELS_ROOT}.")


if __name__ == "__main__":
    ensure_zh_en_model()
