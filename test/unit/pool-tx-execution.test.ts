import path from 'path';
import { SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromB64 } from '@mysten/sui.js/utils';
import { compareMaps, SetupTestsHelper, sleep } from '../../src/helpers';
import { Pool } from '../../src';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiObjectRef } from '@mysten/sui.js/src/types/objects';
import { CoinStruct } from '@mysten/sui.js/src/client';

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
  url: process.env.SUI_NODE!,
});
const NFT_APP_PACKAGE_ID = process.env.NFT_APP_PACKAGE_ID!;
const NFT_APP_ADMIN_CAP = process.env.NFT_APP_ADMIN_CAP!;

let helper: SetupTestsHelper;
describe('🌊 Basic flow of sign & execute tx block', () => {
  beforeEach(async () => {
    // Reset the mock before each test
    jest.clearAllMocks();
    helper = new SetupTestsHelper();
    await helper.setupAdmin(10);
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
    const testObjectId: string = helper.objects[0].data?.objectId!;
    txb.transferObjects([txb.object(testObjectId)], txb.pure(adminAddress));

    // Include a transfer coin transaction in the transaction block
    const [coin] = txb.splitCoins(txb.gas, [txb.pure(1)]);
    txb.transferObjects([coin], txb.pure(TEST_USER_ADDRESS)); // Transferring the object to a test address
    txb.setSender(adminAddress);
    // Check ownership of the objects in the transaction block.
    expect(pool.checkTotalOwnership(txb, client)).toBeTruthy();
  });

  const falsyObjectIds: string =
    '0x05d97725fd32745a35fe746489a92c80d0b7eac00vba2df51216457e5e9d8807'; // Random string
  it.each([falsyObjectIds])(
    'checks falsy object ownership',
    async (falsyObjectId) => {
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
      const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
      txb.setSender(adminAddress);

      txb.transferObjects(
        [txb.object(falsyObjectId)],
        txb.pure(TEST_USER_ADDRESS),
      );

      // Check ownership of the objects in the transaction block.
      let owned = await pool.checkTotalOwnership(txb, client);
      expect(owned).toBeFalsy();
    },
  );

  it("uses only the pool's coins for gas", async () => {
    /*
    When a pool signs and executes a txb, it should use only its own coins for gas.
    */
    /* Create a pool */
    const poolOne: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });

    /* 
    Split the pool by: transfering all objects and at least one coin
    to the new one. 
    */
    const predObj = (o: SuiObjectRef | undefined) => {
      return true; // Transfer every object to the new pool
    };
    // Keep one coin in the initial pool and move the rest to the new pool
    var counter = 0;
    const predCoins = (_coin: CoinStruct | undefined): boolean | null => {
      if (counter < 1) {
        counter++;
        return true;
      } else {
        return false;
      }
    };
    const poolTwo: Pool = poolOne.split(predObj, predCoins);

    /*
    Create a nft object using the first pool and
    transfer it to yourself (admin
    */
    const txb = new TransactionBlock();

    let hero = txb.moveCall({
      arguments: [
        txb.object(NFT_APP_ADMIN_CAP!),
        txb.pure('zed'),
        txb.pure('gold'),
        txb.pure(3),
        txb.pure('ipfs://example.com/'),
      ],
      target: `${NFT_APP_PACKAGE_ID}::hero_nft::mint_hero`,
    });

    txb.transferObjects(
      [hero],
      txb.pure(adminKeypair.getPublicKey().toSuiAddress()),
    );
    txb.setGasBudget(10000000);
    const poolOneCoinsBeforeTxbExecution = new Map(poolOne.coins);
    const poolTwoCoinsBeforeTxbExecution = new Map(poolTwo.coins);
    const res = await poolOne.signAndExecuteTransactionBlock({
      client,
      transactionBlock: txb,
      requestType: 'WaitForLocalExecution',
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });
    expect(res.effects!.status.status).toEqual('success');

    // Assert that the poolOne's coins were used for gas
    expect(
      compareMaps(poolOneCoinsBeforeTxbExecution, poolOne.coins),
    ).toBeFalsy();
    // Assert that the poolTwo's coins were not used for gas
    expect(
      compareMaps(poolTwoCoinsBeforeTxbExecution, poolTwo.coins),
    ).toBeTruthy();
  });
});

describe('Transaction block execution directly from pool', () => {
  beforeEach(async () => {
    // Reset the mock before each test
    jest.clearAllMocks();
    helper = new SetupTestsHelper();
    await helper.setupAdmin(10);
    await sleep(2000)
  });

  it('mints nft and transfers it to self', async () => {
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

    let hero = txb.moveCall({
      arguments: [
        txb.object(NFT_APP_ADMIN_CAP!),
        txb.pure('zed'),
        txb.pure('gold'),
        txb.pure(3),
        txb.pure('ipfs://example.com/'),
      ],
      target: `${NFT_APP_PACKAGE_ID}::hero_nft::mint_hero`,
    });

    txb.transferObjects(
      [hero],
      txb.pure(adminKeypair.getPublicKey().toSuiAddress()),
    );
    txb.setGasBudget(10000000);
    const res = await pool.signAndExecuteTransactionBlock({
      client,
      transactionBlock: txb,
      requestType: 'WaitForLocalExecution',
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });
    expect(res.effects!.status.status).toEqual('success');

    // Assert that the pool was updated by checking that the object
    // that was created is in the object's pool.
    const createdObj = res.effects!.created![0];
    expect(pool.objects.has(createdObj.reference.objectId)).toBeTruthy();
  });

  it('mints nft, transfers it to a test user', async () => {
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
    const recipientAddress = TEST_USER_ADDRESS;
    const testObjectId: string = helper.objects[0].data?.objectId!;
    txb.transferObjects([txb.object(testObjectId)], txb.pure(recipientAddress));

    const res = await pool.signAndExecuteTransactionBlock({
      client,
      transactionBlock: txb,
      requestType: 'WaitForLocalExecution',
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });

    expect(res).toBeDefined();
    expect(res.effects!.status.status).toEqual('success');
  });
});
