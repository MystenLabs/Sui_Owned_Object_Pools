import { CoinManagement } from '../src/CoinManagement';

async function main() {
  try {
    // Ways to create a CoinManagement instances
    const cms = CoinManagement.createDefault(); // default rpcConnection is testnet

    // const mainnetCms = CoinManagement.createDefault(mainnetConnection);
    // const customCms = CoinManagement.createWithCustomOptions(
    //   100, // chunksOfGas
    //   10, // txnsEstimate
    //   mainnetConnection,
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
