// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui.js/client';
import { Keypair } from '@mysten/sui.js/cryptography';
import { TransactionBlock } from '@mysten/sui.js/transactions';

import { Level, logger } from './logger';
import { Pool, SplitStrategy } from './pool';

/**
 * A class that orchestrates the execution of transaction blocks using multiple worker pools.
 * The workers are created by splitting a main pool and are used to execute transaction blocks asynchronously without object equivocation.
 * [Note: ] The mainPool is not a worker pool and is not used for transaction block execution. It is used only for splitting.
 * The number of workers is not fixed and can be increased by splitting the main pool if the workload requires it.
 * The ExecutorServiceHandler retries the execution of the transaction block up to a specified number of times in case of errors.
 */
export class ExecutorServiceHandler {
  private _mainPool: Pool;
  private _workersQueue: Pool[] = [];
  private readonly _getWorkerTimeoutMs: number;
  private constructor(mainPool: Pool, getWorkerTimeoutMs: number) {
    this._mainPool = mainPool;
    this._getWorkerTimeoutMs = getWorkerTimeoutMs;
  }

  /**
   * Initializes an ExecutorServiceHandler instance.
   * @param keypair - The keypair to use for authentication.
   * @param client - The SuiClient instance to use for communication with the Sui network.
   * @param getWorkerTimeoutMs - The maximum number of milliseconds to listen for an available
   * worker from the worker queue.
   * @returns A new ExecutorServiceHandler instance.
   */
  public static async initialize(
    keypair: Keypair,
    client: SuiClient,
    getWorkerTimeoutMs = 10000,
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
        logger.log(
          Level.error,
          `ESHandler: Error executing transaction block: ${e}`,
        );
        continue;
      }
      if (res) {
        logger.log(
          Level.info,
          `ESHandler: Transaction block execution completed: ${JSON.stringify(
            res,
          )}`,
        );
        return res;
      }
      logger.log(
        Level.debug,
        `ESHandler: Could not execute flow! ${retries - 1} retries left...`,
      );
    } while (--retries > 0);
    logger.log(
      Level.error,
      'ESHandler: Internal server error - All retries failed: Could not execute the transaction block',
    );
    throw new Error(
      'ESHandler: Internal server error - All retries failed: Could not execute the transaction block',
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
      logger.log(Level.debug, 'ESHandler: Could not find an available worker.');
      await this.addWorker(client, splitStrategy);
      return;
    } else if (worker) {
      logger.log(
        Level.debug,
        `ESHandler: Found an available worker: ${worker.id}. Executing transaction block...`,
      );
      let result: SuiTransactionBlockResponse;
      try {
        result = await worker.signAndExecuteTransactionBlock({
          transactionBlock: txb,
          client: client,
        });
      } catch (e) {
        logger.log(
          Level.warn,
          `ESHandler: Error executing transaction block: ${e}`,
        );
        this._mainPool.merge(worker);
        return;
      }

      if (result.effects && result.effects.status.status === 'failure') {
        logger.log(
          Level.error,
          'ESHandler: Error executing transaction block: result status is "failure"',
        );
        this._mainPool.merge(worker);
        return;
      }
      logger.log(
        Level.debug,
        `ESHandler: Transaction block execution completed! Pushing worker ${worker.id} back to the queue...`,
      );
      // Execution finished, the worker is now available again.
      this._workersQueue.push(worker);
      return result;
    }
  }

  /**
   * Returns an available worker from the worker queue, or undefined if none are available within the timeout period.
   * @returns {Pool | undefined} - An available worker from the worker queue,
   * or undefined if none are available within the timeout period.
   */
  private async getAWorker(): Promise<Pool | undefined> {
    logger.log(Level.debug, 'ESHandler: Getting a worker from the queue...');
    const timeoutMs = this._getWorkerTimeoutMs;
    const startTime = new Date().getTime();

    const tryGetWorker = (): Promise<Pool | undefined> => {
      return new Promise((resolve) => {
        const tryNext = () => {
          const worker = this._workersQueue.pop();
          if (worker) {
            resolve(worker);
          } else if (new Date().getTime() - startTime >= timeoutMs) {
            logger.log(
              Level.debug,
              'ESHandler: Timeout reached - no available worker found',
            );
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
   * Adds a new worker pool to the worker queue.
   * @param client - The SuiClient instance to use it for the execution of transactions by the new worker pool.
   * @param splitStrategy - (Optional) The SplitStrategy to use for splitting the main pool and creating the new pool.
   */
  private async addWorker(client: SuiClient, splitStrategy?: SplitStrategy) {
    logger.log(Level.debug, 'ESHandler: Adding new worker to the queue...');
    const newPool = await this._mainPool.split(client, splitStrategy);
    logger.log(
      Level.debug,
      `ESHandler: New worker added to the queue: ${newPool}`,
    );
    this._workersQueue.push(newPool);
  }
}
