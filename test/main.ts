import { testnetConnection } from '@mysten/sui.js';
import * as dotenv from 'dotenv';

import { CoinManagement } from '../src/coin-management';
dotenv.config();

async function main() {
  try {
    const privateKey = process.env.USER_PRIVATE_KEY;

    if (privateKey === undefined) {
      throw new Error(
        'Main: Private key not found. Make sure USER_PRIVATE_KEY is defined in the environment.',
      );
    }

    // Ways to create a CoinManagement instances
    const cms = CoinManagement.create(
      privateKey,
      testnetConnection,
      'base64',
      'Ed25519',
    );

    // const customCms = CoinManagement.createAndSplitCoins(
    //   100, // chunksOfGas
    //   10, // txnsEstimate
    //   privateKey,
    //   testnetConnection,
    //   'base64',
    //   'Ed25519',
    // );

    const gasBudget = 0.00000015; // 150 MIST in decimal format

    // Call splitCoins first (optionally)
    await cms.splitCoins(100, 10);

    const takenCoins = await cms.takeCoins(gasBudget, 0, 0.00000015);

    if (takenCoins.length === 0) {
      console.log('Unable to take gas coins. Insufficient balance available.');
    } else {
      console.log('Taken coins:');

      for (const coinId of takenCoins) {
        const coin = cms.getCoinById(coinId);
        if (coin) {
          console.log('-------Coin Used-------');
          console.log('Coin:', coin.coinObjectId);
          console.log('Balance:', coin.balance);
          console.log('Version:', coin.version);
          console.log('Digest:', coin.digest);
          console.log('Locked Until Epoch:', coin.lockedUntilEpoch);
        }
      }
    }
  } catch (e) {
    console.error('Main function error: ', e);
  }
}

// Start the program
main();
