import {
  Connection,
  Ed25519Keypair,
  fromB64,
  JsonRpcProvider,
  MIST_PER_SUI,
  RawSigner,
  testnetConnection,
  TransactionBlock,
} from '@mysten/sui.js';
import * as dotenv from 'dotenv';

import { Coin } from './Coin';
dotenv.config();

// Define the Transfer interface
interface Transfer {
  to: string;
  amount: number;
}

type CoinData = Coin[];

export class CoinManagement {
  private provider!: JsonRpcProvider;
  private userKeyPair!: Ed25519Keypair;
  private userAccount!: RawSigner;
  private userAddress!: string;
  private fetchedCoins: Coin[] = [];

  private constructor(privateKey: string, rpcConnection?: Connection) {
    this.initialize(privateKey, rpcConnection);
  }

  private initialize(privateKey: string, rpcConnection?: Connection) {
    this.provider = new JsonRpcProvider(rpcConnection || testnetConnection);
    this.userKeyPair = this.getKeyPair(privateKey);
    this.userAccount = new RawSigner(this.userKeyPair, this.provider);
    this.userAddress = this.userKeyPair.getPublicKey().toSuiAddress();
  }

  public static createDefault(rpcConnection?: Connection): CoinManagement {
    return new CoinManagement(process.env.USER_PRIVATE_KEY!, rpcConnection);
  }

  public static createWithCustomOptions(
    chunksOfGas: number,
    txnsEstimate: number,
    rpcConnection?: Connection,
  ): CoinManagement {
    const coinManagement = new CoinManagement(
      process.env.USER_PRIVATE_KEY!,
      rpcConnection,
    );

    coinManagement.splitCoins(chunksOfGas, txnsEstimate);

    return coinManagement;
  }

  public static createWithCustomKey(
    privateKey: string,
    rpcConnection?: Connection,
  ): CoinManagement {
    return new CoinManagement(privateKey, rpcConnection);
  }

  private getKeyPair(privateKey: string): Ed25519Keypair {
    const privateKeyArray = Array.from(fromB64(privateKey));
    privateKeyArray.shift();
    return Ed25519Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
  }

  /**
   * Splits coins based on the given chunks of Gas and transactions estimate.
   * Sends the gas coins to the user's address.
   * @param chunksOfGas The chuncks of Gas to be used for the transactions.
   * @param txnsEstimate The estimated number of transactions.
   */
  public async splitCoins(
    chunksOfGas: number,
    txnsEstimate: number,
  ): Promise<void> {
    const transfers: Transfer[] = this.buildCoinTransfers(
      chunksOfGas,
      txnsEstimate,
    );
    const txb = new TransactionBlock();

    // Split the coins using the gas and amounts from the transfers
    const coins = txb.splitCoins(
      txb.gas,
      transfers.map((transfer) => txb.pure(transfer.amount)),
    );

    // Transfer the coins to the specified recipients
    transfers.forEach((transfer, index) => {
      txb.transferObjects([coins[index]], txb.pure(transfer.to));
    });

    // console.log("Coins:", coins);

    // Sign and execute the transaction block
    const result = await this.userAccount.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      options: {
        showObjectChanges: true,
        showBalanceChanges: true,
        showEffects: true,
        showEvents: true,
        showInput: true,
      },
      requestType: 'WaitForLocalExecution',
    });
  }

  /**
   * Builds an array of coin transfers based on the given gas budget and total number of coins.
   * @param gasBudget The gas budget for each coin.
   * @param totalNumOfCoins The total number of coins.
   * @returns The array of coin transfers.
   */
  private buildCoinTransfers(
    gasBudget: number,
    totalNumOfCoins: number,
  ): Transfer[] {
    const transfers: Transfer[] = [];

    for (let i = 0; i < totalNumOfCoins; i++) {
      // Create a transfer object with the user's SUI address as the recipient and the gas budget as the amount
      const transfer: Transfer = {
        to: this.userAddress,
        amount: gasBudget,
      };

      transfers.push(transfer); // Add the transfer object to the transfers array
    }

    return transfers;
  }

  /**
   * Fetches the coins within the specified coin value range.
   * @param minCoinValue The minimum coin value.
   * @param maxCoinValue The maximum coin value.
   * @returns The array of coins within the specified range.
   */
  public async getCoinsInRange(
    minCoinValue: number,
    maxCoinValue: number,
  ): Promise<CoinData> {
    const maxTargetBalance = maxCoinValue * Number(MIST_PER_SUI);
    const minTargetBalance = minCoinValue * Number(MIST_PER_SUI);

    try {
      console.log('Fetching coins for:', this.userAddress);

      // Fetch all user coins
      const gasCoins = await this.fetchCoins();

      // Filter the fetched coins based on the target balance range
      const filteredGasCoins = gasCoins.filter(
        ({ balance }: { balance: string }) =>
          minTargetBalance <= Number(balance) &&
          Number(balance) <= maxTargetBalance,
      );

      console.log('Total gas coins found:', filteredGasCoins.length);

      return filteredGasCoins; // Return the filtered gas coins within the specified range
    } catch (e) {
      console.error('Populating gas coins failed:', e);
      throw e;
    }
  }

  /**
   * Fetches all coins associated with the user's account.
   * @param nextCursor The cursor for fetching the next page of coins.
   * @returns The array of fetched coins.
   */
  private async fetchCoins(nextCursor = ''): Promise<CoinData> {
    const allCoins: CoinData = [];

    const getCoinsInput = {
      owner: this.userAddress,
    };

    if (nextCursor) Object.assign(getCoinsInput, { cursor: nextCursor });

    // Fetch coins from the provider using the specified user address and cursor
    const res = await this.provider.getCoins(getCoinsInput);

    let nextPageData: CoinData = [];
    if (res.hasNextPage && typeof res?.nextCursor === 'string') {
      console.log(
        `Looking for coins in ${
          nextCursor ? 'page with cursor ' + nextCursor : 'first page'
        }`,
      );
      nextPageData = await this.fetchCoins(res.nextCursor); // Recursively fetch next page of coins
    }

    // Convert each retrieved coin data into Coin objects and add them to the array
    for (const coin of res.data) {
      const coinObject = new Coin(
        coin.version,
        coin.digest,
        coin.coinType,
        coin.previousTransaction,
        coin.coinObjectId,
        coin.balance,
        coin.lockedUntilEpoch,
      );
      console.log('coin = ', coinObject);
      allCoins.push(coinObject);
    }

    // Concatenate current page coins with next page coins
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

  public async takeCoins(
    gasBudget: number,
    minCoinValue: number,
    maxCoinValue: number,
  ): Promise<string[]> {
    try {
      const gasBudgetMIST = gasBudget * 1e9; // Convert the gas budget to MIST

      // Fetch gas coins within the specified coin value range
      const gasCoins = await this.getCoinsInRange(minCoinValue, maxCoinValue);

      let totalBalance = 0;
      const selectedCoins: CoinData = [];

      // Iterate over the gas coins
      for (const coin of gasCoins) {
        const balance = Number(coin.balance);
        if (totalBalance < gasBudgetMIST) {
          selectedCoins.push(coin);
          totalBalance += balance;
        } else {
          break; // Stop adding coins if the gas budget is reached
        }
      }

      // Checks if the selected coins total balance is lower that the gas budget
      if (totalBalance < gasBudgetMIST) {
        throw new Error('Insufficient gas coins available');
      }

      // Get the coin object IDs from the selected coins
      const coinReferences = selectedCoins.map(
        ({ coinObjectId }: { coinObjectId: string }) => coinObjectId,
      );

      // Filter out the remaining coins that were not selected
      const remainingCoins = gasCoins.filter(
        ({ coinObjectId }: { coinObjectId: string }) =>
          !coinReferences.includes(coinObjectId),
      );

      console.log('Total gas coins remaining:', remainingCoins.length);

      return coinReferences; // Return the coin object IDs for the selected coins
    } catch (e) {
      console.error('Taking gas coins failed:', e);
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
