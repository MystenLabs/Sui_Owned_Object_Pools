#!/bin/bash
source ../test/.env

if [[ -z "${ADMIN_ADDRESS}" ]]; then
  echo "Error - ADMIN_ADDRESS is not defined"  1>&2
  exit 1
fi

# Extracting coinIds from the gascoin info
gascoin_ids_array=()
for gascoinId in $(sui client objects "$ADMIN_ADDRESS" --json \
                    | jq -r '.[] | select(.data.content.type == "0x2::coin::Coin<0x2::sui::SUI>") | .data.objectId' ); do
  gascoin_ids_array+=("$gascoinId")
done

# Merge all gas coins with the first one in the list
for ((i = 1; i < ${#gascoin_ids_array[@]} ; i++)); do
    command="sui client merge-coin \
        --primary-coin ${gascoin_ids_array[0]} \
        --coin-to-merge ${gascoin_ids_array[i]} \
        --gas-budget 10000000"
    echo "Executing command: $command"
    eval "$command" > /dev/null 2>&1
done
