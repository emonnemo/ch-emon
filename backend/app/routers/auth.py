from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.models.document import Document
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    UpdatePreferencesRequest,
    UserOut,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _normalize_email(email: str) -> str:
    cleaned = email.strip().lower()
    if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    return cleaned


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = _normalize_email(payload.email)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty.")

    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    total_users = db.scalar(select(func.count()).select_from(User)) or 0
    user = User(
        email=email,
        name=name,
        password_hash=hash_password(payload.password),
        preferences={"show_pinyin": True, "font_size_idx": 1},
    )
    db.add(user)
    db.flush()

    # If this is the very first user, adopt any pre-auth Phase 1/2 documents so nothing is lost
    if total_users == 0:
        db.execute(update(Document).where(Document.user_id.is_(None)).values(user_id=user.id))

    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return AuthResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(user.id)
    return AuthResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.patch("/preferences", response_model=UserOut)
def update_preferences(
    payload: UpdatePreferencesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    merged = {**(current_user.preferences or {}), **payload.preferences}
    current_user.preferences = merged
    db.commit()
    db.refresh(current_user)
    return current_user
