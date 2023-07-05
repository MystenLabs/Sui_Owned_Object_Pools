import { CoinManagement } from './CoinManagement';

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

    // Fetch coins within the specified range
    const minCoinValue = 0;
    const maxCoinValue = 0.00000015;
    const fetchedCoins = await cms.getCoinsInRange(minCoinValue, maxCoinValue);

    if (fetchedCoins.length === 0) {
      console.log('No coins found within the specified range.');
    } else {
      console.log('Fetched coins:');

      for (const coin of fetchedCoins) {
        console.log('-------Coin-------');
        console.log('Coin ID:', coin.coinObjectId);
        console.log('Balance:', coin.balance);
        console.log('Version:', coin.version);
        console.log('Digest:', coin.digest);
        console.log('Locked Until Epoch:', coin.lockedUntilEpoch);
      }

      // Take coins based on the gas budget and value range
      const takenCoins = await cms.takeCoins(
        gasBudget,
        minCoinValue,
        maxCoinValue,
      );

      if (takenCoins.length === 0) {
        console.log(
          'Unable to take gas coins. Insufficient balance available.',
        );
      } else {
        console.log('Taken coins:');

        for (const coinId of takenCoins) {
          const coin = cms.getCoinById(coinId);
          if (coin) {
            console.log('-------Coin Used-------');
            console.log('Coin ID:', coin.coinObjectId);
            console.log('Balance:', coin.balance);
            console.log('Version:', coin.version);
            console.log('Digest:', coin.digest);
            console.log('Locked Until Epoch:', coin.lockedUntilEpoch);
          }
        }
      }
    }
  } catch (e) {
    console.error('Main function error: ', e);
  }
}

// Start the program
main();
