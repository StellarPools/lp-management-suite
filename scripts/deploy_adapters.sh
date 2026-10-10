#!/usr/bin/env bash
# scripts/deploy_adapters.sh
#
# Deploys the three pool adapters (soroswap, phoenix, generic_amm) and registers
# each one with the aggregator via its admin `register_pool` entry point.
#
# Usage:
#   ./scripts/deploy_adapters.sh \
#     --network testnet \
#     --source <identity> \
#     --aggregator <AGGREGATOR_CONTRACT_ID>
#
# The WASMs must be built first:
#   cd contracts && soroban contract build
#
# Environment variables (can also be set in .env):
#   LP_SUITE_NETWORK         — target network (default: testnet)
#   LP_SUITE_IDENTITY        — Soroban identity name
#   LP_SUITE_CONTRACT_ID     — deployed aggregator contract ID

set -euo pipefail

# ── Parse arguments ─────────────────────────────────────────────────────────
NETWORK="${LP_SUITE_NETWORK:-testnet}"
SOURCE="${LP_SUITE_IDENTITY:-}"
AGGREGATOR="${LP_SUITE_CONTRACT_ID:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)    NETWORK="$2";    shift 2 ;;
    --source)     SOURCE="$2";     shift 2 ;;
    --aggregator) AGGREGATOR="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────────────────────
if [[ -z "$SOURCE" ]]; then
  echo "ERROR: Deployer identity required.  Set LP_SUITE_IDENTITY or pass --source." >&2
  exit 1
fi
if [[ -z "$AGGREGATOR" ]]; then
  echo "ERROR: Aggregator contract ID required.  Set LP_SUITE_CONTRACT_ID or pass --aggregator." >&2
  exit 1
fi

WASM_DIR="contracts/target/wasm32-unknown-unknown/release"

deploy_adapter() {
  local ADAPTER_NAME="$1"
  local POOL_ID="$2"
  local WASM_FILE="$WASM_DIR/${ADAPTER_NAME}.wasm"

  if [[ ! -f "$WASM_FILE" ]]; then
    echo "ERROR: WASM not found: $WASM_FILE" >&2
    echo "       Run 'cd contracts && soroban contract build' first." >&2
    return 1
  fi

  echo "Deploying $ADAPTER_NAME..."
  ADAPTER_ID=$(soroban contract deploy \
    --wasm "$WASM_FILE" \
    --source "$SOURCE" \
    --network "$NETWORK")

  echo "  ✓ $ADAPTER_NAME deployed: $ADAPTER_ID"

  echo "  Registering $ADAPTER_NAME with aggregator as pool '$POOL_ID'..."
  soroban contract invoke \
    --id "$AGGREGATOR" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- \
    register_pool \
    --admin "$SOURCE" \
    --pool_id "$POOL_ID" \
    --adapter_address "$ADAPTER_ID"

  echo "  ✓ $ADAPTER_NAME registered as pool '$POOL_ID'"
  echo ""
}

echo "Deploying and registering adapters on $NETWORK..."
echo ""

deploy_adapter "soroswap_adapter"    "soroswap"
deploy_adapter "phoenix_adapter"     "phoenix"
deploy_adapter "generic_amm_adapter" "generic-amm"

echo "All adapters deployed and registered."
echo "Update your SDK config with the correct pool IDs shown above."
