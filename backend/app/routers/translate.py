from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.translator import TranslationUnavailableError, translator

router = APIRouter(prefix="/api/translate", tags=["translate"])


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=3000)


class TranslateResponse(BaseModel):
    source_text: str
    translated_text: str
    cached: bool


@router.post("", response_model=TranslateResponse)
def translate_text(
    payload: TranslateRequest,
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TranslateResponse:
    cleaned = payload.text.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    try:
        translated, cached = translator.translate(db, cleaned)
    except TranslationUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return TranslateResponse(
        source_text=cleaned,
        translated_text=translated,
        cached=cached,
    )
