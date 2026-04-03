#!/usr/bin/env bash
set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  printf 'hookify install-codex requires git\n' >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  printf 'hookify install-codex requires bun\n' >&2
  exit 1
fi

home_dir="${HOME:?}"
hookify_home="${HOOKIFY_HOME:-$home_dir/.local/share/hookify}"
repo_ref="${HOOKIFY_REPO_REF:-main}"
repo_url="${HOOKIFY_REPO_URL:-https://github.com/jasonkuhrt/hookify.git}"
repo_dir="${HOOKIFY_REPO_DIR:-$hookify_home/repo}"

if [ -z "${HOOKIFY_REPO_DIR:-}" ]; then
  mkdir -p "$(dirname "$repo_dir")"

  if [ -d "$repo_dir/.git" ]; then
    git -C "$repo_dir" fetch --depth 1 origin "$repo_ref"
    git -C "$repo_dir" reset --hard FETCH_HEAD
  else
    rm -rf "$repo_dir"
    git clone --depth 1 --branch "$repo_ref" "$repo_url" "$repo_dir"
  fi
fi

cd "$repo_dir"
bun install --frozen-lockfile
HOOKIFY_REPO_DIR="$repo_dir" bun run ./scripts/install-codex.ts
