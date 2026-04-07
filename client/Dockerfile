# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
COPY client/package.json ./client/
COPY shared/package.json ./shared/

RUN npm ci --workspace=client --workspace=shared

COPY shared/ ./shared/
COPY client/ ./client/

RUN npm run build --workspace=shared
RUN npm run build --workspace=client


# ─── Production stage — serve static files with Nginx ─────────────────────────
FROM nginx:1.25-alpine AS production

COPY --from=build /app/client/dist /usr/share/nginx/html

# Nginx config: serve the SPA and proxy API calls to the backend
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
