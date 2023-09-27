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
  SuiTransactionBlockResponseOptions, 
  ExecuteTransactionRequestType
} from '@mysten/sui.js/src/types/transactions';
import { TransactionBlock } from "@mysten/sui.js/transactions";


export class Pool {
  private _keypair: Keypair;
  private _client: SuiClient;
  private _objects: SuiObjectRef[];

  private constructor(
    keypair: Keypair,
    client: SuiClient,
    objects: SuiObjectRef[],
  ) {
    this._keypair = keypair;
    this._client = client;
    this._objects = objects;
  }

  static async full(input: { keypair: Keypair; client: SuiClient }) {
    const { keypair, client } = input;
    const owner = keypair.toSuiAddress();

    console.log('Creating Pool for account ', owner);

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

    return new Pool(keypair, client, objects);
  }

  /**
   * Split off a new Pool from this Pool using `pred` to select the objects
   * that will end up in the new Pool.
   *
   * `pred` is called on each object in the current pool, in turn.  If it
   * returns `true`, then the object will be moved to the new Pool, if it
   * returns `false`, then the object will stay in `this` Pool, and if it
   * returns `null`, it skips all remaining objects and returns the split
   * Pool immediately.
   */
  split(pred: (obj: SuiObjectRef | undefined) => boolean | null): Pool {
    const keep: SuiObjectRef[] = [];
    const give: SuiObjectRef[] = [];

    outside:  // label to specify the null break statement
    while (this._objects.length !== 0) {
      switch (pred(this._objects.at(-1))) {
        case true:
          give.push(this._objects.pop()!);
          break;
        case false:
          keep.push(this._objects.pop()!);
          continue;
        case null:
          break outside;
      }
    }
    this.objects.push(...keep);
    return new Pool(this._keypair, this.client, give);
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
      // Skip the address input. Addresses are of type 'pure'.
      // obviously it doesn't make sense to check if an address 
      // is in the pool since it's not an object.
      if (input.type! == 'pure') return true  
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
