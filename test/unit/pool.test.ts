import { CoinStruct, getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromB64 } from '@mysten/sui.js/utils';
import { SuiObjectRef } from '@mysten/sui.js/src/types/objects';

import { Pool } from '../../src';
import { TransactionBlock } from "@mysten/sui.js/transactions";
import exp from 'constants';

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
  url: getFullnodeUrl('testnet'),
});


describe('Pool creation with factory', () => {
  beforeEach(() => {
    // Reset the mock before each test
    jest.clearAllMocks();
    jest.setTimeout(10000);
  });

  /// WARNING this test might fail if the account
  /// has no coins or objects (NFTs).
  it('creates a pool correctly', async () => {
    const pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });

    expect(pool.objects.length).toBeGreaterThan(0); 
    expect(pool.coins.length).toBeGreaterThan(0);
  });
});


describe('✂️ Pool splitting', () => {
  it('splits a pool using an <always-true> predicate', async () => {
    /* 
    Create a pool 
    */
    const initial_pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    }); 
    const num_objects_before_split = initial_pool.objects.length;
    const num_coins_before_split = initial_pool.coins.length;

    /* 
    Split the initial pool, moving some objects to 
    a newly created pool. Since the predicate returns only true,
    all objects will be moved to the new pool.
    */
    const always_true_predicate = (_obj: SuiObjectRef | CoinStruct | undefined) => true;
    const new_pool: Pool = initial_pool.split(always_true_predicate, always_true_predicate);  
    const num_objects_new_pool = new_pool.objects.length;
    
    /* 
    Number of objects in the initial pool has changed! 
    Some of them have been moved to new_pool (based on the predicate), 
    so we calculate the new number of objects in the initial pool. 
    */
    const num_objects_after_split = initial_pool.objects.length;
    const num_coins_after_split = initial_pool.coins.length;

    expect(num_objects_new_pool + num_objects_after_split)
          .toEqual(num_objects_before_split);
    expect(num_coins_after_split + num_coins_before_split)
          .toEqual(num_coins_before_split);    
  });

  it('splits a pool using an <always-false> predicate', async () => {
    /* 
    Create a pool 
    */
    const initial_pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    }); 
    const num_objects_before_split = initial_pool.objects.length;
    const num_coins_before_split = initial_pool.coins.length;

    /* 
    Split the initial pool, moving some objects to 
    a newly created pool. Since the predicate returns only false,
    no objects will be moved to the new pool.
    */
    const always_false_predicate = (_obj: SuiObjectRef | CoinStruct | undefined) => false;
    const new_pool: Pool = initial_pool.split(always_false_predicate, always_false_predicate);  
    const num_objects_new_pool = new_pool.objects.length;
    const num_coins_new_pool = new_pool.coins.length;
   /* 
    Number of objects in the initial pool (could have) changed! 
    Some of them might have been moved to new_pool (based on the predicate), 
    so we calculate the new number of objects in the initial pool. 
    */
    const num_objects_after_split = initial_pool.objects.length;
    const num_coins_after_split = initial_pool.coins.length;
    expect(num_objects_new_pool + num_objects_after_split)
          .toEqual(num_objects_before_split);
    expect(num_coins_after_split + num_coins_new_pool)
          .toEqual(num_coins_before_split);
  });

  it('splits a pool using an <always-null> predicate', async () => {
    /* 
    Create a pool 
    */
    const initial_pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    }); 
    const num_objects_before_split = initial_pool.objects.length;
    const num_coins_before_split = initial_pool.coins.length;

    /* 
    Split the initial pool, moving some objects to 
    a newly created pool. Since the predicate returns only null,
    no objects will be moved to the new pool.
    */
    const always_null_predicate = (_obj: SuiObjectRef | CoinStruct | undefined) => null;
    const new_pool: Pool = initial_pool.split(always_null_predicate, always_null_predicate);  
    const num_objects_new_pool = new_pool.objects.length;
    const num_coins_new_pool = new_pool.coins.length;

    /* 
    Number of objects in the initial pool (could have) changed! 
    Some of them might have been moved to new_pool (based on the predicate), 
    so we calculate the new number of objects in the initial pool. 
    */
    const num_objects_after_split = initial_pool.objects.length;
    const num_coins_after_split = initial_pool.coins.length;

    expect(num_objects_new_pool + num_objects_after_split)
          .toEqual(num_objects_before_split);
    expect(num_coins_after_split + num_coins_new_pool)
          .toEqual(num_coins_before_split);
  });

  /// This is not a testing an edge case scenario.
  /// In this case we use a predicate that could be used in a real scenario.
  /// === WARNING! === 
  /// To run this test you need to: 
  /// 1. have at least N objects in your account.
  /// 2. have at least C coins in your account.
  it('splits a pool using a normal-scenario predicate', async () => {
    // Create a pool 
    const initial_pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    }); 
    const num_objects_before_split = initial_pool.objects.length;
    const num_coins_before_split = initial_pool.coins.length;

    /*
    Define a normal scenario predicate.
    Transfer 10 objects to the new pool and keep the rest to the initial pool.
    */

    // Check that N is less than the number of objects in the initial pool just to be safe
    const num_objects_for_new_pool = 3;  // i.e. N (current number of objects in pool'creators account)
    expect(num_objects_for_new_pool).toBeLessThanOrEqual(num_objects_before_split);
    // Define the predicate for the pool.objects split
    var counter = 0;
    const predicate_obj = (obj: SuiObjectRef | undefined): boolean | null => {
      if (counter < num_objects_for_new_pool) {
        counter++;
        return true;
      } else {
        return false;
      }
    } ;

    // Define the predicate for the pool.coins split
    const num_coins_for_new_pool = 1;  // i.e. N (current number of objects in pool'creators account)
    let counter_coins = 0;
    const predicate_coins = (_coin: CoinStruct | undefined): boolean | null => {
      if (counter_coins < num_coins_for_new_pool) {
        counter_coins++;
        return true;
      } else {
        return false;
      }
    } ;

    /* 
    Split the initial pool, moving some objects to 
    a newly created pool.
    */
    const new_pool: Pool = initial_pool.split(predicate_obj, predicate_coins);  
    const num_objects_new_pool = new_pool.objects.length;
    const num_coins_new_pool = new_pool.coins.length;
    /* 
    Number of objects in the initial pool has changed! 
    Some of them have been moved to new_pool (based on the predicate), 
    so we calculate the new number of objects in the initial pool. 
    */
    const num_objects_after_split = initial_pool.objects.length;
    const num_coins_after_split = initial_pool.coins.length;

    // Validity checks for object array splitting
    expect(num_objects_new_pool).toEqual(num_objects_for_new_pool);
    expect(num_objects_after_split).toEqual(num_objects_before_split - num_objects_for_new_pool);
    expect(num_objects_new_pool + num_objects_after_split).toEqual(num_objects_before_split);
    
    // Validity checks for coin array splitting
    expect(num_coins_new_pool).toEqual(num_coins_for_new_pool);
    expect(num_coins_after_split).toEqual(num_coins_before_split - num_coins_for_new_pool);
    expect(num_coins_new_pool + num_coins_after_split).toEqual(num_coins_before_split);
  });
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
    expect(objects.length).toBeGreaterThan(0);

    // Admin transfers an object that belongs to him back to himself.  
    const txb = new TransactionBlock();
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    
    // Include a transfer nft object transaction in the transaction block
    txb.transferObjects([txb.object(testObjectId)], txb.pure(adminAddress))
    
    // Include a transfer coin transaction in the transaction block
    const [coin] = txb.splitCoins(txb.gas, [txb.pure(1)]);
    txb.transferObjects([coin], txb.pure("0xCAFE")); // Transferring the object to a test address
    
    // Check ownership of the objects in the transaction block.
    expect(pool.check_total_ownership(txb)).toBeTruthy();
  });

  it('checks falsy object ownership', async () => {
    // Create a pool
    const pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });
    const objects = pool.objects;

    // Check that pool was created and contains at least 1 object
    expect(objects.length).toBeGreaterThan(0);

    // Admin transfers a random object that doesn't belong to himself.  
    const txb = new TransactionBlock();
    const falsyObjectId = "0x02004"; // random object id - non existent
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    txb.transferObjects([txb.object(falsyObjectId)], txb.pure(adminAddress));

    // Check ownership of the objects in the transaction block.
    expect(pool.check_total_ownership(txb)).toBeFalsy();
  });

  it('signs and executes a tx block', async () => {
    // Create a pool
    const pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });
    const objects = pool.objects;

    // Check that pool was created and contains at least 1 object
    expect(objects.length).toBeGreaterThan(0);

    // Admin transfers an object that belongs to him back to himself.  
    const txb = new TransactionBlock();
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    txb.transferObjects([txb.object(testObjectId)], txb.pure(adminAddress))
    
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
    if (res) expect(res.effects!.status.status).toEqual('success');
  });

});