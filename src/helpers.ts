import { SuiClient } from '@mysten/sui.js/client';
import { SuiObjectRef, SuiObjectResponse } from '@mysten/sui.js/client/';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';

import { Level, logger } from './logger';

/**
 * Checks if an object is "Immutable" by looking up its data on the blockchain.
 * @param objectId - The ID of the object to check.
 * @param client - The SuiClient instance to use for the API request.
 * @returns A Promise that resolves to a boolean indicating whether the object is owned by an "Immutable" owner.
 * @throws An error if the "owner" field of the object cannot be extracted.
 */
export async function isImmutable(objectId: string, client: SuiClient) {
  const obj = await client.getObject({
    id: objectId,
    options: {
      showOwner: true,
    },
  });
  const objectOwner = obj?.data?.owner;
  if (!objectOwner) {
    throw new Error(`Could not extract "owner" field of object ${objectId}`);
  }
  return objectOwner == 'Immutable';
}

/**
 * Checks if the given object type is a coin.
 * Defaults to checking if the object type is a SUI (gas) coin.
 * @param objectType The object type to check.
 * @param ofType The expected object type.
 * @returns True if the object type is a coin, false otherwise.
 */
export function isCoin(
  objectType: string,
  ofType = '0x2::coin::Coin<0x2::sui::SUI>',
) {
  return objectType === ofType;
}
