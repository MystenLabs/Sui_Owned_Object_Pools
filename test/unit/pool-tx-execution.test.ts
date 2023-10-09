import { CoinStruct, getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromB64 } from '@mysten/sui.js/utils';
import { SuiObjectRef } from '@mysten/sui.js/src/types/objects';

import { Pool } from '../../src';
import { TransactionBlock } from "@mysten/sui.js/transactions";


const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const TEST_USER_ADDRESS: string = process.env.TEST_USER_ADDRESS!;
const ADMIN_SECRET_KEY: string = process.env.ADMIN_SECRET_KEY!;
const adminPrivateKeyArray = Uint8Array.from(
  Array.from(fromB64(ADMIN_SECRET_KEY)),
);
const adminKeypair = Ed25519Keypair.fromSecretKey(
  adminPrivateKeyArray.slice(1),
);
const testUserPrivateKeyArray = Uint8Array.from(
  Array.from(fromB64(process.env.TEST_USER_SECRET!)),
);
const testUserKeypair = Ed25519Keypair.fromSecretKey(
  testUserPrivateKeyArray.slice(1),
);

const client = new SuiClient({
  url: getFullnodeUrl('testnet'),
});




describe('🌊 Basic flow of sign & execute tx block', () => {
  const chunksOfGas = 2;  // FIXME - unused
  const txnsEstimate = 10;  // FIXME - unused
  const testObjectId = process.env.TEST_NFT_OBJECT_ID!;

  beforeEach(() => {
    // Reset the mock before each test
    jest.clearAllMocks();
    jest.setTimeout(10000);
  });

  it('checks truthy object ownership', async () => {
    // Create a pool
    const pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });
    const objects = pool.objects;

    // Check that pool was created and contains at least 1 object
    expect(objects.size).toBeGreaterThan(0);

    // Admin transfers an object that belongs to him back to himself.  
    const txb = new TransactionBlock();
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    
    // Include a transfer nft object transaction in the transaction block
    txb.transferObjects([txb.object(testObjectId)], txb.pure(adminAddress))
    
    // Include a transfer coin transaction in the transaction block
    const [coin] = txb.splitCoins(txb.gas, [txb.pure(1)]);
    txb.transferObjects([coin], txb.pure(TEST_USER_ADDRESS)); // Transferring the object to a test address
    
    // Check ownership of the objects in the transaction block.
    expect(pool.checkTotalOwnership(txb)).toBeTruthy();
  });

  it('checks falsy object ownership', async () => {
    // Create a pool
    const pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });
    const objects = pool.objects;

    // Check that pool was created and contains at least 1 object
    expect(objects.size).toBeGreaterThan(0);

    // Admin transfers a random object that doesn't belong to himself.  
    const txb = new TransactionBlock();
    const falsyObjectId = "0x02004"; // random object id - non existent
    txb.transferObjects([txb.object(falsyObjectId)], txb.pure(TEST_USER_ADDRESS));

    // Check ownership of the objects in the transaction block.
    expect(pool.checkTotalOwnership(txb)).toBeFalsy();
  });

  it('signs and executes a tx block', async () => {
    // Create a pool
    const pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });
    const objects = pool.objects;

    // Check that pool was created and contains at least 1 object
    expect(objects.size).toBeGreaterThan(0);

    // Admin transfers an object that belongs to him back to himself.  
    const txb = new TransactionBlock();
    const recipientAddress = TEST_USER_ADDRESS
    txb.transferObjects([txb.object(testObjectId)], txb.pure(recipientAddress))

    const res = await pool.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      requestType: "WaitForLocalExecution",
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true
      },
    });

    expect(res).toBeDefined();
    expect(res.effects!.status.status).toEqual('success');
    
    const recipientObjects = await client.getOwnedObjects({owner: recipientAddress});
    const transferred_object = recipientObjects.data.find(
      (obj) => obj.data?.objectId === testObjectId
      );
    expect(transferred_object).toBeDefined();

    // Send NFT back to the original owner
    const txb2 = new TransactionBlock();
    txb2.transferObjects(
      [txb2.object(testObjectId)], 
      txb2.pure(adminKeypair.getPublicKey().toSuiAddress())
      )
    client.signAndExecuteTransactionBlock({
      transactionBlock: txb2,
      requestType: "WaitForLocalExecution",
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true
      },
      signer: testUserKeypair
    });
  });
});