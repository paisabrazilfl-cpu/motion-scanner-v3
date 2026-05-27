#!/bin/bash
# Manual GitHub sync — push current main branch to the STOCKVAULT GitHub repo.
# Run this any time with: bash scripts/sync-github.sh
#
# The PAT lives in .local/.github-remote-url (gitignored, Replit-local).
# To update the PAT: edit that file with your new token.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
REMOTE_URL_FILE="$REPO_ROOT/.local/.github-remote-url"
LOG_FILE="$REPO_ROOT/.local/github-sync.log"

if [ ! -f "$REMOTE_URL_FILE" ]; then
  echo "[github-sync] ERROR: $REMOTE_URL_FILE not found."
  echo "  Create it with one line: https://x-access-token:<PAT>@github.com/<owner>/<repo>.git"
  exit 1
fi

REMOTE_URL=$(tr -d '[:space:]' < "$REMOTE_URL_FILE")

if [ -z "$REMOTE_URL" ]; then
  echo "[github-sync] ERROR: $REMOTE_URL_FILE is empty."
  exit 1
fi

echo "[github-sync] Pushing to GitHub..."
if git push "$REMOTE_URL" HEAD:main 2>&1 | tee -a "$LOG_FILE"; then
  echo "[github-sync] Done. $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
else
  echo "[github-sync] Push failed — check $LOG_FILE for details."
  exit 1
fi
