#!/usr/bin/env bash
# Fallback deployer: replicates contracts/script/DeployFirewall.s.sol using
# cast (one tx per step) with per-call retries for flaky RPC transports.
# Already-deployed contracts can be passed via env to resume:
#   REPUTATION=0x.. POLICIES=0x.. THREATS=0x.. SOLENGINE=0x.. FIREWALL=0x..
#
# Usage: RPC_URL=... [STYLUS_ENGINE=0x...] ./scripts/deploy-with-cast.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

RPC="${RPC_URL:?set RPC_URL}"
PK="$DEPLOYER_PRIVATE_KEY"
DEPLOYER=$(cast wallet address --private-key "$PK")
MIN_REPUTATION=100

retry() { # retry any command up to 6 times on failure
  local n=0
  until "$@"; do
    n=$((n + 1))
    [ $n -ge 6 ] && return 1
    sleep 3
  done
}

CHAIN_ID=$(retry cast chain-id --rpc-url "$RPC")

send() {
  retry cast send --private-key "$PK" --rpc-url "$RPC" --json "$@" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['status']=='0x1', d; print('ok', d['transactionHash'])"
}

ccall() { retry cast call --rpc-url "$RPC" "$@"; }

deploy() { # $1 = contract name, $2 = abi-encoded constructor args (optional)
  local name=$1
  local bytecode
  bytecode=$(python3 -c "import json; print(json.load(open('contracts/out/${name}.sol/${name}.json'))['bytecode']['object'])")
  local args="${2:-}"
  local code="$bytecode${args#0x}"
  retry cast send --private-key "$PK" --rpc-url "$RPC" --create "$code" --json \
    | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['status']=='0x1', d; print(d['contractAddress'])"
}

echo "deployer: $DEPLOYER  chain: $CHAIN_ID"

REPUTATION="${REPUTATION:-$(deploy ReputationRegistry)}"
echo "ReputationRegistry:      $REPUTATION"
POLICIES="${POLICIES:-$(deploy RiskPolicyRegistry)}"
echo "RiskPolicyRegistry:      $POLICIES"
THREATS="${THREATS:-$(deploy ThreatSignatureRegistry)}"
echo "ThreatSignatureRegistry: $THREATS"
SOLENGINE="${SOLENGINE:-$(deploy RiskEngineSolidity)}"
echo "RiskEngineSolidity:      $SOLENGINE"

if [ -z "${FIREWALL:-}" ]; then
  FW_ARGS=$(cast abi-encode "c(address,address,address,uint256)" "$REPUTATION" "$POLICIES" "$THREATS" "$MIN_REPUTATION")
  FIREWALL=$(deploy ArbiGuardFirewall "$FW_ARGS")
fi
echo "ArbiGuardFirewall:       $FIREWALL"

ENGINE="${STYLUS_ENGINE:-$SOLENGINE}"
echo "risk engine in use:      $ENGINE"

# pool addresses must match DeployFirewall.s.sol: keccak256 of the demo labels
POOL_A=$(cast keccak "arbiguard.demo.rwa-pool-alpha"); POOL_A=0x${POOL_A:26:40}
POOL_B=$(cast keccak "arbiguard.demo.rwa-pool-beta");  POOL_B=0x${POOL_B:26:40}
echo "demo pool A:             $POOL_A"
echo "demo pool B:             $POOL_B"

echo "-- wiring --"
send "$THREATS" "setPublisher(address,bool)" "$FIREWALL" true
send "$POLICIES" "setConsumer(address,bool)" "$FIREWALL" true
send "$FIREWALL" "setRiskEngine(address)" "$ENGINE"
AGENT_ID=$(ccall "$REPUTATION" "agentIdOf(address)(uint256)" "$DEPLOYER")
if [ "$AGENT_ID" = "0" ]; then
  send "$REPUTATION" "newAgent(string,address)" "guard.arbiguard.eth" "$DEPLOYER"
  AGENT_ID=$(ccall "$REPUTATION" "agentIdOf(address)(uint256)" "$DEPLOYER")
fi
echo "agent id: $AGENT_ID"
send "$REPUTATION" "acceptFeedback(uint256,int256)" "$AGENT_ID" 150
send "$FIREWALL" "registerPool(address)" "$POOL_A"
send "$FIREWALL" "registerPool(address)" "$POOL_B"
send "$POLICIES" "setRiskOfficer(address,address)" "$POOL_A" "$DEPLOYER"
send "$POLICIES" "setRiskOfficer(address,address)" "$POOL_B" "$DEPLOYER"

register_policy() { # $1 = pool
  local pool=$1
  local nonce deadline
  nonce=$(ccall "$POLICIES" "nonces(address)(uint256)" "$pool")
  deadline=$(( $(date +%s) + 31536000 ))
  local policy="($pool,31,61,2,20,1000000000000000000000,$nonce,$deadline)"
  local digest sig
  digest=$(ccall "$POLICIES" "hashPolicy((address,uint16,uint16,uint32,uint32,uint256,uint256,uint256))(bytes32)" "$policy")
  sig=$(cast wallet sign --no-hash --private-key "$PK" "$digest")
  send "$POLICIES" "registerPolicy((address,uint16,uint16,uint32,uint32,uint256,uint256,uint256),bytes)" "$policy" "$sig"
}
register_policy "$POOL_A"
register_policy "$POOL_B"

mkdir -p deployments
cat > "deployments/${CHAIN_ID}.json" <<EOF
{
  "chainId": $CHAIN_ID,
  "reputationRegistry": "$REPUTATION",
  "riskPolicyRegistry": "$POLICIES",
  "threatSignatureRegistry": "$THREATS",
  "riskEngineSolidity": "$SOLENGINE",
  "riskEngine": "$ENGINE",
  "firewall": "$FIREWALL",
  "agent": "$DEPLOYER",
  "poolA": "$POOL_A",
  "poolB": "$POOL_B"
}
EOF
echo "wrote deployments/${CHAIN_ID}.json"
