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

# Endpoint health (lihat src/health.ts). Port di-hardcode 9000 di sini; ubah
# lewat HEALTH_PORT kalau perlu, dan sesuaikan port mapping di compose.
ENV HEALTH_PORT=9000
EXPOSE 9000

# node:22 punya fetch global, jadi tidak perlu memasang curl di image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HEALTH_PORT||9000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
