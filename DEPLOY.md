# Deploying `ch-emon` (Option A: Vercel + Supabase + Docker Backend)

This setup keeps 100% of the local Chinese NLP (`jieba`, `pypinyin`, CC-CEDICT, `PyMuPDF`, `ebooklib`, and offline `ctranslate2` `zh → en` translation) with **$0/month** free-tier options.

---

## 1. Database — Supabase (Free Tier)

1. Create a new project on [Supabase](https://supabase.com/).
2. Open **Project Settings → Database → Connection string** (or click **Connect** in the top bar).
3. Copy the **Session Pooler** URI (recommended for IPv4 compatibility on Docker hosts; Transaction Pooler on port `6543` also works!):
   ```text
   postgresql://postgres.<project-ref>:<YOUR_DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   *(No need to change `postgresql://` — the backend automatically normalizes it to `postgresql+psycopg://`.)*

---

## 2. Backend — Docker Host (Hugging Face Spaces Free *or* Railway)

The included [backend/Dockerfile](backend/Dockerfile) pre-bundles CC-CEDICT and the offline `zh → en` neural model at build time. On startup, [backend/entrypoint.sh](backend/entrypoint.sh) automatically runs `alembic upgrade head` and seeds the 125k CC-CEDICT rows into Supabase (idempotent — skipped on subsequent restarts).

### Option 2A: Hugging Face Spaces (Free — 16 GB RAM / 2 vCPU)
1. Go to [huggingface.co/new-space](https://huggingface.co/new-space), create a **Docker (Blank)** Space (e.g. `ch-emon-api`).
2. Push the `backend/` folder contents to your Space repo (or link it).
3. In your Space **Settings → Variables and secrets**, add:
   * **Secret** `DATABASE_URL`: your Supabase connection URI from Step 1
   * **Secret** `JWT_SECRET`: a long random string (e.g. `openssl rand -hex 32`)
   * **Variable** `CORS_ORIGINS`: `https://<your-vercel-app>.vercel.app,http://localhost:3000`
   * **Variable** `CORS_ORIGIN_REGEX` *(optional)*: `https://.*\.vercel\.app`
4. Once running, verify `https://<your-hf-username>-ch-emon-api.hf.space/api/health` returns `{"status":"ok","dictionary_entries":125479}`.

### Option 2B: Railway (Always-on, no idle sleep)
1. Create a new project on [Railway](https://railway.app/) → **Deploy from GitHub repo** → select `emonnemo/ch-emon`.
2. Set **Root Directory** to `backend` (Railway auto-detects `backend/Dockerfile`).
3. Add environment variables: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, and optional `CORS_ORIGIN_REGEX`.
4. Generate a public domain in Railway Networking settings and verify `/api/health`.

---

## 3. Frontend — Vercel (Free Tier)

1. Go to [vercel.com/new](https://vercel.com/new) and import **`emonnemo/ch-emon`**.
2. Set **Root Directory** to `frontend`.
3. Add one Environment Variable:
   * `NEXT_PUBLIC_API_URL` = your live backend URL from Step 2 (no trailing slash, e.g. `https://<your-space>.hf.space` or `https://<your-app>.up.railway.app`).
4. Click **Deploy**!
5. Copy your Vercel production URL (e.g. `https://ch-emon.vercel.app`) back into your backend's `CORS_ORIGINS` variable if you haven't already.
