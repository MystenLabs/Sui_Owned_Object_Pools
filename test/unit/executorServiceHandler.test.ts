import { ExecutorServiceHandler } from '../../src/executorServiceHandler';
import { SuiClient } from '@mysten/sui.js/client';
import { fromB64 } from '@mysten/sui.js/utils';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';


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
    const eshandler = await ExecutorServiceHandler.initialize(adminKeypair, client);
    const txb = new TransactionBlock();
    eshandler.execute(txb, client);
  });
});
