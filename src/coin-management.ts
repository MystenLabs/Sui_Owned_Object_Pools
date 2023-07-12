import {
  Connection,
  Ed25519Keypair,
  fromB64,
  JsonRpcProvider,
  MIST_PER_SUI,
  RawSigner,
  Secp256k1Keypair,
  testnetConnection,
  TransactionBlock,
} from '@mysten/sui.js';

import { Coin } from './coin';
import * as db from './lib/db';

// Define the Transfer interface
interface Transfer {
  to: string;
  amount: number;
}

type CoinData = Coin[];

export class CoinManagement {
  private provider!: JsonRpcProvider;
  private userKeyPair!: Ed25519Keypair | Secp256k1Keypair;
  private userAccount!: RawSigner;
  private userAddress!: string;
  private fetchedCoins: Coin[] = [];

  private constructor(
    key: string,
    rpcConnection: Connection,
    keyFormat: 'base64' | 'hex' | 'passphrase' = 'base64',
    keyType: 'Ed25519' | 'Secp256k1' = 'Ed25519',
  ) {
    this.initialize(key, rpcConnection, keyFormat, keyType);

    //Connect to db and store coins
    db.connect();
  }

  /**
   * Initializes the CoinManagement instance with the provided options.
   * @param key - The private key for initialization.
   * @param rpcConnection - The RPC connection (testnetConnection | mainnetConnection | devnetConnection).
   * @param keyFormat - The format of the private key ('base64' | 'hex' | 'passphrase').
   * @param keyType - The type of the private key ('Ed25519' | 'Secp256k1').
   * @throws Error if the private key is not provided.
   */
  private initialize(
    key: string,
    rpcConnection: Connection,
    keyFormat: 'base64' | 'hex' | 'passphrase',
    keyType: 'Ed25519' | 'Secp256k1',
  ) {
    if (!key) {
      throw new Error('Private key is required for initialization.');
    }

    if (!rpcConnection) {
      throw new Error('RPC connection is required for initialization.');
    }

    if (!['base64', 'hex', 'passphrase'].includes(keyFormat)) {
      throw new Error(
        'Invalid key format. Supported formats are "base64", "hex", or "passphrase".',
      );
    }

    if (!['Ed25519', 'Secp256k1'].includes(keyType)) {
      throw new Error(
        'Invalid key type. Supported types are "Ed25519" or "Secp256k1".',
      );
    }

    try {
      this.provider = new JsonRpcProvider(rpcConnection);
      this.userKeyPair = this.getKeyPair(key, keyFormat, keyType);
      this.userAccount = new RawSigner(this.userKeyPair, this.provider);
      this.userAddress = this.userKeyPair.getPublicKey().toSuiAddress();
    } catch (error) {
      console.error('Error initializing CoinManagement:', error);
      throw new Error('Failed to initialize CoinManagement.');
    }
  }

  /**
   * Creates a new instance of CoinManagement with the provided options.
   *
   * @param key - The private key for initialization.
   * @param rpcConnection - The RPC connection (testnetConnection | mainnetConnection | devnetConnection).
   * @param keyFormat - The format of the private key ('base64' | 'hex' | 'passphrase').
   * @param keyType - The type of the private key ('Ed25519' | 'Secp256k1').
   * @returns A new instance of CoinManagement.
   */
  public static create(
    key: string,
    rpcConnection: Connection,
    keyFormat: 'base64' | 'hex' | 'passphrase',
    keyType: 'Ed25519' | 'Secp256k1',
  ): CoinManagement {
    return new CoinManagement(key, rpcConnection, keyFormat, keyType);
  }

  /**
   * Creates a new instance of CoinManagement with the provided options and
   * automatically splits the coins based on the given gas chunks and transaction estimate.
   *
   * @param balance - The number of gas chunks to be used for the transactions.
   * @param totalNumOfCoins - The estimated cost of the transactions.
   * @param key - The private key for initialization.
   * @param rpcConnection - The RPC connection (testnetConnection | mainnetConnection | devnetConnection).
   * @param keyFormat - The format of the private key ('base64' | 'hex' | 'passphrase').
   * @param keyType - The type of the private key ('Ed25519' | 'Secp256k1').
   * @returns A new instance of CoinManagement with the coins split based on the gas chunks and transaction estimate.
   */
  public static createAndSplitCoins(
    balance: number,
    totalNumOfCoins: number,
    key: string,
    rpcConnection: Connection,
    keyFormat: 'base64' | 'hex' | 'passphrase' = 'base64',
    keyType: 'Ed25519' | 'Secp256k1' = 'Ed25519',
  ): CoinManagement {
    const instance = new CoinManagement(key, rpcConnection, keyFormat, keyType);
    instance.splitCoins(balance, totalNumOfCoins);
    return instance;
  }

  /**
   * Retrieves the key pair (Ed25519 or Secp256k1) based on the provided key, key format, and key type.
   *
   * @param key - The private key or passphrase for generating the key pair.
   * @param keyFormat - The format of the key ('base64' | 'hex' | 'passphrase').
   * @param keyType - The type of the private key ('Ed25519' | 'Secp256k1').
   * @returns (Ed25519Keypair | Secp256k1Keypair) key pair.
   * @throws Error if the key format is invalid, the key type is invalid, or there is an error generating the key pair.
   */
  private getKeyPair(
    key: string,
    keyFormat: 'base64' | 'hex' | 'passphrase',
    keyType: 'Ed25519' | 'Secp256k1',
  ): Ed25519Keypair | Secp256k1Keypair {
    try {
      let privateKeyBytes: Uint8Array;

      switch (keyFormat) {
        case 'base64':
          privateKeyBytes = Uint8Array.from(Array.from(fromB64(key)));
          privateKeyBytes = privateKeyBytes.slice(1); // Remove the first byte
          break;
        case 'hex':
          privateKeyBytes = Uint8Array.from(
            Array.from(Buffer.from(key.slice(2), 'hex')),
          );
          break;
        case 'passphrase':
          if (keyType === 'Ed25519') {
            return Ed25519Keypair.deriveKeypair(key);
          } else if (keyType === 'Secp256k1') {
            return Secp256k1Keypair.deriveKeypair(key);
          } else {
            throw new Error('Invalid key type.');
          }
        default:
          throw new Error('Invalid key format.');
      }
      return keyType === 'Ed25519'
        ? Ed25519Keypair.fromSecretKey(privateKeyBytes)
        : Secp256k1Keypair.fromSecretKey(privateKeyBytes);
    } catch (error) {
      console.error('Error generating key pair:', error);
      throw new Error('Invalid private key');
    }
  }

  /**
   * Splits coins based on the given chunks of Gas and transactions estimate.
   * Sends the gas coins to the user's address.
   *
   * @param balance How much balance a coin should have in order to be used for the transactions.
   * @param totalNumOfCoins Number of coins which is estimated by number of transactions.
   */
  public async splitCoins(
    balance: number,
    totalNumOfCoins: number,
  ): Promise<void> {
    try {
      const transfers: Transfer[] = this.buildCoinTransfers(
        balance,
        totalNumOfCoins,
      );

      const txb = new TransactionBlock();

      // Split the coins using the gas and amounts from the transfers
      const coins = txb.splitCoins(
        txb.gas,
        transfers.map((transfer) => txb.pure(transfer.amount)),
      );

      // Next, create a transfer transaction for each coin
      transfers.forEach((transfer, index) => {
        txb.transferObjects([coins[index]], txb.pure(transfer.to));
      });

      // Sign and execute the transaction block
      await this.userAccount.signAndExecuteTransactionBlock({
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
    } catch (error) {
      console.error('Error splitting coins:', error);
      throw new Error('Failed to split coins.');
    }
  }

  /**
   * Builds an array of coin transfers based on the given gas budget and total number of coins.
   *
   * @param gasBudget The gas budget for each coin.
   * @param totalNumOfCoins The total number of coins.
   * @returns The array of coin transfers.
   */
  private buildCoinTransfers(
    gasBudget: number,
    totalNumOfCoins: number,
  ): Transfer[] {
    const transfers: Transfer[] = [];

    try {
      for (let i = 0; i < totalNumOfCoins; i++) {
        // Create a transfer object with the user's SUI address as the recipient and the gas budget as the amount
        const transfer: Transfer = {
          to: this.userAddress,
          amount: gasBudget,
        };

        // Add the transfer object to the transfers array
        transfers.push(transfer);
      }
    } catch (error) {
      console.error('Error building coin transfers:', error);
      throw error;
    }

    return transfers;
  }

  /**
   * Fetches the coins within the specified coin value range.
   *
   * @param minCoinValue The minimum coin value.
   * @param maxCoinValue The maximum coin value.
   * @returns The array of coins within the specified range.
   */
  public async getCoinsInRange(
    minCoinValue: number,
    maxCoinValue: number,
  ): Promise<CoinData> {
    try {
      console.log('Fetching coins for:', this.userAddress);

      // Fetch all user coins
      const gasCoins = await this.fetchCoins();

      // Filter the fetched coins based on the target balance range
      const filteredGasCoins = gasCoins.filter(
        ({ balance }: { balance: string }) => {
          return (
            minCoinValue <= Number(balance) && Number(balance) <= maxCoinValue
          );
        },
      );

      console.log('Total gas coins found:', filteredGasCoins.length);

      // Return the filtered gas coins within the specified range
      return filteredGasCoins;
    } catch (error) {
      console.error('Error fetching coins:', error);
      throw error;
    }
  }

  /**
   * Fetches all coins associated with the user's account.
   *
   * @param nextCursor The cursor for fetching the next page of coins.
   * @returns The array of fetched coins.
   */
  private async fetchCoins(nextCursor = ''): Promise<CoinData> {
    try {
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
        // Recursively fetch next page of coins
        nextPageData = await this.fetchCoins(res.nextCursor);
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
        );

        allCoins.push(coinObject);
      }

      // Concatenate current page coins with next page coins
      this.fetchedCoins = allCoins.concat(nextPageData);
      return this.fetchedCoins;
    } catch (error) {
      console.error('Error fetching coins:', error);
      throw error;
    }
  }

  /**
   * Takes coins from the available gas coins based on the given gas budget and coin value range.
   *
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
      // Fetch gas coins within the specified coin value range
      const gasCoins = await this.getCoinsInRange(minCoinValue, maxCoinValue);

      let totalBalance = 0;
      const selectedCoins: CoinData = [];

      // Iterate over the gas coins
      for (const coin of gasCoins) {
        const balance = Number(coin.balance);
        if (totalBalance < gasBudget) {
          selectedCoins.push(coin);
          totalBalance += balance;
        } else {
          // Stop adding coins if the gas budget is reached
          break;
        }
      }

      // Checks if the selected coins total balance is lower that the gas budget
      if (totalBalance < gasBudget) {
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
      db.storeCoins(remainingCoins);

      console.log('Total gas coins remaining:', remainingCoins.length);

      // Return the coin object IDs for the selected coins
      return coinReferences;
    } catch (error) {
      console.error('Error taking gas coins:', error);
      throw error;
    }
  }

  /**
   * Retrieves a coin object by its ID.
   *
   * @param coinId - The ID of the coin to retrieve.
   * @returns The coin object if found, or undefined if the coin with the specified ID is not found.
   * @throws Error if the coin with the specified ID is not found.
   */
  public getCoinById(coinId: string): Coin | undefined {
    const coin = this.fetchedCoins.find((coin) => coin.coinObjectId === coinId);

    if (!coin) {
      throw new Error(`Coin with ID ${coinId} not found`);
    }

    return coin;
  }

  /**
   * Sets the mock for the user account's signAndExecuteTransactionBlock method.
   * This is used for testing purposes.
   *
   * @param mock
   */
  public setMockSignAndExecuteTransactionBlock(mock: jest.Mock): void {
    this.userAccount.signAndExecuteTransactionBlock = mock;
  }
}
