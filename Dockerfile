FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY worker/package.json worker/package.json
COPY web/package.json web/package.json
COPY landing/package.json landing/package.json
COPY server/package.json server/package.json

RUN npm install

COPY . .

RUN npm run build -w server && npm run build -w web

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app

ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/jobpull.sqlite \
    CRON_SCHEDULE="0 7 * * *"

EXPOSE 8787

CMD ["node", "--experimental-loader", "./server/loader.mjs", "server/src/index.ts"]
