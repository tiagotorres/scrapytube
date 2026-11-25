# syntax=docker/dockerfile:1
#
# ScrapyTube – saves YouTube videos (MP4) and music (MP3) to a NAS.
#
# Builds the web app, then ships it with the server, yt-dlp and ffmpeg in a
# small Node.js image. SQLite is built into Node, and yt-dlp's standalone
# build carries its own Python: nothing is compiled for the NAS's processor.
#
#   docker build -t scrapytube .
#   docker run -d -p 5012:5012 -v ./data:/data -v ./media:/media scrapytube

ARG NODE_VERSION=24

############################################################
# Build stage
############################################################
# Runs natively on the building machine (no emulation when building an
# amd64 image on an Apple Silicon Mac): its output is the same everywhere.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm AS builder

WORKDIR /app

# Install dependencies first (cached as long as the manifests don't change).
COPY .yarn ./.yarn
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

COPY tsconfig.json tsconfig.base.json tsconfig.client.json tsconfig.server.json tsconfig.sw.json vite.config.ts index.html ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src

# Never ship a build that doesn't pass its checks.
RUN yarn typecheck && yarn test && yarn build

# Keep only what the server needs at run time.
RUN yarn workspaces focus --production \
    && find src -name '*.test.ts' -delete \
    && rm src/server/test-helpers.ts \
    && rm -rf src/client

############################################################
# yt-dlp
############################################################
# yt-dlp's standalone build for the NAS's processor, checked against the
# checksums published with it. ScrapyTube copies it to /data/bin on the first
# start and keeps that copy up to date; this one is the starting point.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm AS ytdlp

ARG TARGETARCH
ARG YTDLP_VERSION=2026.11.23

RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) asset=yt-dlp_linux ;; \
      arm64) asset=yt-dlp_linux_aarch64 ;; \
      *) echo "There is no yt-dlp build for $TARGETARCH." >&2; exit 1 ;; \
    esac; \
    base="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}"; \
    curl -fsSL --retry 3 -o /tmp/yt-dlp "$base/$asset"; \
    curl -fsSL --retry 3 -o /tmp/SHA2-256SUMS "$base/SHA2-256SUMS"; \
    expected="$(grep " ${asset}\$" /tmp/SHA2-256SUMS | cut -d' ' -f1)"; \
    echo "${expected}  /tmp/yt-dlp" | sha256sum -c -; \
    install -m 755 /tmp/yt-dlp /yt-dlp

############################################################
# Runtime stage
############################################################
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# ffmpeg joins a video's picture and sound, and makes the MP3s; tini cleans
# up after the processes yt-dlp starts.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg tini ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && command -v setpriv >/dev/null

WORKDIR /app

ENV NODE_ENV=production \
    PORT=5012 \
    DATA_DIR=/data \
    MEDIA_DIR=/media \
    YTDLP_BUNDLED=/opt/yt-dlp/yt-dlp

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/dist/client ./dist/client
COPY --from=ytdlp /yt-dlp /opt/yt-dlp/yt-dlp
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /data /media

# /data: the database, ScrapyTube's own yt-dlp, and downloads in progress (back it up).
# /media: where the videos and music are saved.
VOLUME ["/data", "/media"]
EXPOSE 5012

HEALTHCHECK --interval=60s --timeout=5s --start-period=60s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 5012) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

LABEL org.opencontainers.image.title="ScrapyTube" \
      org.opencontainers.image.description="Saves YouTube videos (MP4) and music (MP3) to a NAS, from a phone." \
      org.opencontainers.image.licenses="MIT"

# The server handles SIGTERM itself (stops the downloads, closes the database).
ENTRYPOINT ["tini", "--", "docker-entrypoint.sh"]
CMD ["node", "src/server/main.ts"]
