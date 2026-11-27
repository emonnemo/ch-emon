# ch-emon

A responsive web app for reading Chinese texts and books (plain text, PDF, EPUB) with grouped word-level pinyin, CC-CEDICT meanings, a personal review dictionary, built-in Anki-style FSRS spaced repetition, and Mandarin TTS pronunciation — powered 100% locally with zero LLM API costs.

## Features

- **Chinese Text & Book Digestion:** Paste Chinese text or upload `.pdf`, `.epub`, or `.txt` files (up to 25 MB) with background digestion, Chinese PDF line-wrap repair, and EPUB chapter/TOC preservation.
- **Word-Level Segmentation & Context Pinyin:** Uses `jieba` + CC-CEDICT dictionary-backed sub-segmentation (so compounds like `冰淇淋` stay grouped while non-dictionary phrases like `今天天气` split cleanly into `今天` + `天气`) and clause-level `pypinyin` for polyphones (`银行` vs. `行走`, `长大` vs. `长度`).
- **Interactive Reader:** Grouped `<ruby>` pinyin, click/tap definition popover, optional tone coloring, chapters drawer, synced reading progress & preferences, and word/paragraph pronunciation via the Browser Web Speech API.
- **Multi-User Accounts & Built-in SRS (FSRS):** Save any word from the reader into your personal review dictionary, edit custom meanings/notes, and review due cards with Anki-style `Again / Hard / Good / Easy` intervals powered by **FSRS**.

## Tech Stack

- **Frontend:** Next.js 15 (App Router, TypeScript, Tailwind CSS) + Browser Web Speech API
- **Backend:** Python, FastAPI, SQLAlchemy 2, Alembic, `PyJWT`, `fsrs`
- **NLP & Parsers:** `jieba`, `pypinyin`, CC-CEDICT, `PyMuPDF`, `ebooklib`, `BeautifulSoup`
- **Database:** PostgreSQL (local Homebrew `postgresql@14`, or optional `docker-compose.yml`)

## Quick Start (Local Development)

### 1. Database (Local Homebrew PostgreSQL)
```bash
brew services start postgresql@14
createdb chemon   # first time only
```

### 2. Backend
```bash
cd backend
source .venv/bin/activate
alembic upgrade head
python scripts/import_cedict.py             # imports ~125k CC-CEDICT entries (first time only)
python scripts/install_translation_model.py # downloads offline zh -> en model (first time only)
uvicorn app.main:app --reload --port 8000
```

Configure environment variables in `backend/.env` (see `backend/.env.example`):
- `DATABASE_URL` — PostgreSQL connection string
- `CORS_ORIGINS` — comma-separated frontend origins (default `http://localhost:3000`)
- `JWT_SECRET` — change to a strong random secret before deploying to production

### 3. Frontend
```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, and upload a book or paste Chinese text.

## Keyboard Shortcuts

- **Reader:** `P` toggle pinyin · `T` toggle tone colors · `S` pronounce selected word · `←` / `→` previous/next section · `Esc` close popover/drawer
- **SRS Review:** `Space` / `Enter` reveal answer · `A` play audio · `1` Again · `2` Hard · `3` Good · `4` Easy

## Deployment

See [DEPLOY.md](DEPLOY.md) for step-by-step instructions to deploy the frontend on **Vercel Free**, PostgreSQL on **Supabase**, and the Python NLP backend via [backend/Dockerfile](backend/Dockerfile) on **Hugging Face Spaces (Free 16 GB RAM)** or **Railway**.

## Running Tests

```bash
cd backend && .venv/bin/pytest -v
cd frontend && npx tsc --noEmit && npm run build
```
