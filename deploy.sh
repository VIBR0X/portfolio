#!/usr/bin/env bash
# Build and deploy the portfolio to Cloudflare Pages.
#
# Usage: ./deploy.sh [--preview]
#   (no args)   production  -> https://<project>.pages.dev (and any custom domain)
#   --preview   preview branch
#
# First run: `wrangler login`, then `wrangler pages project create vedant-portfolio`.
set -euo pipefail
cd "$(dirname "$0")"

PROJECT="${PAGES_PROJECT:-vedant-portfolio}"
BRANCH="main"
[[ "${1:-}" == "--preview" ]] && BRANCH="preview"

npm run build

echo "Files to upload:"
find dist -type f | sed 's|^|  |'

npx wrangler pages deploy dist --project-name "$PROJECT" --branch "$BRANCH"
