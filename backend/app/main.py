from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.dictionary import DictionaryEntry
from app.routers import auth, dictionary, documents, reviews, translate, vocab
from app.services.nlp import annotator


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        with SessionLocal() as db:
            count = db.scalar(select(func.count()).select_from(DictionaryEntry)) or 0
            if count > 0:
                annotator.ensure_loaded(db)
    except Exception:
        pass
    yield


app = FastAPI(title="ch-emon API", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(dictionary.router)
app.include_router(vocab.router)
app.include_router(reviews.router)
app.include_router(translate.router)


@app.get("/api/health")
def health() -> dict[str, str | int]:
    with SessionLocal() as db:
        dict_count = db.scalar(select(func.count()).select_from(DictionaryEntry)) or 0
    return {"status": "ok", "dictionary_entries": dict_count}
