#!/usr/bin/env bash
# Deploys the ArbiGuard stack to Arbitrum Sepolia and Robinhood Chain testnet.
#
#   Arbitrum Sepolia : Stylus RiskEngine (cargo stylus deploy) + firewall stack
#   Robinhood Chain  : firewall stack with the Solidity reference engine
#
# Requires DEPLOYER_PRIVATE_KEY funded on both chains (see .env).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

ARB_SEPOLIA_RPC="${ARBITRUM_SEPOLIA_RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
ROBINHOOD_RPC="${ROBINHOOD_TESTNET_RPC_URL:-https://rpc.testnet.chain.robinhood.com}"
DEPLOYER_ADDR=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")

echo "deployer: $DEPLOYER_ADDR"
echo "  arbitrum sepolia balance: $(cast balance "$DEPLOYER_ADDR" --rpc-url "$ARB_SEPOLIA_RPC") wei"
echo "  robinhood testnet balance: $(cast balance "$DEPLOYER_ADDR" --rpc-url "$ROBINHOOD_RPC") wei"

# ── 1. Stylus RiskEngine on Arbitrum Sepolia ────────────────────────────────
echo
echo "=== [1/3] cargo stylus deploy → Arbitrum Sepolia ==="
pushd contracts-stylus >/dev/null
DEPLOY_LOG=$(cargo stylus deploy \
  --endpoint "$ARB_SEPOLIA_RPC" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --no-verify 2>&1 | tee /dev/stderr)
popd >/dev/null
STYLUS_ENGINE=$(echo "$DEPLOY_LOG" | sed -E 's/\x1b\[[0-9;]*m//g' | grep -iE "deployed code.*0x[a-fA-F0-9]{40}" | grep -oE "0x[a-fA-F0-9]{40}" | head -1)
echo "stylus risk engine: $STYLUS_ENGINE"

# sanity: on-chain Radiant replay score must be 73
SCORE=$(cast call "$STYLUS_ENGINE" "score(uint256[]) (uint256)" "[1,1150000,980000,0,4,0,1,1]" --rpc-url "$ARB_SEPOLIA_RPC")
echo "stylus score(radiant features) = $SCORE (expected 73)"

# ── 2. Firewall stack on Arbitrum Sepolia ───────────────────────────────────
echo
echo "=== [2/3] firewall stack → Arbitrum Sepolia (verify: Blockscout) ==="
(cd contracts && STYLUS_ENGINE="$STYLUS_ENGINE" forge script script/DeployFirewall.s.sol:DeployFirewall \
  --rpc-url "$ARB_SEPOLIA_RPC" --broadcast \
  --verify --verifier blockscout --verifier-url https://arbitrum-sepolia.blockscout.com/api)

# ── 3. Firewall stack on Robinhood Chain testnet ────────────────────────────
echo
echo "=== [3/3] firewall stack → Robinhood Chain testnet (verify: Blockscout) ==="
(cd contracts && forge script script/DeployFirewall.s.sol:DeployFirewall \
  --rpc-url "$ROBINHOOD_RPC" --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api)

echo
echo "=== deployments ==="
for f in deployments/421614.json deployments/46630.json; do
  [ -f "$f" ] && echo "--- $f ---" && cat "$f"
done
