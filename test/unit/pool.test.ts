import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromB64 } from '@mysten/sui.js/utils';

import { Pool } from '../../src';

// Test keys for address 0x8c94aaf11b8e3341d3b7b527daaa7b13e2637419db6bfad53b93d8d267ea8cb8
const TEST_KEYS = [
  'AMat/wSZ1kXntDIoMrcoLFB5nt2rY2qYU0ImLW5AsbZ6', // base64
  '0xc6adff0499d645e7b4322832b7282c50799eddab636a985342262d6e40b1b67a', // hex
  'flash leave dilemma swing lab flavor shoot civil rookie list gather soul', // mnemonic
];

const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;

describe('Pool creation with factory', () => {
  const chunksOfGas = 2;
  const txnsEstimate = 10;

  const adminPrivateKeyArray = Uint8Array.from(
    Array.from(fromB64(ADMIN_SECRET_KEY!)),
  );
  const adminKeypair = Ed25519Keypair.fromSecretKey(
    adminPrivateKeyArray.slice(1),
  );

  const client = new SuiClient({
    url: getFullnodeUrl('testnet'),
  });

  beforeEach(() => {
    // Reset the mock before each test
    jest.clearAllMocks();
    jest.setTimeout(10000);
  });

  it('Pool Created Correctly', async () => {
    const pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });
    const objects = pool.objects;
    expect(objects.length).toBeGreaterThan(0);
  });

  it('Pool Split Correctly', async () => {
    const pool: Pool = await Pool.full({
      keypair: adminKeypair,
      client: client,
    });
    const objects = pool.objects;
    const poolLength = objects.length;

    expect(poolLength).toBeGreaterThan(0);
  });
});
