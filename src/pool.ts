// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
  OwnedObjectRef,
  SuiClient,
  SuiTransactionBlockResponse,
} from '@mysten/sui.js/client';
import {
  PaginatedObjectsResponse,
  SuiObjectRef,
  SuiObjectResponse,
} from '@mysten/sui.js/client';
import {
  ExecuteTransactionRequestType,
  SuiTransactionBlockResponseOptions,
} from '@mysten/sui.js/client';
import { Keypair } from '@mysten/sui.js/cryptography';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import crypto from 'crypto';

import { isCoin, isImmutable } from './helpers';
import { LoggingLevel, setupLogger } from './logger';
import { PoolObject, PoolObjectsMap } from './types';

/**
 * A class representing a pool of Sui objects and gas coins.
 * Multiple pools are used by ExecutorServiceHandler in order to
 * execute transactions asynchronously.
 */
export class Pool {
  public readonly id: string;
  private _cursor: string | undefined | null;
  private readonly _objectGenerator: AsyncGenerator<PoolObjectsMap>;
  private _keypair: Keypair;
  private _objects: PoolObjectsMap;
  private _gasCoins: PoolObjectsMap;
  private _logger;

  private constructor(
    keypair: Keypair,
    objects: PoolObjectsMap,
    gasCoins: PoolObjectsMap,
    client: SuiClient,
    loggingLevel?: LoggingLevel,
  ) {
    this._keypair = keypair;
    this._objects = objects;
    this._gasCoins = gasCoins;
    this._cursor = null;
    this._objectGenerator = this.objectBatchGenerator({
      owner: this._keypair.toSuiAddress(),
      client: client,
    });
    this._logger = setupLogger(loggingLevel);
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
  static async full(
    input: { keypair: Keypair; client: SuiClient },
    loggingLevel?: LoggingLevel,
  ) {
    const { keypair } = input;
    const pool = new Pool(
      keypair,
      new Map(),
      new Map(),
      input.client,
      loggingLevel,
    );
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
    if (!ownedObjectsBatch.done && !ownedObjectsBatch.value) {
      this._logger.error({
        msg: 'Did not fetch any objects!',
        pool_id: this.id,
      });
      return false;
    }
    if (ownedObjectsBatch.done) {
      this._logger.warn({
        msg: 'End of cursor - No more objects to fetch.',
        pool_id: this.id,
      });
    }
    ownedObjectsBatch.value.forEach((value: PoolObject, key: string) => {
      this._objects.set(key, value);
    });
    Pool.extractCoins(ownedObjectsBatch.value).forEach((value, key) => {
      this._gasCoins.set(key, value);
    });
    this._logger.debug({
      msg: `Fetched ${ownedObjectsBatch.value.size} objects.`,
      pool_id: this.id,
    });
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
        const objectReference = {
          objectId: obj.data.objectId,
          digest: obj.data.digest,
          version: obj.data.version,
          type: obj.data.type ?? '',
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
    this._logger.debug({
      msg: `Splitting pool with ${this._objects.size} objects.`,
      pool_id: this.id,
    });
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
    this._logger.info({
      msg: `Split completed: main pool (${this.id}) = ${this._objects.size} objects, new pool (${newPool.id}) = ${newPool._objects.size} objects`,
      pool_id: this.id,
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
    this._logger.debug({
      msg: `Merging with pool ${poolToMerge.id} of ${poolToMerge._objects.size} objects. Current pool has ${this._objects.size} objects.`,
      pool_id: this.id,
    });
    poolToMerge.objects.forEach((value, key) => {
      this._objects.set(key, value);
    });
    poolToMerge.deleteObjects();
    this._logger.debug({
      msg: `Merge complete: pool ${this.id} now has ${this._objects.size} objects.`,
      pool_id: this.id,
    });
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
    this._logger.debug({
      msg: 'Pool sign and execute flow...',
      pool_id: this.id,
    });
    const { transactionBlock, options, requestType } = input;

    // (1). Check object ownership
    this._logger.debug({
      msg: 'Checking object ownership...',
      pool_id: this.id,
    });
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
    this._logger.debug({
      msg: `Coins used as gas payment: ${coinsArray}`,
      pool_id: this.id,
    });
    if (NoSuiCoinFound) {
      throw new Error('No SUI coins in the pool to use as gas payment.');
    }
    // Finally set the gas payment to be done by the selected coins
    transactionBlock.setGasPayment(coinsArray);

    /*
    (2.5). Dry run the transaction block to ensure that Pool has enough
     resources to run the transaction and also to get required budget
     */
    this._logger.debug({
      msg: 'Dry running the transaction block...',
      pool_id: this.id,
    });
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
    const wrapped = res.effects?.wrapped;
    const deleted = res.effects?.deleted;
    this._logger.debug({ msg: `Created: ${created}`, pool_id: this.id });
    this._logger.debug({ msg: `Unwrapped: ${unwrapped}`, pool_id: this.id });
    this._logger.debug({ msg: `Mutated: ${mutated}`, pool_id: this.id });
    this._logger.debug({ msg: `Wrapped: ${wrapped}`, pool_id: this.id });
    this._logger.debug({ msg: `Deleted: ${deleted}`, pool_id: this.id });

    // (4). Update the pool's objects and coins
    this._logger.debug({ msg: 'Updating pool...', pool_id: this.id });
    this.updatePool(created);
    this.updatePool(unwrapped);
    this.updatePool(mutated);
    this.removeFromPool(wrapped);
    this.removeFromPool(deleted);
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

/**
 * A strategy containing the rules that determine how the split of the pool will be done.
 *
 * - pred: A predicate function used to split the pool's objects and coins into a new pool.
 * This predicate is called for each object and depending on what it returns,
 * the object will be moved to the new pool, stay in the current pool, or the split will be terminated.
 * The predicate should return:
 * 1. `true`, if the object will be moved to the new Pool
 * 2. `false`, if the object will stay in `this` Pool
 * 3. `null`, if the split should be terminated and the new Pool should be returned immediately,
 * with the remaining unchecked objects being kept to the initial pool.
 *
 * [WARNING] If you want to implement a custom strategy, make sure that the predicate
 * will select at least one coin to be moved to the new pool, otherwise the transaction block
 * will not be able to determine the gas payment and will fail.
 *
 * - succeeded: A function that is called after the split is done to check if the split utilized the strategy as supposed to.
 */
export type SplitStrategy = {
  pred: (obj: PoolObject | undefined) => boolean | null;

  /**
   * Call this function after the split is done to check if the split utilized the strategy as supposed to.
   * Used in order to decide if it should be retried by loading more objects for the strategy to iterate over.
   * @returns A boolean indicating if the split succeeded or not.
   */
  succeeded: () => boolean;
};

/**
 * The DefaultSplitStrategy is used when no other strategy is provided.
 * It moves to the new pool one object and one SUI (gas) coin.
 */
class DefaultSplitStrategy implements SplitStrategy {
  private objectsToMove = 1;
  private coinsToMove = 1;

  public pred(obj: PoolObject | undefined) {
    if (!obj) throw new Error('No object found!.');
    if (this.objectsToMove <= 0 && this.coinsToMove <= 0) {
      return null;
    }
    if (isCoin(obj.type)) {
      return this.coinsToMove-- > 0;
    } else {
      return this.objectsToMove-- > 0;
    }
  }
  public succeeded() {
    const check = this.coinsToMove <= 0 && this.objectsToMove <= 0;
    return check;
  }
}

/**
 * The IncludeAdminCapStrategy is used when the pool needs to contain an AdminCap object.
 * It moves to the new pool one object, one SUI (gas) coin, and one AdminCap object of the package.
 */
export class IncludeAdminCapStrategy implements SplitStrategy {
  private objectsToMove = 1;
  private coinsToMove = 1;
  private readonly packageId: string;
  private adminCapIncluded = false;

  /**
   * Creates a new instance of the Pool class.
   * @param packageId - The ID of the package containing the AdminCap.
   */
  constructor(packageId: string) {
    this.packageId = packageId;
  }
  public pred(obj: PoolObject | undefined) {
    if (!obj) throw new Error('No object found!.');
    if (obj.type.includes('AdminCap') && obj.type.includes(this.packageId)) {
      this.adminCapIncluded = true;
      return true;
    }
    const terminateWhen =
      this.objectsToMove <= 0 && this.coinsToMove <= 0 && this.adminCapIncluded;
    if (terminateWhen) {
      return null;
    }
    if (isCoin(obj.type) && this.coinsToMove > 0) {
      return this.coinsToMove-- > 0;
    } else if (!isCoin(obj.type) && this.objectsToMove > 0) {
      return this.objectsToMove-- > 0;
    } else {
      return false;
    }
  }
  public succeeded() {
    const check =
      this.objectsToMove <= 0 && this.coinsToMove <= 0 && this.adminCapIncluded;
    return check;
  }
}
