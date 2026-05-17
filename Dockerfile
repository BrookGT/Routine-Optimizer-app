# syntax=docker/dockerfile:1.7

FROM python:3.11-slim-bookworm

ARG NODE_VERSION=20.19.4

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    EXPO_NO_TELEMETRY=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        xz-utils \
    && curl -fsSLO https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz \
    && tar -xJf node-v${NODE_VERSION}-linux-x64.tar.xz -C /usr/local --strip-components=1 \
    && rm -f node-v${NODE_VERSION}-linux-x64.tar.xz \
    && npm install -g serve@14.2.4 \
    && rm -rf /var/lib/apt/lists/*

COPY . /app/

RUN cd /app/backend && npm install --omit=dev --no-fund --no-audit
RUN cd /app/admin-dashboard && NODE_ENV=development npm install --no-fund --no-audit
RUN cd /app/mobile && NODE_ENV=development npm install --no-fund --no-audit
RUN pip install --no-cache-dir -r /app/ai-service/requirements.txt

RUN npm run build --prefix /app/admin-dashboard \
    && npx --prefix /app/mobile expo export --platform web

RUN mkdir -p /app/ai-service/data \
    && cat <<'EOF' > /usr/local/bin/wuloye-entrypoint.sh
#!/bin/sh
set -eu

case "${SERVICE:-}" in
    backend)
        exec node /app/backend/src/server.js
        ;;
    ai-service)
        exec python /app/ai-service/main.py
        ;;
    admin)
        exec serve -s /app/admin-dashboard/dist -l 3000
        ;;
    mobile)
        exec serve -s /app/mobile/dist -l 19006
        ;;
    all)
        node /app/backend/src/server.js &
        python /app/ai-service/main.py &
        serve -s /app/admin-dashboard/dist -l 3000 &
        serve -s /app/mobile/dist -l 19006 &
        wait
        ;;
    *)
        echo "Set SERVICE=backend|ai-service|admin|mobile|all"
        exit 1
        ;;
esac
EOF

RUN chmod +x /usr/local/bin/wuloye-entrypoint.sh

EXPOSE 3000 5000 8000 19006

ENTRYPOINT ["/usr/local/bin/wuloye-entrypoint.sh"]
