import { SuiClient, CoinStruct } from '@mysten/sui.js/client';
import { Keypair } from '@mysten/sui.js/src/cryptography';
import { SuiObjectRef } from '@mysten/sui.js/src/types/objects';
import { TransactionBlock } from '@mysten/sui.js/transactions';

import { Pool } from './pool';

type WorkerPool = {
  status: 'available' | 'busy';
  pool: Pool;
};

// SplitStrategy defines the predicates used to split the pool's objects and coins
// to get new worker pools.
type SplitStrategy = {
  objPred: (obj: SuiObjectRef | undefined) => boolean | null;
  coinPred: (coin: CoinStruct | undefined) => boolean | null;
};

export class ExecutorServiceHandler {
  private _mainPool: Pool;
  private _workers: WorkerPool[] = [];
  private constructor(mainPool: Pool) {
    this._mainPool = mainPool;
  }

  public static initialize(keypair: Keypair, client: SuiClient) {
    return Pool.full({ keypair: keypair, client }).then((pool) => {
      return new ExecutorServiceHandler(pool);
    });
  }

  public async execute(
    txb: TransactionBlock,
    client: SuiClient,
    splitStrategy: SplitStrategy,
    retries: number = 1,
  ) {
    let res;
    do {
      res = await this.executeFlow(txb, client, splitStrategy);
      if (res) {
        return res;
      }
    } while (retries-- > 0);
    throw new Error('Internal server error - could not execute the txb');
  }

  private async executeFlow(
    txb: TransactionBlock,
    client: SuiClient,
    splitStrategy: SplitStrategy,
  ) {
    const worker: WorkerPool | undefined = this.getAWorker();
    const noWorkerAvailable = worker === undefined;
    if (noWorkerAvailable) {
      this.addWorker(splitStrategy);
      return
    } else {
      // An available worker is found! Assign to it the task of executing the txb.
      worker.status = 'busy';  // Worker is now busy

      const result = await worker.pool.signAndExecuteTransactionBlock({
        transactionBlock: txb,
        client: client,
      });

      if (result.effects!.status.status === 'failure') {
        this.removeWorker(worker);
        return
      }

      worker.status = 'available';  // Execution finished, the worker is now available again.
      return result;
    }
  }

  /*
  Get an available worker from the workers array.
  If an available worker is not found in the time span of TIMEOUT_MS, return undefined.
  */
  private getAWorker(): WorkerPool | undefined {
    const TIMEOUT_MS = 1000;
    const startTime = new Date().getTime();
    while (new Date().getTime() - startTime < TIMEOUT_MS) {
      const result = this._workers.find(
        (worker: WorkerPool) => worker.status === 'available',
      );
      if (result) {
        console.log('Available worker found!');
        return result;
      }
    }
    if (new Date().getTime() - startTime >= TIMEOUT_MS) {
      console.log('Timeout reached - no available worker found.');
    }
  }

  /*
    Add a worker to the workers array.
    The worker is created by splitting the main pool and the new pool
    that is produced is added to the workers array.
   */
  private addWorker(splitStrategy: SplitStrategy) {
    const newPool = this._mainPool.split(
      splitStrategy.objPred,
      splitStrategy.coinPred,
    );
    this._workers.push({ status: 'available', pool: newPool });
  }

  /*
   Remove the worker from the workers array and merge
   it back to the main pool.
   TODO - do this if the pool.signAndExecuteTransactionBlock *dry run* fails.
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