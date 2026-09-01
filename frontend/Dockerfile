# ── Build Stage ──
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY angular.json tsconfig*.json ./
COPY public ./public
COPY src ./src

RUN npm run build

# ── Nginx Static Server Stage ──
FROM nginx:alpine AS runner

COPY --from=builder /app/dist/trip-planner-frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Crear script de entrypoint para inyectar variables de entorno (API_URL) en runtime
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'mkdir -p /usr/share/nginx/html/assets' >> /entrypoint.sh && \
    echo 'echo "window.__env = { apiUrl: \"${API_URL}\" };" > /usr/share/nginx/html/assets/env.js' >> /entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh

EXPOSE 8080

CMD ["/entrypoint.sh"]
