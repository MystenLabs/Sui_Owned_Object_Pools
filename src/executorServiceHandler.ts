// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SuiClient } from '@mysten/sui.js/client';
import { SuiTransactionBlockResponse } from '@mysten/sui.js/client';
import { Keypair } from '@mysten/sui.js/cryptography';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { firstValueFrom, from, interval } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import { Pool, SplitStrategy } from './pool';

/**
 * Represents a worker pool with its current status and pool instance.
 */
type WorkerPool = {
  status: 'available' | 'busy';
  pool: Pool;
};

/**
 * A class that orchestrates the execution of transaction blocks using multiple worker pools.
 * The workers are created by splitting a main pool and are used to execute transaction blocks asynchronously without object equivocation.
 * [Note:] The mainPool is not a worker pool and is not used for transaction block execution. It is used only for splitting.
 * The number of workers is not fixed and can be increased by splitting the main pool if the workload requires it.
 * The ExecutorServiceHandler retries the execution of the transaction block up to a specified number of times in case of errors.
 */
export class ExecutorServiceHandler {
  private _mainPool: Pool;
  private _workers: WorkerPool[] = [];
  private readonly _getWorkerTimeoutMs: number;
  private constructor(mainPool: Pool, getWorkerTimeoutMs: number) {
    this._mainPool = mainPool;
    this._getWorkerTimeoutMs = getWorkerTimeoutMs;
  }

  /**
   * Initializes an ExecutorServiceHandler instance.
   * @param keypair - The keypair to use for authentication.
   * @param client - The SuiClient instance to use for communication with the Sui network.
   * @param getWorkerTimeoutMs - The maximum amount of milliseconds to listen for an available
   * worker from the workers array.
   * @returns A new ExecutorServiceHandler instance.
   */
  public static async initialize(
    keypair: Keypair,
    client: SuiClient,
    getWorkerTimeoutMs = 1000,
  ) {
    const pool = await Pool.full({ keypair: keypair, client });
    return new ExecutorServiceHandler(pool, getWorkerTimeoutMs);
  }

  /**
   * Executes the given transaction block using the provided SuiClient and split strategy (if any).
   * Retries the execution up to the specified number of times in case of errors.
   *
   * Note that the execution is asynchronous and the result is returned as a Promise.
   * This means that you can execute multiple transaction blocks in parallel **without**
   * equivocating objects, as long as the splitStrategy permits it.
   * @param txb The transaction block to execute.
   * @param client The SuiClient instance to use for execution.
   * @param splitStrategy The SplitStrategy used to determine how a new worker pool will be split
   * from the main pool in case a new worker is needed to execute the transaction.
   * @param retries The maximum number of retries in case of errors (default: 3).
   * @returns A Promise that resolves to the result of the transaction block execution.
   * @throws An error if all retries fail.
   */
  public async execute(
    txb: TransactionBlock,
    client: SuiClient,
    splitStrategy?: SplitStrategy,
    retries?: number,
  ) {
    if (!retries) {
      retries = 3;
    }
    let res;
    do {
      try {
        res = await this.executeFlow(txb, client, splitStrategy);
      } catch (e) {
        console.log('Error executing transaction block');
        console.log(e);
        continue;
      }
      if (res) {
        return res;
      }
      console.log(`${retries} retries left...`);
    } while (--retries > 0);
    throw new Error(
      'Internal server error - All retries failed: Could not execute the transaction block',
    );
  }

  /**
   * Helper function of execute(). Contains the main logic for executing a transaction block,
   * including getting an available worker from the workers array, updating the workerPool status, etc.
   * @param txb The transaction block to execute.
   * @param client The SuiClient to use for executing the transaction block.
   * @param splitStrategy (Optional) The SplitStrategy to use for splitting the main pool and getting a new worker pool.
   * @returns A Promise that resolves to the SuiTransactionBlockResponse object returned by executing the transaction block.
   */
  private async executeFlow(
    txb: TransactionBlock,
    client: SuiClient,
    splitStrategy?: SplitStrategy,
  ) {
    let worker: WorkerPool | undefined;
    try {
      worker = await this.getAWorker();
    } catch (e) {
      worker = undefined;
    }
    const noWorkerAvailable = worker === undefined;
    if (noWorkerAvailable) {
      await this.addWorker(client, splitStrategy);
      console.log('No worker available. Added a new worker pool.');
      return;
    } else if (worker) {
      // An available worker is found! Assign to it the task of executing the txb.
      worker.status = 'busy'; // Worker is now busy
      let result: SuiTransactionBlockResponse;
      try {
        result = await worker.pool.signAndExecuteTransactionBlock({
          transactionBlock: txb,
          client: client,
        });
      } catch (e) {
        console.error(`Error executing transaction block: ${e}`);
        this.removeWorker(worker);
        return;
      }

      if (result.effects && result.effects.status.status === 'failure') {
        this.removeWorker(worker);
        console.log('Transaction block execution status: "failed"!');
        return;
      }

      console.log('Transaction block execution completed!');
      // Execution finished, the worker is now available again.
      worker.status = 'available';
      return result;
    }
  }

  /**
   * Returns an available worker from the workers array, or undefined if none are available within the timeout period.
   * @returns {WorkerPool | undefined} - An available worker from the workers array,
   * or undefined if none are available within the timeout period.
   */
  private async getAWorker(): Promise<WorkerPool | undefined> {
    const timeoutMs = this._getWorkerTimeoutMs;
    const startTime = new Date().getTime();

    const observable = from(interval(100)).pipe(
      map(() => this._workers.find((worker) => worker.status === 'available')),
      filter(
        (result) => !!result || new Date().getTime() - startTime >= timeoutMs,
      ),
      take(1),
    );
    return firstValueFrom(observable);
  }

  /**
   * Adds a new worker pool to the workers array.
   * @param client - The SuiClient instance to use for the execution of transactions by the new worker pool.
   * @param splitStrategy - (Optional) The SplitStrategy to use for splitting the main pool and creating the new pool.
   */
  private async addWorker(client: SuiClient, splitStrategy?: SplitStrategy) {
    console.log('Splitting main pool to add new worker Pool...');
    const newPool = await this._mainPool.split(client, splitStrategy);
    this._workers.push({ status: 'available', pool: newPool });
  }

  /**
   * Remove the worker from the workers array and merge it back to the main pool.
   * @param worker - The worker to remove.
   * @throws {Error} If the worker is not found in the list of workers.
   */
  private removeWorker(worker: WorkerPool) {
    const index = this._workers.indexOf(worker);
    if (index > -1) {
      this._workers.splice(index, 1);
      this._mainPool.merge(worker.pool);
    } else {
      throw new Error('Worker not found in workers array.');
    }
  }
}
