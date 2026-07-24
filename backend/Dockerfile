FROM python:3.11-slim

# Production image for the BenefitIQ API (FastAPI). The host injects $PORT; the container runs
# governed Alembic migrations on start, then serves with uvicorn workers. No secrets are baked in
# — all config comes from environment variables (BIQ_*) set in the host secret store.
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# app code + migration assets (needed for `alembic upgrade head` at release time)
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./alembic.ini
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 8000

# start.sh runs `alembic upgrade head` then launches uvicorn on ${PORT:-8000}.
CMD ["./start.sh"]
