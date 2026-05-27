#!/bin/bash
set -e

pnpm install --frozen-lockfile
pnpm --filter db push

# ── Auto-sync to GitHub ───────────────────────────────────────────────────────
# PAT lives in .local/.github-remote-url (gitignored, Replit-local).
# A failed push is logged but never fails the post-merge setup.
REMOTE_URL_FILE="$(git rev-parse --show-toplevel)/.local/.github-remote-url"
if [ -f "$REMOTE_URL_FILE" ]; then
  REMOTE_URL=$(tr -d '[:space:]' < "$REMOTE_URL_FILE")
  if [ -n "$REMOTE_URL" ]; then
    echo "[github-sync] Pushing to GitHub..."
    if git push "$REMOTE_URL" HEAD:main 2>&1; then
      echo "[github-sync] OK — $(date '+%Y-%m-%d %H:%M:%S')"
    else
      echo "[github-sync] WARNING: push failed (token expired?). Run: bash scripts/sync-github.sh"
    fi
  fi
fi
