import { testnetConnection } from '@mysten/sui.js';

import { CoinManagement } from '../../src/coin-management';

// Test keys for address 0x8c94aaf11b8e3341d3b7b527daaa7b13e2637419db6bfad53b93d8d267ea8cb8
const TEST_KEYS = [
  'AMat/wSZ1kXntDIoMrcoLFB5nt2rY2qYU0ImLW5AsbZ6', // base64
  '0xc6adff0499d645e7b4322832b7282c50799eddab636a985342262d6e40b1b67a', // hex
  'flash leave dilemma swing lab flavor shoot civil rookie list gather soul', // mnemonic
];

test('Creates a new CoinManagement instance', () => {
  // Create an instance of CoinManagement
  const coinManagement = CoinManagement.create(
    TEST_KEYS[0],
    testnetConnection,
    'base64',
    'Ed25519',
  );

  // Perform test assertions
  // For example, you can assert the type of the created instance
  expect(coinManagement).toBeInstanceOf(CoinManagement);
});
