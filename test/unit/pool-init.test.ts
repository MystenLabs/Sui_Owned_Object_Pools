import { CoinStruct, SuiClient } from '@mysten/sui.js/client';
import { SuiObjectRef } from '@mysten/sui.js/src/types/objects';
import { Pool, SplitStrategy } from '../../src';
import {
  getEnvironmentVariables,
  SetupTestsHelper,
  compareMaps,
  sleep,
  getKeyPair,
} from '../../src/helpers';

const env = getEnvironmentVariables();
const adminKeypair = getKeyPair(env.ADMIN_SECRET_KEY);
const client = new SuiClient({
  url: env.SUI_NODE,
});

const MINIMUM_NUMBER_OF_ADMIN_OBJECTS = 3;

describe('Pool creation with factory', () => {
  beforeEach(() => {
    // Reset the mock before each test
    jest.clearAllMocks();
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
    const helper = new SetupTestsHelper();
    await helper.setupAdmin(
      MINIMUM_NUMBER_OF_ADMIN_OBJECTS,
      MINIMUM_NUMBER_OF_ADMIN_OBJECTS * 2
    );
    sleep(2000);
  });

  it('splits a pool moving all objects to the new pool', async () => {
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
    const splitStrategy: SplitStrategy = {
      objPred: (_: SuiObjectRef | undefined) => true,
      coinPred: (_: CoinStruct | undefined) => true,
    };
    const new_pool: Pool = initial_pool.split(splitStrategy);
    const num_objects_new_pool = new_pool.objects.size;

    /*
    Number of objects in the initial pool has changed!
    Some of them have been moved to new_pool (based on the predicate),
    so we calculate the new number of objects in the initial pool.
    */
    const num_objects_after_split = initial_pool.objects.size;
    const num_coins_after_split = initial_pool.coins.size;

    expect(num_objects_new_pool + num_objects_after_split).toEqual(
      num_objects_before_split,
    );
    expect(num_coins_after_split + num_coins_before_split).toEqual(
      num_coins_before_split,
    );
  });

  it('splits a pool not moving anything to new pool', async () => {
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
    const splitStrategy: SplitStrategy = {
      objPred: (_: SuiObjectRef | undefined) => false,
      coinPred: (_: CoinStruct | undefined) => false,
    };
    const new_pool: Pool = initial_pool.split(splitStrategy);
    const num_objects_new_pool = new_pool.objects.size;
    const num_coins_new_pool = new_pool.coins.size;
    /*
      Number of objects in the initial pool (could have) changed!
      Some of them might have been moved to new_pool (based on the predicate),
      so we calculate the new number of objects in the initial pool.
      */
    const num_objects_after_split = initial_pool.objects.size;
    const num_coins_after_split = initial_pool.coins.size;
    expect(num_objects_new_pool + num_objects_after_split).toEqual(
      num_objects_before_split,
    );
    expect(num_coins_after_split + num_coins_new_pool).toEqual(
      num_coins_before_split,
    );
  });

  it('splits a pool moving everything to the new pool by using always-null predicate', async () => {
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
    const splitStrategy: SplitStrategy = {
      objPred: (_: SuiObjectRef | undefined) => null,
      coinPred: (_: CoinStruct | undefined) => null,
    }
    const new_pool: Pool = initial_pool.split(splitStrategy);
    const num_objects_new_pool = new_pool.objects.size;
    const num_coins_new_pool = new_pool.coins.size;

    /*
      Number of objects in the initial pool (could have) changed!
      Some of them might have been moved to new_pool (based on the predicate),
      so we calculate the new number of objects in the initial pool.
      */
    const num_objects_after_split = initial_pool.objects.size;
    const num_coins_after_split = initial_pool.coins.size;

    expect(num_objects_new_pool + num_objects_after_split).toEqual(
      num_objects_before_split,
    );
    expect(num_coins_after_split + num_coins_new_pool).toEqual(
      num_coins_before_split,
    );
  });


  it('splits a pool using the default predicate', async () => {
    // Create a pool
    const initial_pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });

    const num_objects_before_split = initial_pool.objects.size;
    const num_coins_before_split = initial_pool.coins.size;

    // Define the predicate for the pool.coins split
    const num_coins_for_new_pool = 1; // i.e. N (current number of objects in pool'creators account)
    let counter_coins = 0;
    const predicate_coins = (_coin: CoinStruct | undefined): boolean | null => {
      if (counter_coins < num_coins_for_new_pool) {
        counter_coins++;
        return true;
      } else {
        return false;
      }
    };

    /*
      Split the initial pool, moving some objects to
      a newly created pool.
      */
    const new_pool: Pool = initial_pool.split();
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
    expect(num_objects_new_pool).toEqual(1);
    expect(num_objects_after_split).toEqual(
      num_objects_before_split - 1,
    );
    expect(num_objects_new_pool + num_objects_after_split).toEqual(
      num_objects_before_split,
    );

    // Validity checks for coin array splitting
    expect(num_coins_new_pool).toEqual(num_coins_for_new_pool);
    expect(num_coins_after_split).toEqual(
      num_coins_before_split - num_coins_for_new_pool,
    );
    expect(num_coins_new_pool + num_coins_after_split).toEqual(
      num_coins_before_split,
    );
  });

  it('merges back a pool', async () => {
    // Create the pool
    const initial_pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });
    // Keep a copy of the initial pool's objects and coins
    const objectsBeforeSplit = new Map(initial_pool.objects);
    const coinsBeforeSplit = new Map(initial_pool.coins);

    const new_pool: Pool = initial_pool.split();
    // Merge the new pool back to the initial pool
    initial_pool.merge(new_pool);

    const objectsAfterMerge = initial_pool.objects;
    const coinsAfterMerge = initial_pool.coins;

    // Compare that the objects and coins are the same before and after the split-merge
    expect(compareMaps(objectsBeforeSplit, objectsAfterMerge)).toBeTruthy();
    expect(compareMaps(coinsBeforeSplit, coinsAfterMerge)).toBeTruthy();
  });
});
