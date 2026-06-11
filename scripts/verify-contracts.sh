#!/usr/bin/env bash
# Verify the deployed stack on a Blockscout instance (keyless).
# Usage: VERIFIER_URL=https://arbitrum-sepolia.blockscout.com/api CHAIN_ID=421614 ./scripts/verify-contracts.sh deployments/421614.json
set -uo pipefail
cd "$(dirname "$0")/../contracts"

DEPLOYMENT="${1:?usage: verify-contracts.sh deployments/<chainid>.json}"
VERIFIER_URL="${VERIFIER_URL:?set VERIFIER_URL}"
CHAIN_ID="${CHAIN_ID:?set CHAIN_ID}"

get() { python3 -c "import json;print(json.load(open('../$DEPLOYMENT'))['$1'])"; }

REPUTATION=$(get reputationRegistry)
POLICIES=$(get riskPolicyRegistry)
THREATS=$(get threatSignatureRegistry)
SOLENGINE=$(get riskEngineSolidity)
FIREWALL=$(get firewall)

verify() { # $1 address, $2 path:name, $3 constructor args (optional)
  local extra=()
  [ -n "${3:-}" ] && extra=(--constructor-args "$3")
  for i in 1 2 3 4 5; do
    if forge verify-contract "$1" "$2" --verifier blockscout --verifier-url "$VERIFIER_URL" --chain-id "$CHAIN_ID" --watch "${extra[@]}" 2>&1 | tail -4; then
      return 0
    fi
    echo "retry $i for $2"; sleep 5
  done
  return 1
}

verify "$REPUTATION" src/ReputationRegistry.sol:ReputationRegistry
verify "$POLICIES" src/RiskPolicyRegistry.sol:RiskPolicyRegistry
verify "$THREATS" src/ThreatSignatureRegistry.sol:ThreatSignatureRegistry
verify "$SOLENGINE" src/RiskEngineSolidity.sol:RiskEngineSolidity
FW_ARGS=$(cast abi-encode "constructor(address,address,address,uint256)" "$REPUTATION" "$POLICIES" "$THREATS" 100)
verify "$FIREWALL" src/ArbiGuardFirewall.sol:ArbiGuardFirewall "$FW_ARGS"
