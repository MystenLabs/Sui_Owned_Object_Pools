import { Connection, testnetConnection } from '@mysten/sui.js';

import { CoinManagement } from '../../src/coin-management';
import * as db from '../../src/lib/db';

// Test keys for address 0x8c94aaf11b8e3341d3b7b527daaa7b13e2637419db6bfad53b93d8d267ea8cb8
const TEST_KEYS = [
  'AMat/wSZ1kXntDIoMrcoLFB5nt2rY2qYU0ImLW5AsbZ6', // base64
  '0xc6adff0499d645e7b4322832b7282c50799eddab636a985342262d6e40b1b67a', // hex
  'flash leave dilemma swing lab flavor shoot civil rookie list gather soul', // mnemonic
];

jest.mock('../../src/lib/db', () => ({
  connect: jest.fn(), // Mock the connect method
}));

describe('CoinManagement initialization', () => {
  beforeEach(() => {
    // Reset the mock before each test
    jest.clearAllMocks();
  });

  // Tests private key in base64 format.
  it('should create a new CoinManagement instance with a base64 private key', () => {
    const cms = CoinManagement.create(
      TEST_KEYS[0],
      testnetConnection,
      'base64',
      'Ed25519',
    );

    expect(cms).toBeInstanceOf(CoinManagement);
    expect(db.connect).toHaveBeenCalledTimes(1);
  });

  // Tests private key in hex format.
  it('should create a new CoinManagement instance with a hex private key', () => {
    const cms = CoinManagement.create(
      TEST_KEYS[1],
      testnetConnection,
      'hex',
      'Ed25519',
    );

    expect(cms).toBeInstanceOf(CoinManagement);
    expect(db.connect).toHaveBeenCalledTimes(1);
  });

  // Tests private key from passphrase format.
  it('should create a new CoinManagement instance with a passphrase', () => {
    const cms = CoinManagement.create(
      TEST_KEYS[2],
      testnetConnection,
      'passphrase',
      'Ed25519',
    );

    expect(cms).toBeInstanceOf(CoinManagement);
    expect(db.connect).toHaveBeenCalledTimes(1);
  });

  // Tests the case where a key is not provided.
  it('should throw an error if a key is not provided', () => {
    expect(() => {
      CoinManagement.create('', testnetConnection, 'base64', 'Ed25519');
    }).toThrowError('Private key is required for initialization.');
  });

  // Tests the case where an RPC connection is not provided.
  it('should throw an error if RPC connection is not provided', () => {
    expect(() => {
      CoinManagement.create(
        TEST_KEYS[0],
        null as unknown as Connection,
        'base64',
        'Ed25519',
      );
    }).toThrowError('RPC connection is required for initialization.');
  });

  // Tests the case where an invalid key format is provided.
  it('should throw an error for invalid key format', () => {
    const invalidKeyFormat: 'base64' | 'hex' | 'passphrase' = 'invalid' as
      | 'base64'
      | 'hex'
      | 'passphrase';

    expect(() => {
      CoinManagement.create(
        TEST_KEYS[0],
        testnetConnection,
        invalidKeyFormat,
        'Ed25519',
      );
    }).toThrowError(
      'Invalid key format. Supported formats are "base64", "hex", or "passphrase".',
    );
  });

  // Tests the case where an invalid key type is provided.
  it('should throw an error for invalid key type', () => {
    const invalidKeyType: 'Ed25519' | 'Secp256k1' = 'invalid' as
      | 'Ed25519'
      | 'Secp256k1';

    expect(() => {
      CoinManagement.create(
        TEST_KEYS[0],
        testnetConnection,
        'base64',
        invalidKeyType,
      );
    }).toThrowError(
      'Invalid key type. Supported types are "Ed25519" or "Secp256k1".',
    );
  });
});
