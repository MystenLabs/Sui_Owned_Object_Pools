// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
  OwnedObjectRef,
  SuiClient,
  SuiTransactionBlockResponse,
} from '@mysten/sui.js/client';
import type {
  PaginatedObjectsResponse,
  SuiObjectRef,
  SuiObjectResponse,
} from '@mysten/sui.js/client';
import type {
  ExecuteTransactionRequestType,
  SuiTransactionBlockResponseOptions,
  MoveStruct,
} from '@mysten/sui.js/client';
import type { Keypair } from '@mysten/sui.js/cryptography';
import type { TransactionBlock } from '@mysten/sui.js/transactions';
import crypto from 'crypto';

import { isCoin, isImmutable } from './helpers';
import { Level, logger } from './logger';
import type { SplitStrategy } from './splitStrategies';
import { DefaultSplitStrategy } from './splitStrategies';
import type { PoolObject, PoolObjectsMap } from './types';

/**
 * A class representing a pool of Sui objects and gas coins.
 * Multiple pools are used by ExecutorServiceHandler to
 * execute transactions asynchronously.
 */
export class Pool {
  public readonly id: string;
  private _cursor: string | undefined | null;
  private readonly _objectGenerator: AsyncGenerator<PoolObjectsMap>;
  private _keypair: Keypair;
  private _objects: PoolObjectsMap;
  private _gasCoins: PoolObjectsMap;

  private constructor(
    keypair: Keypair,
    objects: PoolObjectsMap,
    gasCoins: PoolObjectsMap,
    client: SuiClient,
  ) {
    this._keypair = keypair;
    this._objects = objects;
    this._gasCoins = gasCoins;
    this._cursor = null;
    this._objectGenerator = this.objectBatchGenerator({
      owner: this._keypair.toSuiAddress(),
      client: client,
    });
    this.id = this.generateShortGUID();
  }
  private generateShortGUID() {
    // Create a random value and hash it
    const randomValue = crypto.randomBytes(8).toString('hex');
    const hash = crypto.createHash('md5').update(randomValue).digest('hex');
    // Return a portion of the hash for brevity
    return hash.slice(0, 8);
  }

  /**
   * Creates a new Pool instance and fetches an initial batch of objects.
   * The objects are fetched so that the pool is ready to be split.
   * @param input - An object containing the keypair and client to use.
   * @returns A Promise that resolves with the newly created Pool instance.
   */
  static async full(input: { keypair: Keypair; client: SuiClient }) {
    const { keypair } = input;
    const pool = new Pool(keypair, new Map(), new Map(), input.client);
    await pool.fetchObjects(); // fetch an initial batch of objects
    return pool;
  }

  /**
   * Fetches a batch of objects from the object generator and adds them to the pool.
   * Also extracts any gas coins associated with the objects and adds them to the pool's gas coin collection.
   * @returns A boolean indicating whether the fetch was successful or not.
   */
  private async fetchObjects() {
    const ownedObjectsBatch = await this._objectGenerator.next();
    if (!ownedObjectsBatch) {
      logger.log(Level.error, 'Did not fetch any objects!', this.id);
      return false;
    }
    if (!ownedObjectsBatch.done && !ownedObjectsBatch.value) {
      logger.log(Level.error, 'Did not fetch any objects!', this.id);
      return false;
    }
    if (ownedObjectsBatch.done) {
      logger.log(
        Level.warn,
        'End of cursor - No more objects to fetch!',
        this.id,
      );
    }
    ownedObjectsBatch.value.forEach((value: PoolObject, key: string) => {
      this._objects.set(key, value);
    });
    Pool.extractCoins(ownedObjectsBatch.value).forEach((value, key) => {
      this._gasCoins.set(key, value);
    });
    logger.log(
      Level.debug,
      `Fetched ${ownedObjectsBatch.value.size} objects.`,
      this.id,
    );
    return true;
  }

  /**
   * Creates a generator that yields batches of objects owned by the pool's creator.
   * @generator
   * @async
   * @param {Object} input - An object containing the owner and client parameters.
   * @param {string} input.owner - The owner of the objects to retrieve.
   * @param {SuiClient} input.client - The SuiClient instance to use for retrieving the objects.
   * @yields {Map<string, ObjectReference>} A Map containing the object references for each batch of objects retrieved.
   * @throws {Error} If an object's data is undefined.
   */
  public async *objectBatchGenerator(input: {
    owner: string;
    client: SuiClient;
  }) {
    let resp: PaginatedObjectsResponse | null;
    let tempObjects: PoolObjectsMap;
    do {
      tempObjects = new Map();
      resp = await input.client.getOwnedObjects({
        owner: input.owner,
        cursor: this._cursor,
        options: {
          showContent: true,
          showType: true,
        },
      });
      resp.data.forEach((obj: SuiObjectResponse) => {
        if (!obj.data) {
          throw new Error(`Object data is undefined: ${obj.error}`);
        }
        let balance;
        const content = obj.data.content;
        if (
          typeof content === 'object' &&
          content !== null &&
          'fields' in content &&
          'type' in content
        ) {
          const fields: MoveStruct = content.fields;
          if ('balance' in fields) {
            balance = Number(fields.balance);
          }
        }
        const objectReference = {
          objectId: obj.data.objectId,
          digest: obj.data.digest,
          version: obj.data.version,
          type: obj.data.type ?? '',
          balance,
        };
        if (objectReference) {
          tempObjects.set(objectReference.objectId, objectReference);
        }
      });
      yield tempObjects;
      this._cursor = resp?.nextCursor;
    } while (resp.hasNextPage);
  }

  /**
   * Lazily splits off a new Pool using the split strategy provided.
   * By lazy, we mean that the objects are fetched by the blockchain only when needed.
   * Initially we try to split the pool using the objects that are already in the pool.
   * If the split strategy does not succeed/complete, then we fetch more objects and
   * try to split those as well. We repeat this process until the split strategy
   * succeeds, or we run out of objects to fetch.
   * @splitStrategy the strategy used to split the pool's objects and coins
   * @returns the new Pool with the objects and coins that were split off
   */
  async split(
    client: SuiClient,
    splitStrategy: SplitStrategy = new DefaultSplitStrategy(),
  ) {
    logger.log(
      Level.debug,
      `Splitting pool with ${this._objects.size} objects.`,
      this.id,
    );
    let fetchSuccess;
    if (this._objects.size === 0) {
      fetchSuccess = await this.fetchObjects();
      if (!fetchSuccess) {
        throw new Error(
          `Pool (id: ${this.id}) split: Could not fetch any objects`,
        );
      }
    }
    // Split the pool's objects into a new pool
    const objectsToGiveToNewPool: PoolObjectsMap = new Map();
    const gasCoinsToGiveToNewPool: PoolObjectsMap = new Map();
    do {
      this.splitObjects(splitStrategy).forEach((value, key) => {
        objectsToGiveToNewPool.set(key, value);
      });
      Pool.extractCoins(objectsToGiveToNewPool).forEach((value, key) => {
        gasCoinsToGiveToNewPool.set(key, value);
      });
      if (splitStrategy.succeeded()) {
        break;
      }
      fetchSuccess = await this.fetchObjects();
    } while (!(splitStrategy.succeeded() || !fetchSuccess));
    if (!splitStrategy.succeeded()) {
      throw new Error(
        `Pool (id: ${this.id}) split: The split strategy did not succeed even having fetched all the objects.`,
      );
    }
    const newPool = new Pool(
      this._keypair,
      objectsToGiveToNewPool,
      gasCoinsToGiveToNewPool,
      client,
    );
    logger.log(
      Level.info,
      `Split completed: main pool (${this.id}) = ${this._objects.size} objects, new pool (${newPool.id}) = ${newPool._objects.size} objects`,
      this.id,
    );
    // Update the pool's coins
    Pool.extractCoins(newPool.gasCoins).forEach((_value, key) => {
      this._gasCoins.delete(key);
    });
    return newPool;
  }

  /**
   * Splits off the pool's objects map into two new maps.
   * One for the current pool (the ones with the objects to keep),
   * and one for the new pool (the ones to give).
   * The split strategy determines in which map each object will be moved to.
   * @param splitStrategy determines which objects will be moved to the new pool.
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
      switch (splitStrategy.pred(last_object_in_array)) {
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
   * Merges the objects of poolToMerge to this pool.
   * @param poolToMerge The pool whose objects will be merged to this pool.
   */
  public merge(poolToMerge: Pool) {
    logger.log(
      Level.debug,
      `Merging with pool ${poolToMerge.id} of ${poolToMerge._objects.size} objects. Current pool has ${this._objects.size} objects.`,
      this.id,
    );
    poolToMerge.objects.forEach((value, key) => {
      this._objects.set(key, value);
    });
    poolToMerge.deleteObjects();
    logger.log(
      Level.debug,
      `Merge complete: pool ${this.id} now has ${this._objects.size} objects.`,
      this.id,
    );
  }

  /**
   * Signs and executes a transaction block using the provided client and options.
   * @param input An object containing the client, transaction block, options, and request type.
   * @returns A promise that resolves to a SuiTransactionBlockResponse object.
   * @throws An error if any of the objects in the transaction block are not owned by the pool's creator,
   * or if there are no SUI coins in the pool to use as gas payment,
   * or if the dry run of the transaction block fails.
   */
  async signAndExecuteTransactionBlock(input: {
    client: SuiClient;
    transactionBlock: TransactionBlock;
    options?: SuiTransactionBlockResponseOptions;
    requestType?: ExecuteTransactionRequestType;
  }): Promise<SuiTransactionBlockResponse> {
    logger.log(
      Level.debug,
      `Starting signAndExecuteTransactionBlock: current objects pool size: ${this._objects.size}`,
      this.id,
    );
    const { transactionBlock, options, requestType } = input;

    // (1). Check object ownership
    logger.log(Level.debug, 'Checking object ownership...', this.id);
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
    const coinsArray = Array.from(this._gasCoins.values());
    const NoSuiCoinFound = coinsArray.length === 0;
    logger.log(
      Level.debug,
      `Coins used as gas payment: ${JSON.stringify(coinsArray)}`,
      this.id,
    );
    if (NoSuiCoinFound) {
      throw new Error('No SUI coins in the pool to use as gas payment.');
    }
    // Finally, set the gas payment to be done by the selected coins
    transactionBlock.setGasPayment(coinsArray);

    /*
    (2.5). Dry run the transaction block to ensure that Pool has enough
     resources to run the transaction and also to get the required budget
     */
    logger.log(Level.debug, 'Dry running the transaction block...', this.id);
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
      options: {
        ...options,
        showEffects: true,
        showObjectChanges: true,
      },
      signer: this._keypair,
    });

    const created = res.effects?.created;
    const unwrapped = res.effects?.unwrapped;
    const mutated = res.effects?.mutated;
    const wrapped = res.effects?.wrapped;
    const deleted = res.effects?.deleted;
    logger.log(
      Level.debug,
      `Transaction block executed. Created: ${JSON.stringify(
        created,
      )}, Unwrapped: ${JSON.stringify(unwrapped)}, Mutated: ${JSON.stringify(
        mutated,
      )}, Wrapped: ${JSON.stringify(wrapped)}, Deleted: ${JSON.stringify(
        deleted,
      )}`,
      this.id,
    );

    // (4). Update the pool's objects and coins
    logger.log(Level.debug, 'Updating pool...', this.id);

    this.updatePool(created);
    this.updatePool(unwrapped);
    this.updatePool(mutated);

    this.removeFromPool(wrapped);
    this.removeFromPool(deleted);

    if (mutated) {
      await this.updateCoins(mutated, input.client);
    }

    logger.log(
      Level.debug,
      `Pool updated. Current pool has ${this._objects.size} objects.`,
      this.id,
    );
    return res;
  }

  /**
   * After the transaction block execution, updates the pool with new references,
   * if the owner of the reference is the same as the signer address.
   * @param newRefs An array of OwnedObjectRef objects representing the new references to add to the pool.
   */
  private updatePool(newRefs: OwnedObjectRef[] | undefined) {
    const signerAddress = this._keypair.getPublicKey().toSuiAddress();
    if (!newRefs) return;
    for (const ref in newRefs) {
      const objectOwner = (newRefs[ref].owner as { AddressOwner: string })
        .AddressOwner;
      const object = newRefs[ref].reference;
      const objectId = object.objectId;
      if (objectOwner != signerAddress) {
        return;
      }
      const toUpdate = {
        ...object,
        type: this._objects.get(objectId)?.type ?? '',
      };
      this._objects.set(objectId, toUpdate as PoolObject);
    }
  }

  /**
   * Removes the given object references from the pool.
   * Called after a transaction block execution for wrapped or deleted objects.
   * @param newRefs - The object references to remove from the pool.
   */
  private removeFromPool(newRefs: SuiObjectRef[] | undefined) {
    if (!newRefs) return;
    for (const ref of newRefs) {
      const objectId = ref.objectId;
      this._objects.delete(objectId);
    }
  }

  private async updateCoins(mutated: OwnedObjectRef[], client: SuiClient) {
    const mutatedCoinsObjectIds = mutated
      .filter((mutatedCoin) => {
        return this._gasCoins.has(mutatedCoin.reference.objectId);
      })
      .map((mutatedCoin) => {
        return mutatedCoin.reference.objectId;
      });
    const mutatedCoinsOnChainContents = await client.multiGetObjects({
      ids: mutatedCoinsObjectIds,
      options: { showContent: true },
    });
    mutatedCoinsOnChainContents.forEach((mutatedCoinObject) => {
      if (
        'data' in mutatedCoinObject &&
        'content' in mutatedCoinObject.data! &&
        'fields' in mutatedCoinObject.data.content! &&
        'balance' in mutatedCoinObject.data.content.fields
      ) {
        const objectId = mutatedCoinObject.data.objectId;
        const balance = Number(mutatedCoinObject.data.content.fields.balance);
        const coin = this._gasCoins.get(objectId);
        if (!coin) {
          const err = `Coin ${objectId} not found in the pool.`;
          logger.log(Level.error, err);
          throw new Error(err);
        }
        coin.balance = balance;
        coin.version = mutatedCoinObject.data.version;
        coin.digest = mutatedCoinObject.data.digest;
        this._gasCoins.set(coin.objectId, coin);
      }
    });
  }

  /**
   * Checks if all inputs in the transaction block are owned by the pool's creator or are immutable.
   * @param txb - The transaction block to check.
   * @param client - The SuiClient instance to use for checking immutability.
   * @returns A Promise that resolves to a boolean indicating whether all inputs are owned by the pool's creator or are immutable.
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
    return ownedInputs.every(async (ownedInput) => {
      const objID = ownedInput.value.Object.ImmOrOwned.objectId;
      const isInsidePool = this.isInsidePool(objID);
      const notInsidePool = !isInsidePool;
      if (notInsidePool) {
        const immutable = await isImmutable(objID, client);
        if (immutable) {
          return true;
        } else {
          console.error(`Object ${objID} is not owned by the pool's creator.`);
        }
      }
      return isInsidePool;
    });
  }

  /**
   * Check if the id of an object is in the object pool.
   * @param id the object id to check
   * @returns true if the object is in the pool, false otherwise
   */
  private isInsidePool(id: string): boolean {
    return this._objects.has(id);
  }

  get objects(): PoolObjectsMap {
    return this._objects;
  }

  get gasCoins(): PoolObjectsMap {
    return this._gasCoins;
  }
  public deleteObjects() {
    this._objects.clear();
  }

  /**
   * Filters all the coins from pool's objects.
   * @param fromObjects - The pool of objects to extract coins from.
   * @returns A new pool of objects containing only the coins.
   * @throws An error if there are no coins in the pool.
   */
  static extractCoins(fromObjects: PoolObjectsMap) {
    const coinsMap: PoolObjectsMap = new Map();
    for (const [key, value] of fromObjects) {
      if (isCoin(value.type)) {
        coinsMap.set(key, value);
      }
    }
    if (!coinsMap) {
      throw new Error('No gas coins in the pool.');
    }
    return coinsMap;
  }

  get keypair(): Keypair {
    return this._keypair;
  }

  set keypair(value: Keypair) {
    this._keypair = value;
  }
}
