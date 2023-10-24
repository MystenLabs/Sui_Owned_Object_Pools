#!/bin/bash
source .env

echo "=== Tests setup script ==="
echo "Follow the instructions below to setup the test environment."
echo "When in doubt, just select 'yes'."

# Check if an argument was passed to the script.
if [ $# -eq 1 ]; then
    # The argument should be the network that the package will be published to.
    ../move_examples/setup/publish.sh "$1"
else
    # If no argument was passed, publish to the default network.
    ../move_examples/setup/publish.sh
fi

read -p "Reassure that Admin has at least 2 to make transactions? - a random coin will be split into 2 (y/n): " response
response=$(echo "$response" | tr '[:upper:]' '[:lower:]') # tolower
if [[ "$response" =~ ^(yes|y)$ ]]; then
    # Split a coin of the AdminAccount (i.e. the current active-address) so that you have at least 2 coins.
    COIN=$(sui client objects "$(sui client active-address)" --json | jq -r '.[] | select(.data.content.type == "0x2::coin::Coin<0x2::sui::SUI>") | .data.objectId' | head -n 1)
    sui client split-coin --coin-id $COIN --amounts 1000000000 --gas-budget 1000000000
    echo "Done!"
fi

read -p "Create a new TEST_USER_ADDRESS to $(sui client active-env)? (y/n): " response
response=$(echo "$response" | tr '[:upper:]' '[:lower:]') # tolower
if [[ "$response" =~ ^(yes|y)$ ]]; then
    NEW_ADDRESS_JSON=$(sui client new-address ed25519 --json)
    cat "TEST_USER_ADDRESS=$(echo "$NEW_ADDRESS_JSON" | jq -r '.address')">>.env
    SUI_AMOUNT=2000000000
    echo "Sending $SUI_AMOUNT to TEST_USER_ADDRESS: $TEST_USER_ADDRESS"
    COIN=$(sui client objects "$(sui client active-address)" --json | jq -r '.[] | select(.data.content.type == "0x2::coin::Coin<0x2::sui::SUI>") | .data.objectId' | head -n 1)
    sui client pay --recipients $TEST_USER_ADDRESS --amounts $SUI_AMOUNT --gas-budget 10000000 --input-coins $COIN
fi
