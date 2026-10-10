#!/usr/bin/env bash
# scripts/fund_testnet_account.sh
#
# Creates (or funds) a Stellar Testnet account using the Friendbot faucet.
# Intended for local development and CI — Testnet only.
#
# Usage:
#   ./scripts/fund_testnet_account.sh [--account <G... or identity-name>]
#
# If --account is an identity name (not a G-address), the script resolves it
# to the public key via `soroban keys address`.

set -euo pipefail

FRIENDBOT_URL="https://friendbot.stellar.org"
ACCOUNT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --account) ACCOUNT="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Resolve identity to public key if needed ──────────────────────────────────
if [[ -z "$ACCOUNT" ]]; then
  # Fall back to the default identity in the environment
  ACCOUNT="${LP_SUITE_IDENTITY:-}"
fi

if [[ -z "$ACCOUNT" ]]; then
  echo "ERROR: No account specified.  Pass --account <G-address | identity-name>" >&2
  echo "       or set LP_SUITE_IDENTITY in your environment." >&2
  exit 1
fi

# If it doesn't start with G, treat it as an identity name and resolve it.
if [[ "$ACCOUNT" != G* ]]; then
  echo "Resolving identity '$ACCOUNT' to public key..."
  ACCOUNT=$(soroban keys address "$ACCOUNT")
fi

# ── Fund via Friendbot ────────────────────────────────────────────────────────
echo "Requesting Testnet funds for $ACCOUNT..."
HTTP_STATUS=$(curl -s -o /tmp/friendbot_response.json -w "%{http_code}" \
  "$FRIENDBOT_URL?addr=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$ACCOUNT'))")")

if [[ "$HTTP_STATUS" == "200" ]]; then
  echo "✓ Account funded successfully."
  echo "  https://stellar.expert/explorer/testnet/account/$ACCOUNT"
else
  echo "ERROR: Friendbot returned HTTP $HTTP_STATUS" >&2
  cat /tmp/friendbot_response.json >&2
  exit 1
fi
