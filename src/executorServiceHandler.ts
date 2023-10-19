import { Pool } from './pool'
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import { Keypair } from '@mysten/sui.js/src/cryptography';

type WorkerPool = {
  status: "available" | "busy"
  pool: Pool
}
export class ExecutorServiceHandler {
  private _keypair: Keypair;
  private _mainPool: Pool;
  private _workers: WorkerPool[] = [];
  private constructor(keypair: Keypair, mainPool: Pool) {
    this._keypair = keypair;
    this._mainPool = mainPool;
  }

  public static initialize(keypair: Keypair, client: SuiClient) {
    return Pool.full({keypair: keypair, client}).then((pool) => {
      return new ExecutorServiceHandler(keypair, pool);
    });
  }

  async execute(txb: TransactionBlock, client: SuiClient){
    const worker: WorkerPool | undefined = this.getWorker();
    if (worker === undefined) {
      // TODO Add new worker(s) to the pool by splitting the main pool.
    } else {
      worker.status = "busy";
      const result = await worker.pool.signAndExecuteTransactionBlock(
        { transactionBlock: txb, client: client }
      )
      worker.status = "available";
      return result
    }
  }

  /*
  Get an available worker.
  If a worker is not found in the span of TIMEOUT_MS, return undefined.
  */
  private getWorker(): WorkerPool | undefined {
    const TIMEOUT_MS = 1000;
    const startTime = new Date().getTime();
    while (new Date().getTime() - startTime < TIMEOUT_MS) {
      const result = this._workers.find(
        (worker: WorkerPool) => worker.status === "available"
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
}
