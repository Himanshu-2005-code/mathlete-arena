# One image runs the whole game: the Express API, Socket.io duels and the
# Next.js site, all on $PORT.

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Build tools in case better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build:prod

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    DB_PATH=/data/mathlete.db
COPY --from=build /app /app
RUN mkdir -p /data
VOLUME /data
EXPOSE 8080
CMD ["npm", "run", "start:prod"]
