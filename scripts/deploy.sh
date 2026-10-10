#!/usr/bin/env bash
# scripts/deploy.sh
#
# Deploys the aggregator contract to a Stellar network.
# Usage:
#   ./scripts/deploy.sh [--network <testnet|futurenet|mainnet>] [--source <identity>]
#
# Implements the deploy steps described in README.md "Deploying to Testnet" and
# "Deploying to Mainnet".  The WASM must be built first:
#   cd contracts && soroban contract build
#
# Environment variables (can also be set in .env):
#   LP_SUITE_NETWORK   — target network (default: testnet)
#   LP_SUITE_IDENTITY  — Soroban identity name to use as deployer

set -euo pipefail

# ── Parse arguments ─────────────────────────────────────────────────────────
NETWORK="${LP_SUITE_NETWORK:-testnet}"
SOURCE="${LP_SUITE_IDENTITY:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)
      NETWORK="$2"; shift 2 ;;
    --source)
      SOURCE="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────────────────────
if [[ -z "$SOURCE" ]]; then
  echo "ERROR: Deployer identity required.  Set LP_SUITE_IDENTITY or pass --source <identity>" >&2
  exit 1
fi

WASM="contracts/target/wasm32-unknown-unknown/release/aggregator.wasm"
if [[ ! -f "$WASM" ]]; then
  echo "ERROR: Aggregator WASM not found at $WASM" >&2
  echo "       Run 'cd contracts && soroban contract build' first." >&2
  exit 1
fi

# ── Mainnet safety gate ───────────────────────────────────────────────────────
if [[ "$NETWORK" == "mainnet" ]]; then
  echo "⚠  WARNING: Deploying to MAINNET."
  echo "   Per README, ensure you have:"
  echo "   1. Completed a third-party security audit"
  echo "   2. Staged rollout with deposit caps planned"
  echo "   3. Admin keys held in a multisig"
  echo ""
  read -r -p "Type 'yes' to confirm mainnet deployment: " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Aborted." >&2
    exit 1
  fi
fi

# ── Deploy ────────────────────────────────────────────────────────────────────
echo "Deploying aggregator to $NETWORK as $SOURCE..."

CONTRACT_ID=$(soroban contract deploy \
  --wasm "$WASM" \
  --source "$SOURCE" \
  --network "$NETWORK")

echo ""
echo "✓ Aggregator deployed successfully."
echo "  Contract ID: $CONTRACT_ID"
echo ""
echo "Next steps:"
echo "  1. Deploy adapters:   ./scripts/deploy_adapters.sh --network $NETWORK --source $SOURCE --aggregator $CONTRACT_ID"
echo "  2. Update LP_SUITE_CONTRACT_ID in your .env files"
