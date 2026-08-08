# One image, one process: the server serves the client bundle it was built
# alongside, so there is nothing to wire together at deploy time.
#
# Hosts that build from source with their own buildpack do not need this file at
# all — `pnpm build` then `pnpm start` is the whole contract, and PORT comes
# from the environment. This is for the ones that want an image.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable

# Manifests first, so dependencies are only reinstalled when they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/cards/package.json      packages/cards/
COPY packages/engine/package.json     packages/engine/
COPY packages/protocol/package.json   packages/protocol/
COPY packages/bot/package.json        packages/bot/
COPY packages/client/package.json     packages/client/
COPY packages/server/package.json     packages/server/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# The server bundle inlines engine, cards and protocol and keeps socket.io
# external (packages/server/scripts/bundle.mjs), so that one package is the
# entire runtime dependency tree. Installed here with plain npm and no
# workspace, because a pnpm store full of symlinks does not survive a COPY —
# and the version is read from the real manifest so it cannot drift.
RUN mkdir /runtime && cd /runtime \
 && npm install --omit=dev --no-package-lock \
      socket.io@"$(node -p "require('/app/packages/server/package.json').dependencies['socket.io']")"


FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /runtime/node_modules            node_modules
COPY --from=build /app/packages/server/dist        packages/server/dist
COPY --from=build /app/packages/client/dist        packages/client/dist

# Ratings persist here. Mount a volume or point RATINGS_PATH somewhere durable —
# without one, every restart resets the leaderboard.
ENV RATINGS_PATH=/data/ratings.json
VOLUME /data

ENV PORT=8787
EXPOSE 8787
USER node
CMD ["node", "packages/server/dist/server.js"]
