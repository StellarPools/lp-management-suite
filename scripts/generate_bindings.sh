#!/usr/bin/env bash
# scripts/generate_bindings.sh
#
# Regenerates TypeScript bindings from deployed contract specs using
# `soroban contract bindings typescript`.
#
# Per README "Project Structure", these bindings live in sdk/ and let the SDK
# call contracts with fully-typed interfaces instead of raw XDR.
#
# Usage:
#   ./scripts/generate_bindings.sh \
#     --network testnet \
#     --aggregator <AGGREGATOR_CONTRACT_ID> \
#     [--output sdk/src/generated]
#
# Prerequisites:
#   - soroban-cli installed (cargo install --locked soroban-cli)
#   - A deployed aggregator contract on the target network

set -euo pipefail

# ── Parse arguments ─────────────────────────────────────────────────────────
NETWORK="${LP_SUITE_NETWORK:-testnet}"
AGGREGATOR="${LP_SUITE_CONTRACT_ID:-}"
OUTPUT="sdk/src/generated"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)    NETWORK="$2";    shift 2 ;;
    --aggregator) AGGREGATOR="$2"; shift 2 ;;
    --output)     OUTPUT="$2";     shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────────────────────
if [[ -z "$AGGREGATOR" ]]; then
  echo "ERROR: Aggregator contract ID required.  Set LP_SUITE_CONTRACT_ID or pass --aggregator." >&2
  exit 1
fi

# ── Generate bindings ─────────────────────────────────────────────────────────
echo "Generating TypeScript bindings from $AGGREGATOR on $NETWORK..."

mkdir -p "$OUTPUT"

soroban contract bindings typescript \
  --network "$NETWORK" \
  --contract-id "$AGGREGATOR" \
  --output-dir "$OUTPUT/aggregator"

echo "✓ Bindings written to $OUTPUT/aggregator"
echo ""
echo "Re-run 'npm run build' in sdk/ to pick up the updated types."
