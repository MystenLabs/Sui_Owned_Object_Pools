#!/bin/bash
source .env

# Check if an argument was passed to the script.
if [ $# -eq 1 ]; then
    # The argument should be the network that the package will be published to.
    ../move_examples/setup/publish.sh "$1"
else
    # If no argument was passed, publish to the default network.
    ../move_examples/setup/publish.sh
fi

read -p "Create a new TEST_USER_ADDRESS to $(sui client active-env)? (y/n): " response
response=$(echo "$response" | tr '[:upper:]' '[:lower:]') # tolower
if ! [[ "$response" =~ ^(yes|y)$ ]]; then
    echo "Not creating TEST_USER_ADDRESS"
    exit 1
fi

NEW_ADDRESS_JSON=$(sui client new-address ed25519 --json)
cat >>.env <<-TEST_USER_ENV
TEST_USER_ADDRESS=$(echo "$NEW_ADDRESS_JSON" | jq -r '.address')
TEST_USER_ENV

SUI_AMOUNT=2000000000
echo "Sending $SUI_AMOUNT to TEST_USER_ADDRESS: $TEST_USER_ADDRESS"
COIN=$(sui client objects $(sui client active-address) --json | jq -r '.[] | select(.data.content.type == "0x2::coin::Coin<0x2::sui::SUI>") | .data.objectId' | head -n 1)
sui client pay --recipients $TEST_USER_ADDRESS --amounts $SUI_AMOUNT --gas-budget 10000000 --input-coins $COIN
