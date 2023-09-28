// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SuiClient } from '@mysten/sui.js/client';
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


export class Pool {
  private _keypair: Keypair;
  private _client: SuiClient;
  private _objects: SuiObjectRef[];
  private _coins: CoinStruct[];

  private constructor(
    keypair: Keypair,
    client: SuiClient,
    objects: SuiObjectRef[],
    coins: CoinStruct[],
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
    const objects: SuiObjectRef[] = [];
    let resp: PaginatedObjectsResponse | null;
    let cursor = null;
    do {
      resp = await client.getOwnedObjects({ owner, cursor });
      resp.data.forEach((obj: SuiObjectResponse) => {
        const objectReference = getObjectReference(obj);
        if (objectReference) {
          objects.push(objectReference);
        }
      });
      cursor = resp?.nextCursor;
    } while (resp.hasNextPage);

    // Get all coins owned by the pool's creator
    const coins: CoinStruct[] = [];
    let coins_resp: PaginatedCoins | null;
    cursor = null;
    do {
      coins_resp = await client.getAllCoins({ owner, cursor });
      coins_resp.data.forEach((coin: CoinStruct) => {
        coins.push(coin);
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
   * pool.coins, in turn. 
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
   */
  split(pred_obj: (obj: SuiObjectRef | undefined) => boolean | null,
        pred_coins: (obj: CoinStruct | undefined) => boolean | null): Pool {
    const objects_to_give = this.split_objects(pred_obj);
    const coins_to_give = this.split_coins(pred_coins);

    return new Pool(this._keypair, this._client, objects_to_give, coins_to_give);
  }

  /**
   * Removes from the current pool and accumulates into an array the
   * objects that will be moved to the new pool from the current pool.
   * @param pred a predicate function that returns true if an object should
   * be moved to the new pool after split
   * @returns the array of objects that will be moved to the new pool
   */
  split_objects(pred: (obj: SuiObjectRef | undefined) => boolean | null): SuiObjectRef[] {
    const objects_to_keep: SuiObjectRef[] = [];
    const objects_to_give: SuiObjectRef[] = [];

    outside:
    while (this._objects.length !== 0) {
      switch (pred(this._objects.at(-1))) {
        case true:
          objects_to_give.push(this._objects.pop()!);
          break;
        case false:
          objects_to_keep.push(this._objects.pop()!);
          continue;
        case null:
          break outside;
      }
    }
    this.objects.push(...objects_to_keep);
    return objects_to_give;
  }

  /**
   * Removes from the current pool and accumulates into an array the 
   * coins that will be moved to the new pool from the current pool. 
   * @param pred a predicate function that returns true if a coin should 
   * be moved to the new pool after split
   * @returns the array of coins that will be moved to the new pool
   */
  split_coins(pred: (coin: CoinStruct | undefined) => boolean | null): CoinStruct[] {
    const coins_to_keep: CoinStruct[] = [];
    const coins_to_give: CoinStruct[] = [];

    outside:
    while (this._coins.length !== 0) {
      switch (pred(this._coins.at(-1))) {
        case true:
          coins_to_give.push(this._coins.pop()!);
          break;
        case false:
          coins_to_keep.push(this._coins.pop()!);
          continue;
        case null:
          break outside;
      }
    }
    this._coins.push(...coins_to_keep);
    return coins_to_give;
  }

  async signAndExecuteTransactionBlock(input: {
		transactionBlock: TransactionBlock;
		options?: SuiTransactionBlockResponseOptions;
		requestType?: ExecuteTransactionRequestType;
	}) {
		let { transactionBlock, options, requestType } = input;

		// (1). Check object ownership
		if (!this.check_total_ownership(transactionBlock)) {
      throw new Error(
        "All objects of the transaction block must be owned by the pool's creator."
        );
    }

		// (3). Run the transaction
		const resp = await this.client.signAndExecuteTransactionBlock({
			transactionBlock,
			requestType,
			options: { ...options, showEffects: true },
			signer: this._keypair,
		});

    return resp;
	}

  /*
  Check that all objects in the transaction block
  are included in this pool. 
  Since the pool is created by the signer, if an object 
  is in the pool then it is owned by the pool's 
  creator (signer).
  */
  public check_total_ownership(txb: TransactionBlock): boolean {
    const inputs = txb.blockData.inputs;
    return inputs.every((input) => {
      // Skip the signer's address - doesn't make sense to check for onwership
      const is_address = isValidSuiAddress(input.value) && input.type! == 'pure';
      if (is_address) return true  
      
      // Currently, we only check for object ownership.
      // Coins are skipped - i.e. we pass them as true (owned).
      // TODO: check for coin ownership
      const is_coin = input.type! == 'pure';
      if (is_coin) return true
      
      // check that the object is in the pool
      return this.is_inside_pool(input.value)
    });
  }

  /**
   * Check by objectId if an object is in the object pool.
   * @param objectId the object id to check
   * @returns true if the object is in the pool, false otherwise
   */
  private is_inside_pool(objectId: string): boolean {
    const object = this._objects.find(
      (obj) => obj.objectId === objectId
      );
      const is_found = object !== undefined;
      return is_found;
  }

  get objects(): SuiObjectRef[] {
    return this._objects;
  }

  get coins(): CoinStruct[] {
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
