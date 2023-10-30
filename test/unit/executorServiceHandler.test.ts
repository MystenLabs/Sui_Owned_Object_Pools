import { ExecutorServiceHandler } from '../../src/executorServiceHandler';
import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import {
  getEnvironmentVariables,
  SetupTestsHelper,
  sleep,
  getKeyPair,
} from '../../src/helpers';

const env = getEnvironmentVariables();
const adminKeypair = getKeyPair(env.ADMIN_SECRET_KEY);
const client = new SuiClient({
  url: env.SUI_NODE,
});
const MIST_TO_TRANSFER = 10;

// Create a transaction that transfers MIST from the admin to a test user address.
function createPaymentTxb(recipient: string): TransactionBlock {
  const txb = new TransactionBlock();
  const [coin] = txb.splitCoins(txb.gas, [txb.pure(MIST_TO_TRANSFER)]);
  txb.transferObjects([coin], txb.pure(env.TEST_USER_ADDRESS));
  return txb;
}

describe('Test pool adaptability to requests with ExecutorServiceHandler', () => {
  it('creates multiple transactions and executes them in parallel', async () => {
    const NUMBER_OF_TRANSACTION_TO_EXECUTE = 5;
    const COINS_NEEDED = NUMBER_OF_TRANSACTION_TO_EXECUTE * 2;

    const helper = new SetupTestsHelper();
    await helper.setupAdmin(
      0, // doesn't play a role for this test since we only transfer coins
      COINS_NEEDED,
    );
    console.log(
      'Admin setup complete. Waiting a few seconds for effects to take place...',
    );
    await sleep(5000);
    console.log('Done! Proceeding with transactions execution...');
    // Pass this transaction to the ExecutorServiceHandler. The ExecutorServiceHandler will
    // forward the transaction to a worker pool, which will sign and execute the transaction.
    const eshandler = await ExecutorServiceHandler.initialize(
      adminKeypair,
      client,
    );

    const promises = [];
    let txb: TransactionBlock;
    for (let i = 0; i < NUMBER_OF_TRANSACTION_TO_EXECUTE; i++) {
      console.log('Creating new Transaction...');
      txb = createPaymentTxb(env.TEST_USER_ADDRESS);
      promises.push(eshandler.execute(txb, client));
    }

    const results = await Promise.allSettled(promises);
    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.log(result.reason);
      }
      expect(result.status).toEqual('fulfilled');
    });
  });
});
