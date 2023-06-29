import {
  Ed25519Keypair,
  JsonRpcProvider,
  RawSigner,
  TransactionBlock,
  fromB64,
  testnetConnection,
  MIST_PER_SUI,
} from "@mysten/sui.js";
import { Coin } from "./Coin";
import * as dotenv from "dotenv";
dotenv.config();

// Define the Transfer interface
interface Transfer {
  to: string;
  amount: number;
}

type CoinData = Coin[];

export class CoinManagement {
  private provider: JsonRpcProvider;
  private userKeyPair: Ed25519Keypair;
  private userAccount: RawSigner;
  private fetchedCoins: Coin[] = [];

  constructor() {
    this.provider = new JsonRpcProvider(testnetConnection);
    const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY!;
    this.userKeyPair = this.getKeyPair(USER_PRIVATE_KEY);
    this.userAccount = new RawSigner(this.userKeyPair, this.provider);
  }

  private getKeyPair(privateKey: string): Ed25519Keypair {
    let privateKeyArray = Array.from(fromB64(privateKey));
    privateKeyArray.shift();
    return Ed25519Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
  }

  /**
   * Splits coins based on the given chunks of Gas and transactions estimate.
   * Sends the gas coins to the user's address.
   * @param chunksOfGas The chuncks of Gas to be used for the Txns.
   * @param txnsEstimate The estimated number of txns.
   */
  public async splitCoins(chunksOfGas: number, txnsEstimate: number): Promise<void> {
    const transfers: Transfer[] = this.buildCoinTransfers(chunksOfGas, txnsEstimate);
    const txb = new TransactionBlock();

    const coins = txb.splitCoins(
      txb.gas,
      transfers.map((transfer) => txb.pure(transfer.amount))
    );

    transfers.forEach((transfer, index) => {
      txb.transferObjects([coins[index]], txb.pure(transfer.to));
    });

    // console.log("Coins:", coins); // Log the coins array

    const result = await this.userAccount.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      options: {
        showObjectChanges: true,
        showBalanceChanges: true,
        showEffects: true,
        showEvents: true,
        showInput: true,
      },
      requestType: "WaitForLocalExecution",
    });
  }

  /**
   * Builds an array of coin transfers based on the given gas budget and total number of coins.
   * @param gasBudget The gas budget for each coin.
   * @param totalNumOfCoins The total number of coins.
   * @returns The array of coin transfers.
   */
  private buildCoinTransfers(gasBudget: number, totalNumOfCoins: number): Transfer[] {
    const transfers: Transfer[] = [];

    for (let i = 0; i < totalNumOfCoins; i++) {
      const transfer: Transfer = {
        to: this.userKeyPair.getPublicKey().toSuiAddress(),
        amount: gasBudget,
      };
      transfers.push(transfer);
    }
    return transfers;
  }

  /**
   * Fetches the coins within the specified coin value range.
   * @param minCoinValue The minimum coin value.
   * @param maxCoinValue The maximum coin value.
   * @returns The array of coins within the specified range.
   */
  public async getCoinsInRange(minCoinValue: number, maxCoinValue: number): Promise<CoinData> {
    const maxTargetBalance = maxCoinValue * Number(MIST_PER_SUI);
    const minTargetBalance = minCoinValue * Number(MIST_PER_SUI);
    try {
      let userAddress = this.userKeyPair.getPublicKey().toSuiAddress();
      console.log("Fetching coins for:", userAddress);
      const gasCoins = await this.fetchCoins();
  
      const filteredGasCoins = gasCoins.filter(
        ({ balance }: { balance: string }) =>
          minTargetBalance <= Number(balance) && Number(balance) <= maxTargetBalance
      );
  
      console.log("Total gas coins found:", filteredGasCoins.length);
      return filteredGasCoins;
    } catch (e) {
      console.error("Populating gas coins failed:", e);
      throw e;
    }
  }

  /**
   * Fetches all coins associated with the user's account.
   * @param nextCursor The cursor for fetching the next page of coins.
   * @returns The array of fetched coins.
   */
  private async fetchCoins(nextCursor: string = ""): Promise<CoinData> {
      let allCoins: CoinData = [];
      let userAddress = this.userKeyPair.getPublicKey().toSuiAddress();
    
      let getCoinsInput = {
        owner: userAddress!,
      };
    
      if (nextCursor) Object.assign(getCoinsInput, { cursor: nextCursor });
    
      const res = await this.provider.getCoins(getCoinsInput);
    
      let nextPageData: CoinData = [];
      if (res.hasNextPage && typeof res?.nextCursor === "string") {
        console.log(
          `Looking for coins in ${
            nextCursor ? "page with cursor " + nextCursor : "first page"
          }`
        );
        nextPageData = await this.fetchCoins(res.nextCursor);
      }
    
      for (let coin of res.data) {
        const coinObject = new Coin(
          coin.version,
          coin.digest,
          coin.coinType,
          coin.previousTransaction,
          coin.coinObjectId,
          coin.balance,
          coin.lockedUntilEpoch
        );
        console.log("coin = ", coinObject);
        allCoins.push(coinObject);
      }
      this.fetchedCoins = allCoins.concat(nextPageData);
      return this.fetchedCoins;
    }

  /**
   * Takes coins from the available gas coins based on the given gas budget and coin value range.
   * @param gasBudget The gas budget.
   * @param minCoinValue The minimum coin value.
   * @param maxCoinValue The maximum coin value.
   * @returns The array of coin references.
   */

    public async takeCoins(gasBudget: number, minCoinValue: number, maxCoinValue: number): Promise<string[]> {
      try {
        const gasBudgetMIST = gasBudget * 1e9; // Convert the gas budget to MIST
        const gasCoins = await this.getCoinsInRange(minCoinValue, maxCoinValue);
    
        let totalBalance = 0;
        const selectedCoins: CoinData = [];
    
        for (const coin of gasCoins) {
          const balance = Number(coin.balance);
          if (totalBalance < gasBudgetMIST) {
            selectedCoins.push(coin);
            totalBalance += balance;
          } else {
            break;
          }
        }
    
        if (totalBalance < gasBudgetMIST) {
          throw new Error(
            "Insufficient gas coins available for the desired cumulative balance"
          );
        }
    
        const coinReferences = selectedCoins.map(
          ({ coinObjectId }: { coinObjectId: string }) => coinObjectId
        );
    
        const remainingCoins = gasCoins.filter(
          ({ coinObjectId }: { coinObjectId: string }) =>
            !coinReferences.includes(coinObjectId)
        );
    
        console.log("Total gas coins remaining:", remainingCoins.length);
        return coinReferences;
      } catch (e) {
        console.error("Taking gas coins failed:", e);
        throw e;
      }
    }
  
  /**
   * Retrieves a coin by its ID.
   * @param coinId The ID of the coin.
   * @returns The coin object if found, undefined otherwise.
   */
  public getCoinById(coinId: string): Coin | undefined {
    return this.fetchedCoins.find((coin) => coin.coinObjectId === coinId);
  }
}