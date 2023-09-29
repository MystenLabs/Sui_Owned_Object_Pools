// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui.js/client';
import { Keypair } from '@mysten/sui.js/cryptography';
import {
  getObjectReference,
  SuiObjectData,
} from '@mysten/sui.js/dist/cjs/types';
import { PaginatedObjectsResponse } from '@mysten/sui.js/src/client/types';
import {
  SuiObjectRef,
  SuiObjectResponse,
} from '@mysten/sui.js/src/types/objects';
import { 
  CoinStruct, 
  PaginatedCoins } from '@mysten/sui.js/dist/cjs/client/types/';
import { 
  SuiTransactionBlockResponseOptions, 
  ExecuteTransactionRequestType} from '@mysten/sui.js/src/types/transactions';
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { isValidSuiAddress } from "@mysten/sui.js/utils";


type PoolObjectsMap = Map<string, SuiObjectRef>;  // Map<objectId, object>
type PoolCoinsMap = Map<string, CoinStruct>;  // Map<coinObjectId, coin>

export class Pool {
  private _keypair: Keypair;
  private _client: SuiClient;
  private _objects: PoolObjectsMap;
  private _coins: PoolCoinsMap;

  private constructor(
    keypair: Keypair,
    client: SuiClient,
    objects: PoolObjectsMap,
    coins: PoolCoinsMap,
  ) {
    this._keypair = keypair;
    this._client = client;
    this._objects = objects;
    this._coins = coins;
  }

  static async full(input: { keypair: Keypair; client: SuiClient }) {
    const { keypair, client } = input;
    const owner = keypair.toSuiAddress();

    console.log('Creating Pool for account ', owner);
    
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

    return new Pool(keypair, client, objects, coins);
  }

  /**
   * Split off a new Pool from this Pool using `pred_obj` to determine how
   * the objects are split, and `pred_coins` to determine how the coins are.
   *
   * A `pred_obj/coins` is called on each object in the current pool.objects and 
   * pool.coins in turn. 
   * If the corresponding predicate: 
   * 1. returns `true`, then the object will be moved to the new Pool, if it
   * 2. returns `false`, then the object will stay in `this` Pool, and if it
   * 3. returns `null`, it skips all remaining objects and returns the split Pool immediately.
   * @param pred_obj a predicate function that returns true if an object 
   * should be moved to the new pool, false if it should stay in the current pool,
   * and null if the split should stop immediately.
   * @param pred_coins a predicate function that returns true if a coin
   * should be moved to the new's pool struct "coins", false if it should 
   * stay in the current pool.coins.
   * @returns the new Pool with the objects and coins that were split off
   */
  split(pred_obj: (obj: SuiObjectRef | undefined) => boolean | null,
        pred_coins: (obj: CoinStruct | undefined) => boolean | null): Pool {
    const objects_to_give: PoolObjectsMap = this.splitObjects(pred_obj);
    const coins_to_give: PoolCoinsMap = this.splitCoins(pred_coins);

    return new Pool(this._keypair, this._client, objects_to_give, coins_to_give);
  }

  /**
   * Splits off the pool's objects map into two new maps. One for the current pool
   * (the ones with the objects to keep), and one for the new pool (the ones to give).
   * @param pred a predicate function that returns true if an object should
   * be moved to the new pool after split
   * @returns the map of objects that will be assigned to the new pool
   */
  splitObjects(pred: (obj: SuiObjectRef | undefined) => boolean | null): PoolObjectsMap {
    const objects_to_keep: PoolObjectsMap = new Map();
    const objects_to_give: PoolObjectsMap = new Map();

    // Transform the map into an array of key-value pairs. It's easier to iterate.
    let objects_array = Array.from(this._objects, ([objectId, object]) => ({ objectId, object }));
    outside:
    while (objects_array.length !== 0) {
      let last_object_in_array = objects_array.at(-1)?.object;
      switch (pred(last_object_in_array)) {
        case true:
          // Predicate returned true, so we move the object to the new pool
          let obj_give = objects_array.pop()!;
          objects_to_give.set(obj_give.objectId, obj_give.object);
          break;
        case false:
          // Predicate returned false, so we keep the object in the current pool
          let obj_keep = objects_array.pop()!;
          objects_to_keep.set(obj_keep.objectId, obj_keep.object);
          continue;
        case null:
          // The predicate returned null, so we stop the split, and keep
          // all the remaining objects of the array in the current pool.
          objects_array.forEach((obj) => {objects_to_keep.set(obj.objectId, obj.object)});
          break outside;
      }
    }
    this._objects = objects_to_keep;
    return objects_to_give;
  }

  /**
   * Splits off the pool's coins map into two new maps. One for the current pool 
   * (the ones with the coins to keep), and one for the new pool (the ones to give). 
   * @param pred a predicate function that returns true if a coin should 
   * be moved to the new pool after split
   * @returns the map of coins that will be assigned to the new pool
   */
  splitCoins(pred: (coin: CoinStruct | undefined) => boolean | null): PoolCoinsMap {
    const coins_to_keep: PoolCoinsMap = new Map();
    const coins_to_give: PoolCoinsMap = new Map();

    // Transform the map into an array of key-value pairs. It's easier to iterate.
    let coins_array = Array.from(this._coins, ([coinObjectId, coin]) => ({ coinObjectId, coin }));
    outside:
    while (coins_array.length !== 0) {
      let last_coin_in_array = coins_array.at(-1)?.coin;
      switch (pred(last_coin_in_array)) {
        case true:
          // Predicate returned true, so we move the coin to the new pool
          let coin_give = coins_array.pop()!;
          coins_to_give.set(coin_give.coinObjectId, coin_give.coin);
          break;
        case false:
          // Predicate returned false, so we keep the coin in the current pool
          let coin_keep = coins_array.pop()!;
          coins_to_keep.set(coin_keep.coinObjectId, coin_keep.coin);
          continue;
        case null:
          // The predicate returned null, so we stop the split, and keep
          // all the remaining coins of the array in the current pool.
          coins_array.forEach((coin) => {coins_to_keep.set(coin.coinObjectId, coin.coin)});
          break outside;
      }
    }
    this._coins = coins_to_keep;
    return coins_to_give;
  }

  async signAndExecuteTransactionBlock(input: {
		transactionBlock: TransactionBlock;
		options?: SuiTransactionBlockResponseOptions;
		requestType?: ExecuteTransactionRequestType;
	}): Promise<SuiTransactionBlockResponse> {
		let { transactionBlock, options, requestType } = input;

		// (1). Check object ownership
		if (!this.checkTotalOwnership(transactionBlock)) {
      throw new Error(
        "All objects of the transaction block must be owned by the pool's creator."
        );
    }

		// (3). Run the transaction
		return this.client.signAndExecuteTransactionBlock({
			transactionBlock,
			requestType,
			options: { ...options, showEffects: true },
			signer: this._keypair,
		});
	}

  /**
   * Check that all objects in the transaction block
   * are included in this pool. 
   * Since the pool is created by the signer, if an object 
   * is in the pool then it is owned by the pool's 
   * creator (signer).
   */
  public checkTotalOwnership(txb: TransactionBlock): boolean {
    const inputs = txb.blockData.inputs;
    return inputs.every((input) => {
      // Skip the signer's address - doesn't make sense to check for onwership
      const is_address = isValidSuiAddress(input.value) && input.type! == 'pure';
      if (is_address) return true
      
      // NOTE: Currently, we only check for object ownership.
      // Coins are skipped - i.e. we pass them as true (owned).
      const is_coin = input.type! == 'pure';
      if (is_coin) return true  // TODO: check for coin ownership
      else return this.isInsidePool(input.value)
    });
  }

  /**
   * Check by objectId if an object is in the object pool.
   * @param objectId the object id to check
   * @returns true if the object is in the pool, false otherwise
   */
  private isInsidePool(objectId: string): boolean {
      return this._objects.has(objectId);
  }

  get objects(): PoolObjectsMap {
    return this._objects;
  }

  get coins(): PoolCoinsMap {
    return this._coins;
  }

  get client(): SuiClient {
    return this._client;
  }

  set client(value: SuiClient) {
    this._client = value;
  }

  get keypair(): Keypair {
    return this._keypair;
  }

  set keypair(value: Keypair) {
    this._keypair = value;
  }
}
