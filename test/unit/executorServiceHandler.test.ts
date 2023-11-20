import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';

import { ExecutorServiceHandler } from '../../src/executorServiceHandler';
import { Pool } from '../../src/pool';
import { getKeyPair, sleep } from '../helpers/helpers';
import { getEnvironmentVariables } from '../helpers/setupEnvironmentVariables';
import { SetupTestsHelper } from '../helpers/setupTestsHelper';

const env = getEnvironmentVariables('../test/.test.env', true);
const adminKeypair = getKeyPair(env.ADMIN_SECRET_KEY);
const client = new SuiClient({
  url: env.SUI_NODE,
});
const MIST_TO_TRANSFER = 10;
const helper = new SetupTestsHelper();

// Create a transaction that transfers MIST from the admin to a test user address.
function createPaymentTxb(recipient: string): TransactionBlock {
  const txb = new TransactionBlock();
  const [coin] = txb.splitCoins(txb.gas, [txb.pure(MIST_TO_TRANSFER)]);
  txb.transferObjects([coin], txb.pure(recipient));
  return txb;
}

describe('Test pool adaptability to requests with ExecutorServiceHandler', () => {
  it('parses coins from owned objects', async () => {
    const pool = await Pool.full({ client, keypair: adminKeypair });
    const coinsFromClient = new Map();
    let coins_resp;
    let cursor = null;
    do {
      coins_resp = await client.getAllCoins({
        owner: adminKeypair.toSuiAddress(),
        cursor,
      });
      coins_resp.data.forEach((coin) => {
        coinsFromClient.set(coin.coinObjectId, coin);
      });
      cursor = coins_resp?.nextCursor;
    } while (coins_resp.hasNextPage);
    const coinsFromOwnedObjects = pool.gasCoins;
    expect(
      Array.from(coinsFromOwnedObjects.keys()).every((key) => {
        return coinsFromClient.has(key);
      }),
    ).toBeTruthy();
  });

  it('creates multiple transactions and executes them in parallel', async () => {
    const NUMBER_OF_TRANSACTION_TO_EXECUTE = 5;
    const COINS_NEEDED = NUMBER_OF_TRANSACTION_TO_EXECUTE * 2;

    await helper.setupAdmin(
      0, // doesn't play a role for this test since we only transfer coins
      COINS_NEEDED,
    );
    await helper.smashCoins();
    await sleep(3000);
    // Pass this transaction to the ExecutorServiceHandler. The ExecutorServiceHandler will
    // forward the transaction to a worker pool, which will sign and execute the transaction.
    const eshandler = await ExecutorServiceHandler.initialize(
      adminKeypair,
      client,
      env.GET_WORKER_TIMEOUT_MS,
    );

    const promises: Promise<SuiTransactionBlockResponse>[] = [];
    let txb: TransactionBlock;
    for (let i = 0; i < NUMBER_OF_TRANSACTION_TO_EXECUTE; i++) {
      txb = createPaymentTxb(env.TEST_USER_ADDRESS);
      promises.push(eshandler.execute(txb, client));
    }

    const results = await Promise.allSettled(promises);
    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.error(result.reason);
      }
      expect(result.status).toEqual('fulfilled');
    });
  });
});
