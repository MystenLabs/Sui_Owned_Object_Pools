import {
  Connection,
  testnetConnection,
  TransactionBlock,
} from '@mysten/sui.js';

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

describe('CoinManagement initialization with create', () => {
  it('should create a new instance of CoinManagement', () => {
    const chunksOfGas = 2;
    const txnsEstimate = 10;

    const cms = CoinManagement.create(
      chunksOfGas,
      txnsEstimate,
      TEST_KEYS[0],
      testnetConnection,
      'base64',
      'Ed25519',
    );

    expect(cms).toBeInstanceOf(CoinManagement);
  });

  it('should split the coins based on the provided gas chunks and transaction estimate', () => {
    const chunksOfGas = 2;
    const txnsEstimate = 10;

    const splitCoinsSpy = jest.spyOn(CoinManagement.prototype, 'splitCoins');

    CoinManagement.create(
      chunksOfGas,
      txnsEstimate,
      TEST_KEYS[0],
      testnetConnection,
      'base64',
      'Ed25519',
    );

    expect(splitCoinsSpy).toHaveBeenCalledWith(chunksOfGas, txnsEstimate);
  });
});

describe('CoinManagement splitCoins', () => {
  beforeEach(() => {
    // Reset the mock before each test
    jest.clearAllMocks();
  });

  it("should execute the transaction block correctly and transfer gas coins to the user's address", async () => {
    // Mock the necessary dependencies
    const mockedSignAndExecuteTransactionBlock = jest.fn();

    const cms = CoinManagement.create(
      TEST_KEYS[0],
      testnetConnection,
      'base64',
      'Ed25519',
    );

    // Set the mock function
    cms.setMockSignAndExecuteTransactionBlock(
      mockedSignAndExecuteTransactionBlock,
    );

    await cms.splitCoins(100, 10);

    // Assert that signAndExecuteTransactionBlock was called
    expect(mockedSignAndExecuteTransactionBlock).toHaveBeenCalled();
  }, 100000);
});

// describe('CoinManagement takeCoins', () => {
//   beforeEach(() => {
//     // Reset the mock before each test
//     jest.clearAllMocks();
//   });

//   it('should take coins correctly based on the gas budget and coin value range', async () => {
//     // Mock the necessary dependencies
//     const mockedSignAndExecuteTransactionBlock = jest.fn();

//     const cms = CoinManagement.create(
//       TEST_KEYS[0],
//       testnetConnection,
//       'base64',
//       'Ed25519',
//     );

//     // Set the mock function
//     cms.setMockSignAndExecuteTransactionBlock(
//       mockedSignAndExecuteTransactionBlock,
//     );

//     // Call the takeCoins method with the gas budget
//     const gasBudget = 0.00000015;
//     const takenCoins = await cms.takeCoins(gasBudget, 0, 1);

//     // Assert that the signAndExecuteTransactionBlock method was called
//     expect(mockedSignAndExecuteTransactionBlock).toHaveBeenCalled();
//   }, 100000);
// });

// describe('CoinManagement getCoinsInRange', () => {
// });

// describe('CoinManagement fetchCoins', () => {
// });

// describe('CoinManagement getCoinById', () => {
// });
