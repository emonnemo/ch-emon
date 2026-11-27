# Deploying `ch-emon`

`ch-emon` uses ~420 MB RAM for the backend (`jieba` + 125k CC-CEDICT + offline `ctranslate2` `zh → en` neural translator) and ~100 MB RAM for Next.js.

---

## Option 1 (Recommended): Self-Host on Ubuntu Server + Supabase PostgreSQL

Always-on, **$0/month**, zero cold sleep, and no upload size limits.

### 1. Prepare Supabase
1. Create a project on [Supabase](https://supabase.com/).
2. Click **Connect** → copy the **Session Pooler** URI (IPv4-compatible):
   ```text
   postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   *(The backend automatically converts `postgresql://` to `postgresql+psycopg://`.)*

### 2. Deploy on Ubuntu Server
Make sure Docker & Docker Compose are installed on Ubuntu, then run:

```bash
git clone https://github.com/emonnemo/ch-emon.git
cd ch-emon

cp .env.prod.example .env.prod
# Edit .env.prod and paste your Supabase DATABASE_URL + a random JWT_SECRET (openssl rand -hex 32)
nano .env.prod

# Start both Frontend (:3000) and Backend (:8000)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

* On **first boot**, `backend/entrypoint.sh` automatically runs `alembic upgrade head` and seeds all ~125k CC-CEDICT entries into Supabase (takes ~15–30s once; skipped on future restarts).
* Watch startup logs with:
  ```bash
  docker compose -f docker-compose.prod.yml logs -f backend
  ```
* Open `http://<your-ubuntu-ip>:3000` — because `NEXT_PUBLIC_API_URL=same-origin` proxies `/api/*` directly to `backend:7860` inside Docker, you only need **one port (`3000`)** and zero CORS tweaks!

### 3. Accessing Remotely (Phone / Outside Home Network)
* **Private (easiest, no domain needed):** Install [Tailscale](https://tailscale.com/) on Ubuntu + your phone/laptop, then access `http://<ubuntu-tailscale-name>:3000` (or enable HTTPS via `tailscale serve 3000`).
* **Public HTTPS (no router port forwarding):** Point a free **Cloudflare Tunnel (`cloudflared`)** at `http://localhost:3000`.

### 4. Updating Later
```bash
cd ch-emon
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

---

## Option 2: Ubuntu Backend + Vercel Free Frontend

If you want the frontend served from Vercel's global CDN while your Ubuntu server runs the Python NLP backend:

1. On Ubuntu, start **only** the backend:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build backend
   ```
2. Expose Ubuntu port `8000` over HTTPS (e.g., via Cloudflare Tunnel → `https://api.yourdomain.com`).
3. Make sure `.env.prod` has `CORS_ORIGIN_REGEX=https://.*\.vercel\.app` (or your exact Vercel domain in `CORS_ORIGINS`), then restart `backend`.
4. Go to [vercel.com/new](https://vercel.com/new), import **`emonnemo/ch-emon`**, set **Root Directory** = `frontend`, and add:
   * `NEXT_PUBLIC_API_URL` = `https://api.yourdomain.com` (no trailing slash)

---

## Option 3: 100% Cloud (Render Free + Vercel Free + Supabase)

1. **Render:** Create a **Web Service** from `emonnemo/ch-emon` with **Root Directory** = `backend`, **Runtime** = `Docker`, **Instance Type** = `Free`, and set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `CORS_ORIGIN_REGEX`.
2. **Vercel:** Import `emonnemo/ch-emon` with **Root Directory** = `frontend` and `NEXT_PUBLIC_API_URL=https://<your-render-app>.onrender.com`.
