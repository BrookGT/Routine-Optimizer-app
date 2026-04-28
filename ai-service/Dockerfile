# ─── Wuloye AI Service — Dockerfile ──────────────────────────────────────────
# Multi-stage build not needed here; single stage is cleaner for a microservice.

FROM python:3.12-slim

WORKDIR /app

# Install system dependencies required by some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Ensure the data directory exists (model artefacts are written here at runtime)
RUN mkdir -p data

EXPOSE 8000

# Reload disabled in production for performance
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
