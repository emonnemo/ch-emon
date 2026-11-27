from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.dictionary import DictionaryEntry
from app.schemas.document import DictionaryEntryOut

router = APIRouter(prefix="/api/dictionary", tags=["dictionary"])


@router.get("/lookup", response_model=list[DictionaryEntryOut])
def lookup_word(
    word: str = Query(..., min_length=1, max_length=64),
    db: Session = Depends(get_db),
) -> list[DictionaryEntry]:
    cleaned = word.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Word cannot be empty.")

    stmt = (
        select(DictionaryEntry)
        .where(
            (DictionaryEntry.simplified == cleaned) | (DictionaryEntry.traditional == cleaned)
        )
        .order_by(DictionaryEntry.is_proper_noun.asc(), DictionaryEntry.id.asc())
        .limit(15)
    )
    return list(db.scalars(stmt).all())
