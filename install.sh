#!/usr/bin/env bash
# Root entrypoint for the ZeroClaw installer. Canonical script: scripts/install.sh
#
# From a git checkout, this delegates to scripts/install.sh (same flags).
# When this file is piped from curl (legacy .../install.sh URLs), we fetch
# scripts/install.sh from raw.githubusercontent.com so one-liners keep working.
set -euo pipefail

__src="${BASH_SOURCE[0]:-}"
if [[ -n "$__src" && "$__src" != /dev/fd/* && -f "$__src" ]]; then
  __root="$(cd "$(dirname "$__src")" && pwd)"
  exec bash "$__root/scripts/install.sh" "$@"
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl is required to run this installer from a URL. Clone the repo and run: bash scripts/install.sh" >&2
  exit 1
fi

: "${ZEROCLAW_INSTALLER_URL:=https://raw.githubusercontent.com/morpheum-labs/zeroclaw/master/scripts/install.sh}"
exec bash <(curl -fsSL "$ZEROCLAW_INSTALLER_URL") "$@"
