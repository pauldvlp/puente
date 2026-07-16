# syntax=docker/dockerfile:1

# ---- build stage: compile the SPA + server and pack a self-contained tarball ----
FROM node:20-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm build \
 && cd apps/server \
 && npm pack --pack-destination /tmp

# ---- runtime stage: install the tarball globally, run as the `puente` CLI ----
FROM node:20-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUENTE_DATA_DIR=/data \
    PUENTE_PORT=5006

# All persistent state (SQLite DB, encryption key, managed SSH keys) lives here.
RUN mkdir -p /data
VOLUME /data

COPY --from=build /tmp/puente-*.tgz /tmp/
RUN npm install -g /tmp/puente-*.tgz && rm /tmp/puente-*.tgz

EXPOSE 5006
# --no-open: never try to launch a browser inside the container.
ENTRYPOINT ["puente"]
CMD ["start", "--host", "0.0.0.0", "--no-open"]
