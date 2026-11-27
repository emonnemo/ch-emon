from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.database import SessionLocal, get_db
from app.core.security import get_current_user
from app.models.dictionary import DictionaryEntry
from app.models.document import Document, DocumentSection
from app.models.user import User
from app.schemas.document import (
    CreateTextDocumentRequest,
    DictionaryEntryOut,
    DocumentDetailOut,
    DocumentSectionOut,
    DocumentSummaryOut,
    UpdateDocumentRequest,
    UpdateProgressRequest,
)
from app.services.nlp import annotator
from app.services.parsers import DocumentParseError, parse_epub, parse_pdf, parse_txt

router = APIRouter(prefix="/api/documents", tags=["documents"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB
ALLOWED_EXTENSIONS = {".pdf": "pdf", ".epub": "epub", ".txt": "text"}


def _get_owned_document(db: Session, document_id: int, user_id: int) -> Document:
    doc = db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == user_id)
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


def _process_uploaded_document(
    document_id: int,
    source_type: str,
    file_bytes: bytes,
    user_provided_title: bool,
) -> None:
    """Background worker that parses an uploaded PDF/EPUB/TXT and annotates all sections."""
    with SessionLocal() as db:
        doc = db.get(Document, document_id)
        if not doc:
            return

        try:
            doc.progress_percent = 10
            db.commit()

            if source_type == "pdf":
                parsed = parse_pdf(file_bytes)
            elif source_type == "epub":
                parsed = parse_epub(file_bytes)
            else:
                parsed = parse_txt(file_bytes)

            if not user_provided_title and parsed.title:
                doc.title = parsed.title[:255]

            doc.progress_percent = 20
            db.commit()

            last_reported = 20

            def on_progress(done: int, total: int) -> None:
                nonlocal last_reported
                if total <= 0:
                    return
                pct = 20 + int((done / total) * 75)
                if pct >= last_reported + 5 or done == total:
                    last_reported = pct
                    doc.progress_percent = pct
                    db.commit()

            chapters_input = [(ch.title, ch.paragraphs) for ch in parsed.chapters]
            digested_sections = annotator.digest_chapters(
                db,
                chapters_input,
                target_chars=1200,
                progress_callback=on_progress,
            )

            if not digested_sections:
                raise DocumentParseError("No readable text sections could be extracted.")

            for sec in digested_sections:
                db.add(
                    DocumentSection(
                        document_id=doc.id,
                        section_index=sec["section_index"],
                        title=sec["title"],
                        raw_text=sec["raw_text"],
                        char_count=sec["char_count"],
                        tokens=sec["tokens"],
                    )
                )

            doc.total_chars = sum(sec["char_count"] for sec in digested_sections)
            doc.section_count = len(digested_sections)
            doc.last_section_index = 0
            doc.status = "ready"
            doc.progress_percent = 100
            doc.error_message = None
            db.commit()
        except DocumentParseError as exc:
            db.rollback()
            doc = db.get(Document, document_id)
            if doc:
                doc.status = "failed"
                doc.progress_percent = 0
                doc.error_message = str(exc)
                db.commit()
        except Exception as exc:
            db.rollback()
            doc = db.get(Document, document_id)
            if doc:
                doc.status = "failed"
                doc.progress_percent = 0
                doc.error_message = f"Unexpected error while processing file: {exc}"
                db.commit()


@router.post("/text", response_model=DocumentDetailOut, status_code=status.HTTP_201_CREATED)
def create_text_document(
    payload: CreateTextDocumentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Document:
    title = payload.title.strip()
    text = payload.text.strip()
    if not title or not text:
        raise HTTPException(status_code=400, detail="Title and text must not be empty.")

    digested_sections = annotator.digest_text(db, text)
    if not digested_sections:
        raise HTTPException(status_code=400, detail="No readable content found in text.")

    total_chars = sum(sec["char_count"] for sec in digested_sections)
    document = Document(
        user_id=current_user.id,
        title=title,
        source_type="text",
        status="ready",
        progress_percent=100,
        total_chars=total_chars,
        section_count=len(digested_sections),
        last_section_index=0,
    )
    db.add(document)
    db.flush()

    for sec in digested_sections:
        db.add(
            DocumentSection(
                document_id=document.id,
                section_index=sec["section_index"],
                title=sec["title"],
                raw_text=sec["raw_text"],
                char_count=sec["char_count"],
                tokens=sec["tokens"],
            )
        )

    db.commit()
    return db.scalar(
        select(Document)
        .options(selectinload(Document.sections))
        .where(Document.id == document.id)
    )


@router.post("/upload", response_model=DocumentSummaryOut, status_code=status.HTTP_202_ACCEPTED)
async def upload_book_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Document:
    filename = file.filename or "untitled"
    ext = Path(filename).suffix.lower()
    source_type = ALLOWED_EXTENSIONS.get(ext)
    if not source_type:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload a .pdf, .epub, or .txt file.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File is too large. Maximum supported size is 25 MB.",
        )

    cleaned_title = title.strip() if title and title.strip() else None
    fallback_title = Path(filename).stem.strip() or "Untitled Book"

    document = Document(
        user_id=current_user.id,
        title=(cleaned_title or fallback_title)[:255],
        source_type=source_type,
        status="processing",
        progress_percent=5,
        error_message=None,
        total_chars=0,
        section_count=0,
        last_section_index=0,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    background_tasks.add_task(
        _process_uploaded_document,
        document.id,
        source_type,
        file_bytes,
        bool(cleaned_title),
    )

    return document


@router.get("", response_model=list[DocumentSummaryOut])
def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Document]:
    stmt = (
        select(Document)
        .where(Document.user_id == current_user.id)
        .order_by(Document.updated_at.desc(), Document.id.desc())
    )
    return list(db.scalars(stmt).all())


@router.get("/{document_id}", response_model=DocumentDetailOut)
def get_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Document:
    doc = db.scalar(
        select(Document)
        .options(selectinload(Document.sections))
        .where(Document.id == document_id, Document.user_id == current_user.id)
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


@router.patch("/{document_id}", response_model=DocumentSummaryOut)
def update_document(
    document_id: int,
    payload: UpdateDocumentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Document:
    doc = _get_owned_document(db, document_id, current_user.id)
    cleaned = payload.title.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Title cannot be empty.")
    doc.title = cleaned
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{document_id}/sections/{section_index}", response_model=DocumentSectionOut)
def get_document_section(
    document_id: int,
    section_index: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentSectionOut:
    doc = _get_owned_document(db, document_id, current_user.id)

    section = db.scalar(
        select(DocumentSection).where(
            DocumentSection.document_id == document_id,
            DocumentSection.section_index == section_index,
        )
    )
    if not section:
        raise HTTPException(status_code=404, detail="Section not found.")

    dict_ids: set[int] = set()
    for paragraph in section.tokens:
        for token in paragraph:
            entry_ids = token.get("d")
            if entry_ids:
                dict_ids.update(entry_ids)

    dictionary_map: dict[str, DictionaryEntryOut] = {}
    if dict_ids:
        entries = db.scalars(
            select(DictionaryEntry).where(DictionaryEntry.id.in_(dict_ids))
        ).all()
        dictionary_map = {
            str(entry.id): DictionaryEntryOut.model_validate(entry) for entry in entries
        }

    return DocumentSectionOut(
        document_id=doc.id,
        document_title=doc.title,
        section_index=section.section_index,
        section_count=doc.section_count,
        title=section.title,
        char_count=section.char_count,
        tokens=section.tokens,
        dictionary=dictionary_map,
    )


@router.patch("/{document_id}/progress", response_model=DocumentSummaryOut)
def update_progress(
    document_id: int,
    payload: UpdateProgressRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Document:
    doc = _get_owned_document(db, document_id, current_user.id)
    if payload.last_section_index >= max(doc.section_count, 1):
        raise HTTPException(status_code=400, detail="Section index out of range.")

    doc.last_section_index = payload.last_section_index
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    doc = _get_owned_document(db, document_id, current_user.id)
    db.delete(doc)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
