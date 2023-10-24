import { CoinStruct, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromB64 } from '@mysten/sui.js/utils';
import { SuiObjectRef } from '@mysten/sui.js/src/types/objects';
import { Pool } from '../../src';
import { compareMaps, SetupTestsHelper } from '../../src/helpers';

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

const MINIMUM_NUMBER_OF_ADMIN_OBJECTS = 3;

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
    beforeEach(async () => {
      try {
        const helper = new SetupTestsHelper();
        await helper.setupAdmin(MINIMUM_NUMBER_OF_ADMIN_OBJECTS);
      } catch (e) {
        console.warn(e);
        console.log("Retrying admin setup...");
        const helper = new SetupTestsHelper();
        await helper.setupAdmin(MINIMUM_NUMBER_OF_ADMIN_OBJECTS);
      }
    });

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

    /// This is not an edge case test scenario.
    /// In this case we use a predicate that could be used in a real scenario.
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
      */

      const num_objects_for_new_pool = MINIMUM_NUMBER_OF_ADMIN_OBJECTS - 1;

      // Check that N is less than the number of objects in the initial pool just to be safe
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

    it('splits a pool and merges it back', async () => {
      // Create the pool
      const initial_pool: Pool = await Pool.full({
        keypair: adminKeypair,
        client: client,
      });
      // Keep a copy of the initial pool's objects and coins
      const objectsBeforeSplit = new Map(initial_pool.objects);
      const coinsBeforeSplit = new Map(initial_pool.coins);

      // Split the pool
      var c= 0;
      const pred = (_: SuiObjectRef | CoinStruct | undefined) => {
        return c++ < 2;  // Dumb predicate, doesn't matter much, could use a different one
      }
      const new_pool: Pool = initial_pool.split(pred, pred);
      // Merge the new pool back to the initial pool
      initial_pool.merge(new_pool);

      const objectsAfterMerge = initial_pool.objects;
      const coinsAfterMerge = initial_pool.coins;

      // Compare that the objects and coins are the same before and after the split-merge
      expect(compareMaps(objectsBeforeSplit, objectsAfterMerge)).toBeTruthy();
      expect(compareMaps(coinsBeforeSplit, coinsAfterMerge)).toBeTruthy();
    });
  });