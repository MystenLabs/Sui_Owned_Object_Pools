import { ExecutorServiceHandler } from '../../src/executorServiceHandler';
import { SuiClient } from '@mysten/sui.js/client';
import { fromB64 } from '@mysten/sui.js/utils';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiObjectRef } from '@mysten/sui.js/src/types/objects';


const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ADMIN_SECRET_KEY: string = process.env.ADMIN_SECRET_KEY!;
const adminPrivateKeyArray = Uint8Array.from(
  Array.from(fromB64(ADMIN_SECRET_KEY)),
);
const adminKeypair = Ed25519Keypair.fromSecretKey(
  adminPrivateKeyArray.slice(1),
);

const client = new SuiClient({
  url: process.env.SUI_NODE!
});

describe('Test pool adaptability to requests with ExecutorServiceHandler', () => {
  it('executes a txb', async () => {
    // TODO - Create multiple txbs like this in order to stress test the eshandler
    // Create a transaction that transfers MIST from the admin to a test user address.
    const txb = new TransactionBlock();
    const MIST_TO_TRANSFER = 1000;
    const [coin] = txb.splitCoins(txb.gas, [txb.pure(MIST_TO_TRANSFER)]);
    txb.transferObjects([coin], txb.pure(process.env.TEST_USER_ADDRESS!));

    // Pass this transaction to the ExecutorServiceHandler. The ExecutorServiceHandler will
    // forward the transaction to a worker pool, which will sign and execute the transaction.
    const eshandler = await ExecutorServiceHandler.initialize(adminKeypair, client);
    var firstRunFlag = 0;
    const splitStrategy = {
      objPred: (_: SuiObjectRef | undefined) => null,

      // Only send the first coin to the new split pool. Keep the rest
      coinPred: () => {
        return firstRunFlag++ === 0
      },
    }
    const res = await eshandler.execute(txb, client, splitStrategy);
    expect(res.effects!.status.status).toEqual('success');
  });
});
