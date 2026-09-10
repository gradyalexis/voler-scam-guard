# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Tesseract mengunduh file *.traineddata saat pertama jalan; simpan di volume
# supaya tidak diunduh ulang tiap restart container.
ENV TESSDATA_PATH=/app/tessdata
RUN mkdir -p /app/tessdata && chown -R node:node /app

USER node
CMD ["node", "dist/index.js"]
