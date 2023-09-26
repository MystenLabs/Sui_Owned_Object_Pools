import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromB64 } from '@mysten/sui.js/utils';
import { SuiObjectRef } from '@mysten/sui.js/src/types/objects';

import { Pool } from '../../src';

// Test keys for address 0x8c94aaf11b8e3341d3b7b527daaa7b13e2637419db6bfad53b93d8d267ea8cb8
const TEST_KEYS = [
  'AMat/wSZ1kXntDIoMrcoLFB5nt2rY2qYU0ImLW5AsbZ6', // base64
  '0xc6adff0499d645e7b4322832b7282c50799eddab636a985342262d6e40b1b67a', // hex
  'flash leave dilemma swing lab flavor shoot civil rookie list gather soul', // mnemonic
];

const ADMIN_SECRET_KEY = TEST_KEYS[0];
const adminPrivateKeyArray = Uint8Array.from(
  Array.from(fromB64(ADMIN_SECRET_KEY!)),
);
const adminKeypair = Ed25519Keypair.fromSecretKey(
  adminPrivateKeyArray.slice(1),
);
const client = new SuiClient({
  url: getFullnodeUrl('testnet'),
});


describe('Pool creation with factory', () => {
  const chunksOfGas = 2;  // FIXME - unused
  const txnsEstimate = 10;  // FIXME - unused

  beforeEach(() => {
    // Reset the mock before each test
    jest.clearAllMocks();
    jest.setTimeout(10000);
  });

  it('creates a pool correctly', async () => {
    const pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });
    const objects = pool.objects;
    expect(objects.length).toBeGreaterThan(0);
  });
});


describe.each([
  [(_obj: SuiObjectRef | undefined) => true, "always true predicate"], 
  [(_obj: SuiObjectRef | undefined) => false, "always false predicate"],
  [(_obj: SuiObjectRef | undefined) => null, "always null predicate"], // FIXME - times out, infinite loop
])(
  '🌀 Pool splitting', (predicate: any, descr) => {
  it(`splits a pool using an ${descr}`, async () => {
    /* 
    Create a pool 
    */
    const initial_pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    }); 
    const num_objects_before_split = initial_pool.objects.length;
    
    /* 
    Split the initial pool, moving some objects to 
    a newly created pool (depending on the predicate) 
    */
    const new_pool: Pool = initial_pool.split(predicate);  
    const num_objects_new_pool = new_pool.objects.length;

    /* 
    Number of objects in the initial pool has changed! 
    Some of them have been moved to new_pool (based on the predicate), 
    so we calculate the new number of objects in the initial pool. 
    */
    const num_objects_after_split = initial_pool.objects.length;

    expect(num_objects_new_pool + num_objects_after_split)
          .toEqual(num_objects_before_split);
  });
});

