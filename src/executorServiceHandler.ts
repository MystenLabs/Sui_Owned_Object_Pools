// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SuiClient } from '@mysten/sui.js/client';
import { SuiTransactionBlockResponse } from '@mysten/sui.js/client';
import { Keypair } from '@mysten/sui.js/cryptography';
import { TransactionBlock } from '@mysten/sui.js/transactions';

import { LoggingLevel, setupLogger } from './logger';
import { Pool, SplitStrategy } from './pool';

/**
 * A class that orchestrates the execution of transaction blocks using multiple worker pools.
 * The workers are created by splitting a main pool and are used to execute transaction blocks asynchronously without object equivocation.
 * [Note:] The mainPool is not a worker pool and is not used for transaction block execution. It is used only for splitting.
 * The number of workers is not fixed and can be increased by splitting the main pool if the workload requires it.
 * The ExecutorServiceHandler retries the execution of the transaction block up to a specified number of times in case of errors.
 */
export class ExecutorServiceHandler {
  private _mainPool: Pool;
  private _workersQueue: Pool[] = [];
  private readonly _getWorkerTimeoutMs: number;
  private readonly _logger;
  private constructor(
    mainPool: Pool,
    getWorkerTimeoutMs: number,
    loggingLevel?: LoggingLevel,
  ) {
    this._mainPool = mainPool;
    this._getWorkerTimeoutMs = getWorkerTimeoutMs;
    this._logger = setupLogger(loggingLevel);
  }

  /**
   * Initializes an ExecutorServiceHandler instance.
   * @param keypair - The keypair to use for authentication.
   * @param client - The SuiClient instance to use for communication with the Sui network.
   * @param getWorkerTimeoutMs - The maximum amount of milliseconds to listen for an available
   * worker from the workers array.
   * @param loggingLevel - (Optional) The logging level to use for the logger.
   * @returns A new ExecutorServiceHandler instance.
   */
  public static async initialize(
    keypair: Keypair,
    client: SuiClient,
    getWorkerTimeoutMs = 10000,
    loggingLevel?: string,
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
    retries = 3,
  ) {
    let res;
    do {
      try {
        res = await this.executeFlow(txb, client, splitStrategy);
      } catch (e) {
        this._logger.error(`Error executing transaction block: ${e}`);
        continue;
      }
      if (res) {
        this._logger.info(
          `Transaction block execution completed: ${JSON.stringify(res)}`,
        );
        return res;
      }
      this._logger.debug(`Could not execute flow! ${retries} retries left...`);
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
    let worker: Pool | undefined;
    try {
      worker = await this.getAWorker();
    } catch (e) {
      worker = undefined;
    }
    const noWorkerAvailable = worker === undefined;
    if (noWorkerAvailable) {
      this._logger.debug('Could not find an available worker.');
      await this.addWorker(client, splitStrategy);
      return;
    } else if (worker) {
      let result: SuiTransactionBlockResponse;
      try {
        result = await worker.signAndExecuteTransactionBlock({
          transactionBlock: txb,
          client: client,
        });
      } catch (e) {
        this._logger.error(`Error executing transaction block: ${e}`);
        this.removeWorker(worker);
        return;
      }

      if (result.effects && result.effects.status.status === 'failure') {
        this._logger.error(
          'Error executing transaction block: result status is "failure"',
        );
        this.removeWorker(worker);
        return;
      }
      this._logger.debug(
        'Transaction block execution completed! Pushing worker back to the queue...',
      );
      // Execution finished, the worker is now available again.
      this._workersQueue.push(worker);
      return result;
    }
  }

  /**
   * Returns an available worker from the workers array, or undefined if none are available within the timeout period.
   * @returns {Pool | undefined} - An available worker from the workers array,
   * or undefined if none are available within the timeout period.
   */
  private async getAWorker(): Promise<Pool | undefined> {
    this._logger.debug('Getting a worker...');
    const timeoutMs = this._getWorkerTimeoutMs;
    const startTime = new Date().getTime();

    const tryGetWorker = (): Promise<Pool | undefined> => {
      return new Promise((resolve) => {
        const tryNext = () => {
          const worker = this._workersQueue.pop();
          if (worker) {
            resolve(worker);
          } else if (new Date().getTime() - startTime >= timeoutMs) {
            // Timeout reached - no available worker found
            console.log(`Timeout reached - no available worker found`);
            resolve(undefined);
          } else {
            setTimeout(tryNext, 100);
          }
        };

        tryNext();
      });
    };

    return await tryGetWorker();
  }


  /**
   * Adds a new worker pool to the workers array.
   * @param client - The SuiClient instance to use for the execution of transactions by the new worker pool.
   * @param splitStrategy - (Optional) The SplitStrategy to use for splitting the main pool and creating the new pool.
   */
  private async addWorker(client: SuiClient, splitStrategy?: SplitStrategy) {
    this._logger.debug('Adding new worker to the queue...');
    const newPool = await this._mainPool.split(client, splitStrategy);
    this._logger.debug(`New worker added to the queue: ${newPool}`);
    this._workersQueue.push(newPool);
  }

  /**
   * Remove the worker from the workers array and merge it back to the main pool.
   * @param worker - The worker to remove.
   * @throws {Error} If the worker is not found in the list of workers.
   */
  private removeWorker(worker: Pool) {
    this._logger.debug(`Removing worker from the queue: ${worker}`);
    const index = this._workersQueue.indexOf(worker);
    if (index > -1) {
      this._workersQueue.splice(index, 1);
      this._mainPool.merge(worker);
    } else {
      this._logger.error(
        `Worker not found in the workers queue: ${worker}\n Workers array: ${this._workersQueue}`,
      );
      throw new Error(`Worker not found in workers array: ${worker}`);
    }
  }
}
