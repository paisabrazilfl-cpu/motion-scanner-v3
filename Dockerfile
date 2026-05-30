FROM node:24-slim AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY scripts/ ./scripts/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY artifacts/motion-scanner/ ./artifacts/motion-scanner/
COPY attached_assets/ ./attached_assets/

RUN pnpm install --frozen-lockfile

RUN pnpm run typecheck:libs

ARG VITE_CLERK_PUBLISHABLE_KEY=""
ENV BASE_PATH=/ \
    PORT=3000 \
    NODE_ENV=production \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

RUN pnpm --filter @workspace/motion-scanner run build

RUN pnpm --filter @workspace/api-server run build

FROM node:24-slim AS runtime

RUN corepack enable

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY --from=builder /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/motion-scanner/dist/public ./artifacts/motion-scanner/dist/public

ENV NODE_ENV=production \
    PORT=8080 \
    FRONTEND_DIST=/app/artifacts/motion-scanner/dist/public

EXPOSE 8080

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
