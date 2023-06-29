import { CoinManagement } from "./CoinManagement";

async function main() {
    const cms = new CoinManagement();
  
    try {
      const gasBudget = 0.0000001; // 100 MIST in decimal format
  
      // Call splitCoins first (optionally)
        await cms.splitCoins(100, 5);
   
  
      // await cms.getCoinsInRange(0, 0.00000015);
      const takenCoins = await cms.takeCoins(gasBudget, 0, 0.00000015);
  
      if (takenCoins.length === 0) {
        console.log("Unable to take gas coins. Insufficient balance available.");
      } else {
        console.log("Taken coins:");

        for (const coinId of takenCoins) {
          const coin = cms.getCoinById(coinId);
          if (coin) {
            console.log("-------Coin Used-------");
            console.log("Coin:", coin.CoinObjectId);
            console.log("Balance:", coin.Balance);
            console.log("Version:", coin.Version);
            console.log("Digest:", coin.Digest);
            console.log("Locked Until Epoch:", coin.LockedUntilEpoch);
          }
        }

      }
    } catch (e) {
      console.error("Main function error: ", e);
    }
  }
  
  // Start the program
  main();
  
  