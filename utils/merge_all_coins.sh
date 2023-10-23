#!/bin/bash

# Run the command and store the output in a variable
input_data=$(sui client objects 0x1dbd03ee8b78f826ddecedbd1295feb51eb7029b158f5be408f4cd232117ac36 | grep GasCoin)

# Extracting coinIds and constructing the command
coinIds=()
while read -r line; do
    coinId=$(echo "$line" | awk '{print $1}')
    coinIds+=("$coinId")
done <<< "$input_data"

# Constructing the command with the coinIds array
for ((i = 1; i < ${#coinIds[@]} - 1; i++)); do
    command="sui client merge-coin --primary-coin ${coinIds[0]} --coin-to-merge ${coinIds[i]} --gas-budget 10000000"
    echo "Executing command: $command"
    eval "$command"
done
