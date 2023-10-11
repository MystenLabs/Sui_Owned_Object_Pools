import { CoinStruct, getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromB64 } from '@mysten/sui.js/utils';
import { SuiObjectRef } from '@mysten/sui.js/src/types/objects';
// @ts-ignore
import { Pool } from '../../src';


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

      expect(pool.objects.size).toBeGreaterThan(0);
      expect(pool.coins.size).toBeGreaterThan(0);
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
      const num_objects_before_split = initial_pool.objects.size;
      const num_coins_before_split = initial_pool.coins.size;

      /*
      Split the initial pool, moving some objects to
      a newly created pool. Since the predicate returns only true,
      all objects will be moved to the new pool.
      */
      const always_true_predicate = (_obj: SuiObjectRef | CoinStruct | undefined) => true;
      const new_pool: Pool = initial_pool.split(always_true_predicate, always_true_predicate);
      const num_objects_new_pool = new_pool.objects.size;

      /*
      Number of objects in the initial pool has changed!
      Some of them have been moved to new_pool (based on the predicate),
      so we calculate the new number of objects in the initial pool.
      */
      const num_objects_after_split = initial_pool.objects.size;
      const num_coins_after_split = initial_pool.coins.size;

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
      const num_objects_before_split = initial_pool.objects.size;
      const num_coins_before_split = initial_pool.coins.size;

      /*
      Split the initial pool, moving some objects to
      a newly created pool. Since the predicate returns only false,
      no objects will be moved to the new pool.
      */
      const always_false_predicate = (_obj: SuiObjectRef | CoinStruct | undefined) => false;
      const new_pool: Pool = initial_pool.split(always_false_predicate, always_false_predicate);
      const num_objects_new_pool = new_pool.objects.size;
      const num_coins_new_pool = new_pool.coins.size;
     /*
      Number of objects in the initial pool (could have) changed!
      Some of them might have been moved to new_pool (based on the predicate),
      so we calculate the new number of objects in the initial pool.
      */
      const num_objects_after_split = initial_pool.objects.size;
      const num_coins_after_split = initial_pool.coins.size;
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
      const num_objects_before_split = initial_pool.objects.size;
      const num_coins_before_split = initial_pool.coins.size;

      /*
      Split the initial pool, moving some objects to
      a newly created pool. Since the predicate returns only null,
      no objects will be moved to the new pool.
      */
      const always_null_predicate = (_obj: SuiObjectRef | CoinStruct | undefined) => null;
      const new_pool: Pool = initial_pool.split(always_null_predicate, always_null_predicate);
      const num_objects_new_pool = new_pool.objects.size;
      const num_coins_new_pool = new_pool.coins.size;

      /*
      Number of objects in the initial pool (could have) changed!
      Some of them might have been moved to new_pool (based on the predicate),
      so we calculate the new number of objects in the initial pool.
      */
      const num_objects_after_split = initial_pool.objects.size;
      const num_coins_after_split = initial_pool.coins.size;

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
      const num_objects_before_split = initial_pool.objects.size;
      const num_coins_before_split = initial_pool.coins.size;

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
      const num_objects_new_pool = new_pool.objects.size;
      const num_coins_new_pool = new_pool.coins.size;
      /*
      Number of objects in the initial pool has changed!
      Some of them have been moved to new_pool (based on the predicate),
      so we calculate the new number of objects in the initial pool.
      */
      const num_objects_after_split = initial_pool.objects.size;
      const num_coins_after_split = initial_pool.coins.size;

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