import { SuiClient } from '@mysten/sui.js/client';
import { SuiTransactionBlockResponse } from '@mysten/sui.js/src/client';
import { Keypair } from '@mysten/sui.js/src/cryptography';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { firstValueFrom, from, interval } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import { getEnvironmentVariables } from './helpers';
import { Pool, SplitStrategy } from './pool';

type WorkerPool = {
  status: 'available' | 'busy';
  pool: Pool;
};

export class ExecutorServiceHandler {
  private _mainPool: Pool;
  private _workers: WorkerPool[] = [];
  private readonly _getWorkerTimeoutMs: number = 1000;
  private constructor(mainPool: Pool, pathToEnv?: string) {
    if (pathToEnv) {
      this._getWorkerTimeoutMs =
        getEnvironmentVariables(pathToEnv).GET_WORKER_TIMEOUT_MS;
    } else {
      this._getWorkerTimeoutMs =
        getEnvironmentVariables().GET_WORKER_TIMEOUT_MS;
    }
    this._mainPool = mainPool;
  }

  public static async initialize(keypair: Keypair, client: SuiClient) {
    return Pool.full({ keypair: keypair, client }).then((pool) => {
      return new ExecutorServiceHandler(pool);
    });
  }

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
        console.log('Error executing transaction block');
        console.log(e);
        continue;
      }
      if (res) {
        return res;
      }
    } while (retries-- > 0);
    throw new Error(
      'Internal server error - All retries failed: Could not execute the transaction block',
    );
  }

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
        return;
      }

      console.log('Transaction block execution completed!');
      worker.status = 'available'; // Execution finished, the worker is now available again.
      return result;
    }
  }

  /*
  Get an available worker from the workers array.
  If an available worker is not found in the time span of TIMEOUT_MS, return undefined.
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

  /*
    Add a worker to the workers array.
    The worker is created by splitting the main pool and the new pool
    that is produced is added to the workers array.
   */
  private async addWorker(client: SuiClient, splitStrategy?: SplitStrategy) {
    console.log('Splitting main pool to add new worker Pool...');
    const newPool = await this._mainPool.split(client, splitStrategy);
    this._workers.push({ status: 'available', pool: newPool });
  }

  /*
   Remove the worker from the workers array and merge
   it back to the main pool.
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
