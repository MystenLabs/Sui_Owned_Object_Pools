import { SuiClient } from '@mysten/sui.js/client';
import { SuiObjectRef } from '@mysten/sui.js/src/types/objects';

import { Pool, SplitStrategy } from '../../src';
import {
  compareMaps,
  getEnvironmentVariables,
  getKeyPair,
  SetupTestsHelper,
  sleep,
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
  });
});

describe('✂️ Pool splitting', () => {
  beforeEach(async () => {
    const helper = new SetupTestsHelper();
    await helper.setupAdmin(
      MINIMUM_NUMBER_OF_ADMIN_OBJECTS,
      MINIMUM_NUMBER_OF_ADMIN_OBJECTS * 2,
    );
    await sleep(2000);
  });

  it('splits a pool not moving anything to new pool using always-false predicate', async () => {
    const initial_pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });
    const num_objects_before_split = initial_pool.objects.size;
    const splitStrategy: SplitStrategy = {
      pred: (_: SuiObjectRef | undefined) => false,
    };
    const new_pool: Pool = initial_pool.split(splitStrategy);
    const num_objects_new_pool = new_pool.objects.size;

    const num_objects_after_split = initial_pool.objects.size;
    expect(num_objects_new_pool).toEqual(0);
    expect(num_objects_before_split).toEqual(num_objects_after_split);
  });

  it('splits a pool not moving anything to the new pool by using always-null predicate', async () => {
    const initial_pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });
    const num_objects_before_split = initial_pool.objects.size;
    const splitStrategy: SplitStrategy = {
      pred: (_: SuiObjectRef | undefined) => null,
    };
    const new_pool: Pool = initial_pool.split(splitStrategy);
    const num_objects_new_pool = new_pool.objects.size;
    const num_objects_after_split = initial_pool.objects.size;

    expect(num_objects_new_pool).toEqual(0);
    expect(num_objects_before_split).toEqual(num_objects_after_split);
  });

  it('splits a pool using the default predicate', async () => {
    // Create a pool
    const initial_pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });

    const num_objects_before_split = initial_pool.objects.size;
    const new_pool: Pool = initial_pool.split();
    const num_objects_new_pool = new_pool.objects.size;
    const num_objects_after_split = initial_pool.objects.size;

    // Check that the number of objects in the new pool is 2 ( 1 NFT + 1 coin)
    expect(num_objects_new_pool).toEqual(2);
    expect(num_objects_after_split).toEqual(num_objects_before_split - 2);
    expect(num_objects_new_pool + num_objects_after_split).toEqual(
      num_objects_before_split,
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

    const new_pool: Pool = initial_pool.split();
    // Merge the new pool back to the initial pool
    initial_pool.merge(new_pool);

    const objectsAfterMerge = initial_pool.objects;

    // Compare that the objects and coins are the same before and after the split-merge
    expect(compareMaps(objectsBeforeSplit, objectsAfterMerge)).toBeTruthy();
  });
});
