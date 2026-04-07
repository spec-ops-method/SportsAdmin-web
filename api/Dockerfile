# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
COPY api/package.json ./api/
COPY shared/package.json ./shared/

RUN npm ci --workspace=api --workspace=shared

COPY shared/ ./shared/
COPY api/ ./api/

# Generate Prisma client
RUN npm run db:generate --workspace=api

# Compile TypeScript
RUN npm run build --workspace=api
RUN npm run build --workspace=shared


# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY api/package.json ./api/
COPY shared/package.json ./shared/

RUN npm ci --workspace=api --workspace=shared --omit=dev

# Copy compiled output and Prisma files
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/api/src/prisma ./api/src/prisma
COPY --from=build /app/shared/dist ./shared/dist

# Run migrations then start the server
CMD ["sh", "-c", "npx --prefix api prisma migrate deploy && node api/dist/index.js"]
