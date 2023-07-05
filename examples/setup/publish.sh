#!/bin/bash

# check dependencies are available.
for i in jq sui; do
  if ! command -V ${i} 2>/dev/null; then
    echo "${i} is not installed"
    exit 1
  fi
done

# default network is localnet
NETWORK=http://localhost:9000
FAUCET=https://localhost:9000/gas

# If otherwise specified chose testnet or devnet
if [ $# -ne 0 ]; then
 if [ $1 = "mainnet" ]; then
    NETWORK="https://fullnode.mainnet.sui.io:443"
  fi
  if [ $1 = "testnet" ]; then
    NETWORK="https://fullnode.testnet.sui.io:443"
    FAUCET="https://faucet.testnet.sui.io/gas"
  fi
  if [ $1 = "devnet" ]; then
    NETWORK="https://fullnode.devnet.sui.io:443"
    FAUCET="https://faucet.devnet.sui.io/gas"
  fi
fi

publish_res=$(sui client publish --gas-budget 200000000 --json ../move_project/my_heroes --skip-dependency-verification)

echo ${publish_res} >.publish.res.json

if [[ "$publish_res" =~ "error" ]]; then
  # If yes, print the error message and exit the script
  echo "Error during move contract publishing.  Details : $publish_res"
  exit 1
fi
echo "Contract Deployment finished!"

echo "Setting up environmental variables..."

DIGEST=$(echo "${publish_res}" | jq -r '.digest')
PACKAGE_ID=$(echo "${publish_res}" | jq -r '.effects.created[] | select(.owner == "Immutable").reference.objectId')
newObjs=$(echo "$publish_res" | jq -r '.objectChanges[] | select(.type == "created")')
ADMIN_CAP_ID=$(echo "$newObjs" | jq -r 'select (.objectType | contains("::genesis::AdminCap")).objectId')
PUBLISHER_ID=$(echo "$newObjs" | jq -r 'select (.objectType | contains("::Publisher")).objectId')
UPGRADE_CAP_ID=$(echo "$newObjs" | jq -r 'select (.objectType | contains("::package::UpgradeCap")).objectId')


cat >.env <<-API_ENV
SUI_NETWORK=$NETWORK
DIGEST=$DIGEST
UPGRADE_CAP_ID=$UPGRADE_CAP_ID
PACKAGE_ID=$PACKAGE_ID
ADMIN_CAP_ID=$ADMIN_CAP_ID
PUBLISHER_ID=$PUBLISHER_ID
ADMIN_PHRASE=$ADMIN_PHRASE
ADMIN_ADDRESS=$ADMIN_ADDRESS
NON_CUSTODIAN_ADDRESS=$NON_CUSTODIAN_ADDRESS
API_ENV

# echo "Waiting for Fullnode to sync..."
# sleep 5

# echo "Installing dependencies..."

# npm install

# echo "Setting up Display..."
# npm start 
