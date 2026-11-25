#!/usr/bin/env bash
# Builds the Docker image and exports it to scrapytube.tar, ready to load on the
# NAS (Portainer: Images → Import). See the README, "Building the image".
#
# Each build first bumps the patch version (1.0.0 → 1.0.1) in package.json, so
# every image carries its own version (shown in Settings). When the build
# succeeds, the bump is committed and pushed; when it fails, the previous
# version is put back.
#
# The image is built for an Intel/AMD NAS. For an ARM one:
#   PLATFORM=linux/arm64 yarn docker:build
set -euo pipefail
cd "$(dirname "$0")/.."

PLATFORM="${PLATFORM:-linux/amd64}"
VERSION_FILES=(package.json)

if ! git rev-parse --verify --quiet HEAD >/dev/null; then
  echo "This repository has no commits yet. Commit the project first: the build commits its version bump." >&2
  exit 1
fi
if ! git diff --quiet HEAD -- "${VERSION_FILES[@]}"; then
  echo "package.json has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and try again." >&2
  exit 1
fi

current=$(node -p "require('./package.json').version")
next=$(node -p "const [major, minor, patch] = '$current'.split('.').map(Number); [major, minor, patch + 1].join('.')")

node -e '
const fs = require("fs");
const [version, ...files] = process.argv.slice(1);
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, text.replace(/"version": "[^"]*"/, `"version": "${version}"`));
}' "$next" "${VERSION_FILES[@]}"

built=false
restore_version() {
  if [ "$built" = false ]; then
    git checkout -- "${VERSION_FILES[@]}"
    echo "Build failed: version left at $current." >&2
  fi
}
trap restore_version EXIT

echo "Building ScrapyTube ${next} for ${PLATFORM}…"
docker build --platform "$PLATFORM" -t scrapytube:latest .
docker save scrapytube:latest -o scrapytube.tar
docker rmi scrapytube:latest >/dev/null
built=true

git commit --quiet -m "Bump the version to $next" -- "${VERSION_FILES[@]}"
if git push --quiet; then
  echo "Built scrapytube.tar with ScrapyTube $next; the version bump is committed and pushed."
else
  echo "Built scrapytube.tar with ScrapyTube $next and committed the version bump, but the push failed. Push it yourself with: git push" >&2
  exit 1
fi
