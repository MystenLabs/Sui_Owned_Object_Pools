#!/bin/bash

# Get current admin's gascoins info
gascoins_info=$(sui client objects $ADMIN_ADDRESS | grep GasCoin)

# Extracting coinIds from the gascoin info
coinIds=()
while read -r line; do
    coinId=$(echo "$line" | awk '{print $1}')
    coinIds+=("$coinId")
done <<< "$gascoins_info"

# Merge all gas coins with the first one in the list
for ((i = 1; i < ${#coinIds[@]} ; i++)); do
    command="sui client merge-coin \
        --primary-coin ${coinIds[0]} \
        --coin-to-merge ${coinIds[i]} \
        --gas-budget 10000000"
    echo "Executing command: $command"
    eval "$command"
done
