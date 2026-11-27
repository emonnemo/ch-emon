FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

WORKDIR /app

# Install Python dependencies first for better Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Pre-download CC-CEDICT archive and offline zh -> en CTranslate2 model into the image
RUN python scripts/import_cedict.py --download-only && \
    python scripts/install_translation_model.py

EXPOSE 7860

ENTRYPOINT ["./entrypoint.sh"]
