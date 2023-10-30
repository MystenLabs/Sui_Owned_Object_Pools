// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
  OwnedObjectRef,
  SuiClient,
  SuiTransactionBlockResponse,
} from '@mysten/sui.js/client';
import { Keypair } from '@mysten/sui.js/cryptography';
import {
  CoinStruct,
  PaginatedCoins,
} from '@mysten/sui.js/dist/cjs/client/types/';
import { Coin } from '@mysten/sui.js/dist/cjs/framework/framework';
import { getObjectReference } from '@mysten/sui.js/dist/cjs/types';
import { PaginatedObjectsResponse } from '@mysten/sui.js/src/client/types';
import { MoveStruct } from '@mysten/sui.js/src/client/types/generated';
import {
  SuiObjectRef,
  SuiObjectResponse,
} from '@mysten/sui.js/src/types/objects';
import {
  ExecuteTransactionRequestType,
  SuiTransactionBlockResponseOptions,
} from '@mysten/sui.js/src/types/transactions';
import { TransactionBlock } from '@mysten/sui.js/transactions';
type PoolObjectsMap = Map<string, SuiObjectRef>; // Map<objectId, object>
type PoolCoinsMap = Map<string, CoinStruct>; // Map<coinObjectId, coin>

export class Pool {
  private _keypair: Keypair;
  private _objects: PoolObjectsMap;
  private _coins: PoolCoinsMap;

  private constructor(
    keypair: Keypair,
    objects: PoolObjectsMap,
    coins: PoolCoinsMap,
  ) {
    this._keypair = keypair;
    this._objects = objects;
    this._coins = coins;
  }

  static async full(input: { keypair: Keypair; client: SuiClient }) {
    const { keypair, client } = input;
    const owner = keypair.toSuiAddress();

    // Get all objects owned by the pool's creator
    const objects: PoolObjectsMap = new Map();
    let resp: PaginatedObjectsResponse | null;
    let cursor = null;
    do {
      resp = await client.getOwnedObjects({ owner, cursor });
      resp.data.forEach((obj: SuiObjectResponse) => {
        const objectReference = getObjectReference(obj);
        if (objectReference) {
          objects.set(objectReference.objectId, objectReference);
        }
      });
      cursor = resp?.nextCursor;
    } while (resp.hasNextPage);

    // Get all coins owned by the pool's creator
    const coins: PoolCoinsMap = new Map();
    let coins_resp: PaginatedCoins | null;
    cursor = null;
    do {
      coins_resp = await client.getAllCoins({ owner, cursor });
      coins_resp.data.forEach((coin: CoinStruct) => {
        coins.set(coin.coinObjectId, coin);
      });
      cursor = coins_resp?.nextCursor;
    } while (coins_resp.hasNextPage);

    return new Pool(keypair, objects, coins);
  }

  /**
   * Split off a new Pool from this Pool using `pred_obj` to determine how
   * the objects are split, and `pred_coins` to determine how the coins are.
   * @splitStrategy the strategy used to split the pool's objects and coins
   * @returns the new Pool with the objects and coins that were split off
   */
  split(splitStrategy: SplitStrategy = new DefaultSplitStrategy()): Pool {
    const objects_to_give: PoolObjectsMap = this.splitObjects(splitStrategy);
    const coins_to_give: PoolCoinsMap = this.splitCoins(splitStrategy);

    return new Pool(this._keypair, objects_to_give, coins_to_give);
  }

  /**
   * Splits off the pool's objects map into two new maps. One for the current pool
   * (the ones with the objects to keep), and one for the new pool (the ones to give).
   * @param splitStrategy determines how the split will be done
   * @returns the map of objects that will be assigned to the new pool
   */
  splitObjects(splitStrategy: SplitStrategy): PoolObjectsMap {
    const objects_to_keep: PoolObjectsMap = new Map();
    const objects_to_give: PoolObjectsMap = new Map();

    // Transform the map into an array of key-value pairs. It's easier to iterate.
    const objects_array = Array.from(this._objects, ([objectId, object]) => ({
      objectId,
      object,
    }));
    outside: while (objects_array.length !== 0) {
      const last_object_in_array = objects_array.at(-1)?.object;
      switch (splitStrategy.objPred(last_object_in_array)) {
        case true: {
          // Predicate returned true, so we move the object to the new pool
          const obj_give = objects_array.pop();
          if (obj_give === undefined) {
            break;
          }
          objects_to_give.set(obj_give.objectId, obj_give.object);
          break;
        }
        case false: {
          // Predicate returned false, so we keep the object in the current pool
          const obj_keep = objects_array.pop();
          if (obj_keep === undefined) {
            break;
          }
          objects_to_keep.set(obj_keep.objectId, obj_keep.object);
          continue;
        }
        case null: {
          // The predicate returned null, so we stop the split, and keep
          // all the remaining objects of the array in the current pool.
          objects_array.forEach((obj) => {
            objects_to_keep.set(obj.objectId, obj.object);
          });
          break outside;
        }
      }
    }
    this._objects = objects_to_keep;
    return objects_to_give;
  }

  /**
   * Splits off the pool's coins map into two new maps. One for the current pool
   * (the ones with the coins to keep), and one for the new pool (the ones to give).
   * @param splitStrategy determines how the split will be done
   * @returns the map of coins that will be assigned to the new pool
   */
  splitCoins(splitStrategy: SplitStrategy): PoolCoinsMap {
    const coins_to_keep: PoolCoinsMap = new Map();
    const coins_to_give: PoolCoinsMap = new Map();

    // Transform the map into an array of key-value pairs. It's easier to iterate.
    const coins_array = Array.from(this._coins, ([coinObjectId, coin]) => ({
      coinObjectId,
      coin,
    }));
    outside: while (coins_array.length !== 0) {
      const last_coin_in_array = coins_array.at(-1)?.coin;
      switch (splitStrategy.coinPred(last_coin_in_array)) {
        case true: {
          // Predicate returned true, so we move the coin to the new pool
          const coin_give = coins_array.pop();
          if (coin_give === undefined) {
            break;
          }
          coins_to_give.set(coin_give.coinObjectId, coin_give.coin);
          break;
        }
        case false: {
          // Predicate returned false, so we keep the coin in the current pool
          const coin_keep = coins_array.pop();
          if (coin_keep === undefined) {
            break;
          }
          coins_to_keep.set(coin_keep.coinObjectId, coin_keep.coin);
          continue;
        }
        case null:
          // The predicate returned null, so we stop the split, and keep
          // all the remaining coins of the array in the current pool.
          coins_array.forEach((coin) => {
            coins_to_keep.set(coin.coinObjectId, coin.coin);
          });
          break outside;
      }
    }
    this._coins = coins_to_keep;
    return coins_to_give;
  }

  /*
  Merges the current pool with another pool.
   */
  public merge(poolToMerge: Pool) {
    this._objects = new Map([...this._objects, ...poolToMerge.objects]);
    this._coins = new Map([...this._coins, ...poolToMerge.coins]);
  }

  async signAndExecuteTransactionBlock(input: {
    client: SuiClient;
    transactionBlock: TransactionBlock;
    options?: SuiTransactionBlockResponseOptions;
    requestType?: ExecuteTransactionRequestType;
  }): Promise<SuiTransactionBlockResponse> {
    const { transactionBlock, options, requestType } = input;

    // (1). Check object ownership
    transactionBlock.setSender(this.keypair.getPublicKey().toSuiAddress());
    if (!(await this.checkTotalOwnership(transactionBlock, input.client))) {
      throw new Error(
        "All objects of the transaction block must be owned by the pool's creator.",
      );
    }

    /*
    (2). Select Gas: Use all the coins in the pool as gas payment.
    When each pool uses only its own coins, transaction blocks can be executed
    without interfering with one another, avoiding equivocation.
    */
    // Get the coins from the pool
    const coinsArray = Array.from(this._coins.values()).filter(
      (coin) => Coin.getCoinSymbol(coin.coinType) === 'SUI'
    );
    const NoSuiCoinFound = coinsArray.length === 0;
    if (NoSuiCoinFound) {
      throw new Error('No SUI coins in the pool to use as gas payment.');
    }
    // Cast CoinStructs to SuiObjectRefs to use them as params in txb.setGasPayment(...)
    const objectRefCoins: SuiObjectRef[] = coinsArray.map((coin) => {
      return {
        digest: coin.digest,
        objectId: coin.coinObjectId,
        version: coin.version,
      };
    });
    // Finally set the gas payment to be done by the selected coins
    transactionBlock.setGasPayment(objectRefCoins);

    /*
    (2.5). Dry run the transaction block to ensure that Pool has enough
     resources to run the transaction and also to get required budget
     */
    const dryRunRes = await input.client.dryRunTransactionBlock({
      transactionBlock: await transactionBlock.build({ client: input.client }),
    });
    if (dryRunRes.effects.status.status !== 'success') {
      throw new Error(`Dry run failed. ${dryRunRes.effects.status.error}`);
    }

    // (3). Run the transaction
    const res = await input.client.signAndExecuteTransactionBlock({
      transactionBlock,
      requestType,
      options: { ...options, showEffects: true },
      signer: this._keypair,
    });

    const created = res.effects?.created;
    const unwrapped = res.effects?.unwrapped;
    const mutated = res.effects?.mutated;

    // (4). Update the pool's objects and coins
    await this.updatePool(created, input.client);
    await this.updatePool(unwrapped, input.client);
    await this.updatePool(mutated, input.client);

    return res;
  }

  private async updatePool(
    newRefs: OwnedObjectRef[] | undefined,
    client: SuiClient,
  ) {
    const signerAddress = this._keypair.getPublicKey().toSuiAddress();
    if (!newRefs) return; // maybe unnecessary line
    for (const ref in newRefs) {
      const objectOwner = (newRefs[ref].owner as { AddressOwner: string })
        .AddressOwner;
      const object = newRefs[ref].reference;
      const objectId = object.objectId;

      // WARNING - this is a hack to skip get the object type
      //  It should be improved to avoid the extra calls
      const objectDetails = await client.getObject({
        id: object.objectId,
        options: { showContent: true },
      });
      if (objectOwner != signerAddress) {
        return;
      }

      const objectContent = objectDetails.data?.content as {
        dataType: 'moveObject';
        // eslint-disable-next-line  @typescript-eslint/no-explicit-any
        fields: MoveStruct | any;
        hasPublicTransfer: boolean;
        type: string;
      };
      const isSui = Coin.getCoinSymbol(objectContent.type) === 'SUI';
      if (isSui) {
        const coin: CoinStruct = {
          balance: objectContent.fields['balance'],
          coinObjectId: objectId,
          coinType: objectContent.type,
          digest: object.digest,
          previousTransaction: '---', // FIXME: don't know how to parse this
          version: object.version,
        };
        this._coins.set(objectId, coin);
      } else {
        this._objects.set(objectId, object);
      }
    }
  }

  /**
   * Check that all objects in the transaction block
   * are included in the pool.
   */
  public async checkTotalOwnership(
    txb: TransactionBlock,
    client: SuiClient,
  ): Promise<boolean> {
    await txb.build({ client });
    const ownedInputs = txb.blockData.inputs.filter((input) => {
      return (
        input.type === 'object' &&
        ('Object' in input.value || 'Input' in input.value) &&
        'ImmOrOwned' in input.value.Object
      );
    });
    return ownedInputs.every((ownedInput) => {
      const objID = ownedInput.value.Object.ImmOrOwned.objectId;
      const isInsidePool = this.isInsidePool(objID);
      const notInsidePool = !isInsidePool;
      if (notInsidePool) {
        console.error(`Object ${objID} is not owned by the pool's creator.`);
      }
      return isInsidePool;
    });
  }

  /**
   * Check if the id of an object or coin is in the object pool.
   * If it is in either the object pool or the coin pool, then it is
   * owned by the pool's creator.
   * @param id the object id to check
   * @returns true if the object is in the pool, false otherwise
   */
  private isInsidePool(id: string): boolean {
    return this._objects.has(id) || this._coins.has(id);
  }

  get objects(): PoolObjectsMap {
    return this._objects;
  }

  get coins(): PoolCoinsMap {
    return this._coins;
  }

  get keypair(): Keypair {
    return this._keypair;
  }

  set keypair(value: Keypair) {
    this._keypair = value;
  }
}

/*
Here are defined the predicate functions used to split the pool's objects and coins
into a new pool.
If the corresponding predicate:
  1. returns `true`, then the object will be moved to the new Pool, if it
  2. returns `false`, then the object will stay in `this` Pool, and if it
  3. returns `null`, it skips all remaining objects and returns the split Pool immediately.
*/
export type SplitStrategy = {
  objPred: (obj: SuiObjectRef | undefined) => boolean | null;
  coinPred: (coin: CoinStruct | undefined) => boolean | null;
};

/*
The default strategy only moves 1 object and 1 SUI coin to the new pool.
The coin should be a SUI coin because it is used as gas payment.
 */
class DefaultSplitStrategy implements SplitStrategy {
  private objectsToMove = 1;
  private coinsToMove = 1;

  public objPred(_: SuiObjectRef | CoinStruct | undefined) {
    return this.objectsToMove-- > 0 ? true : null;
  }

  public coinPred(coin: CoinStruct | undefined) {
    if (!coin) return false;
    const isSui = Coin.getCoinSymbol(coin.coinType) === 'SUI';
    if (isSui) {
      return this.coinsToMove-- > 0 ? true : null;
    }
    return false;
  }
}
