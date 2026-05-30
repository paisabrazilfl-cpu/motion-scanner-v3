FROM node:24-slim AS builder

RUN npm install -g pnpm@10.26.1

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY scripts/ ./scripts/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY artifacts/motion-scanner/ ./artifacts/motion-scanner/
COPY attached_assets/ ./attached_assets/

RUN pnpm install --frozen-lockfile

RUN pnpm run typecheck:libs

# Public Clerk publishable key (safe to embed — it ships in the client bundle).
# Render passes the same-named env var as a build arg when present, which overrides this default.
ARG VITE_CLERK_PUBLISHABLE_KEY="pk_test_cmVndWxhci1tb25rZmlzaC04OC5jbGVyay5hY2NvdW50cy5kZXYk"
ENV BASE_PATH=/ \
    PORT=3000 \
    NODE_ENV=production \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

RUN pnpm --filter @workspace/motion-scanner run build

RUN pnpm --filter @workspace/api-server run build

FROM node:24-slim AS runtime

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
