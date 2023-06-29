import { coinManagement } from "./coinManagement";

async function main() {
    const cms = new coinManagement();
  
    try {
      const gasBudget = 0.00000015; // 100 MIST in decimal format
  
      // Call splitCoins first (optionally)
      if (shouldSplitCoins()) {
        await cms.splitCoins(130, 5);
      }
  
    //   await cms.populateGasCoins();
    //   const takenCoins = await cms.takeCoins(gasBudget);
  
    //   if (takenCoins.length === 0) {
    //     console.log("Unable to take gas coins. Insufficient balance available.");
    //   } else {
    //     console.log("Taken coins:");
    //     for (const coinId of takenCoins) {
    //       const coin = cms.getCoinById(coinId);
    //       if (coin) {
    //         console.log("Coin:", coin.CoinObjectId);
    //         console.log("Balance:", coin.Balance);
    //         console.log("Locked Until Epoch:", coin.LockedUntilEpoch);
    //         console.log("-------------------");
    //       }
    //     }
    //   }
    } catch (e) {
      console.error("Main function error: ", e);
    }
  }
  
  function shouldSplitCoins(): boolean {
    return true;
  }
  
  // Start the program
  main();
  
  