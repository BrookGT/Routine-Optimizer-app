# syntax=docker/dockerfile:1.7
# Silver repo image: Node backend + Python AI service + admin deps.
# PyTorch is installed via pip (official CPU wheel); pytorch/pytorch has no 2.3.1-cpu tag.

FROM node:20.19.4-bookworm-slim AS node

FROM python:3.12.8-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    PATH=/usr/local/bin:$PATH \
    PIP_DEFAULT_TIMEOUT=300 \
    PIP_RETRIES=5

WORKDIR /app

COPY --from=node /usr/local /usr/local

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY . /app/

RUN cd /app/backend && npm ci --omit=dev --no-fund --no-audit \
    && cd /app/admin-dashboard && npm ci --no-fund --no-audit \
    && pip install --no-cache-dir --timeout 300 --retries 5 \
        -r /app/ai-service/requirements.txt

RUN mkdir -p /app/ai-service/data \
    && cat <<'EOF' > /usr/local/bin/wuloye-entrypoint.sh
#!/bin/sh
set -eu

case "${SERVICE:-}" in
    backend)
        exec node /app/backend/src/server.js
        ;;
    ai-service)
        cd /app/ai-service
        exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
        ;;
    admin)
        exec npm run dev --prefix /app/admin-dashboard -- --host 0.0.0.0 --port 3000
        ;;
    *)
        echo "Set SERVICE=backend|ai-service|admin"
        exit 1
        ;;
esac
EOF

RUN chmod +x /usr/local/bin/wuloye-entrypoint.sh

EXPOSE 3000 5000 8000

ENTRYPOINT ["/usr/local/bin/wuloye-entrypoint.sh"]
