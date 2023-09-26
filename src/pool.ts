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

    while (this._objects.length !== 0) {
      switch (pred(this._objects.at(-1))) {
        case true:
          give.push(this._objects.pop()!);
          break;
        case false:
          keep.push(this._objects.pop()!);
          continue;
        case null:
          break;
      }
    }
    this.objects.push(...keep);
    return new Pool(this._keypair, this.client, give);
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
