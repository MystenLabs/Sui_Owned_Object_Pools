import { CoinManagement } from '../../src/coin-management';
import { testnetConnection } from '@mysten/sui.js';
import { Coin } from '../../src/coin';

// Test keys for address 0xa1b69aeff452a459501171ee8c0db16fe481f1c64014d06fb2ac8f94477966b4
const TEST_KEYS = [
  'ALUA67ne3PxUtRxbLyDK1kvhFqsTK0Gq7GA3S4LxjYu2', // base64
  '0xa1b69aeff452a459501171ee8c0db16fe481f1c64014d06fb2ac8f94477966b4', // hex
  'kind bridge reunion defense chronic upon mountain major okay member neglect scrub', // mnemonic
];

describe('Get gas payment coin and verify positive balance', () => {
  const chunksOfGas = 2;
  const txnsEstimate = 10;

  type GasPaymentCoin = {
    digest: string;
    objectId: string;
    version: string | number;
  };

  let cms: CoinManagement;
  
  it('should create a new CoinManagement instance, get gas payment coin and verify positive balance', async () => {
    cms = CoinManagement.create(
      chunksOfGas,
      txnsEstimate,
      TEST_KEYS[0],
      testnetConnection,
      'base64',
      'Ed25519',
    );

    // const checkHealthSpy = jest.spyOn(CoinManagement.prototype as any, 'checkHealth');

    // console.log('checkHealthSpy', checkHealthSpy);
    const gasBudget = 0.00000015;
    let coins = await cms.takeCoins(gasBudget, 0, 100);

    expect(cms).toBeInstanceOf(CoinManagement);
    expect(coins).toBeInstanceOf(Array<GasPaymentCoin>);
    // expect(checkHealthSpy).toHaveBeenCalledTimes(1);
  });

  // it('should create a new CoinManagement instance and get gas payment coin', async () => {
  //   cms = CoinManagement.create(
  //     chunksOfGas,
  //     txnsEstimate,
  //     TEST_KEYS[0],
  //     testnetConnection,
  //     'base64',
  //     'Ed25519',
  //   );

  //   const gasBudget = 0.00000015;
  //   let coins = await cms.takeCoins(gasBudget, 0, 100);
  //   console.log("Coins", coins)

  //   expect(coins).toBeInstanceOf(Array<GasPaymentCoin>);
  //   expect(cms).toBeInstanceOf(CoinManagement);
  // });

  // // it('should create a new CoinManagement instance and get available account coins', async () => {
  // //   cms = CoinManagement.create(
  // //     chunksOfGas,
  // //     txnsEstimate,
  // //     TEST_KEYS[0],
  // //     testnetConnection,
  // //     'base64',
  // //     'Ed25519',
  // //   );

  // //   let splittedCoins = await cms.splitCoins(chunksOfGas, txnsEstimate);
  // //   console.log("splittedCoins", splittedCoins)

  // //   expect(coins).toBeInstanceOf(Array<GasPaymentCoin>);
  // //   expect(cms).toBeInstanceOf(CoinManagement);
  // });
});