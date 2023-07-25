import {
  Connection,
  Ed25519Keypair,
  JsonRpcProvider,
  RawSigner,
  Secp256k1Keypair,
  TransactionArgument,
  TransactionBlock,
} from '@mysten/sui.js';

import { Coin } from './coin';
import { buildGasPayment, getAnyKeyPair } from './helpers';
import * as db from './lib/db';

// Define the Transfer interface
interface Transfer {
  to: string;
  amount: number;
}

type GasPaymentCoin = {
  digest: string;
  objectId: string;
  version: string | number;
};

type CoinData = Coin[];

export class CoinManagement {
  private provider!: JsonRpcProvider;
  private userKeyPair!: Ed25519Keypair | Secp256k1Keypair;
  private userAccount!: RawSigner;
  private userAddress!: string;
  private referenceCoin!: string;

  private constructor(
    key: string,
    rpcConnection: Connection,
    keyFormat: 'base64' | 'hex' | 'passphrase' = 'base64',
    keyType: 'Ed25519' | 'Secp256k1' = 'Ed25519',
    referenceCoin: string,
  ) {
    this.initialize(key, rpcConnection, keyFormat, keyType);
    this.setReferenceCoinId(referenceCoin);

    //Connect to db
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
      this.userKeyPair = getAnyKeyPair(key, keyFormat, keyType);
      this.userAccount = new RawSigner(this.userKeyPair, this.provider);
      this.userAddress = this.userKeyPair.getPublicKey().toSuiAddress();
    } catch (error) {
      console.error('Error initializing CoinManagement:', error);
      throw new Error('Failed to initialize CoinManagement.');
    }
  }

  /**
   * Creates a new instance of CoinManagement with the provided options and
   * automatically splits the coins based on the given gas chunks and transaction estimate.
   *
   * @param balance - The number of gas chunks to be used for the transactions.
   * @param totalNumOfCoins - The estimated cost of the transactions.
   * @param referenceCoin - The main coin to be used for splitting.
   * @param key - The private key for initialization.
   * @param rpcConnection - The RPC connection (testnetConnection | mainnetConnection | devnetConnection).
   * @param keyFormat - The format of the private key ('base64' | 'hex' | 'passphrase').
   * @param keyType - The type of the private key ('Ed25519' | 'Secp256k1').
   * @returns A new instance of CoinManagement with the coins split based on the gas chunks and transaction estimate.
   */
  public static async create(
    balance: number,
    totalNumOfCoins: number,
    referenceCoin: string,
    key: string,
    rpcConnection: Connection,
    keyFormat: 'base64' | 'hex' | 'passphrase' = 'base64',
    keyType: 'Ed25519' | 'Secp256k1' = 'Ed25519',
  ): Promise<CoinManagement> {
    const instance = new CoinManagement(
      key,
      rpcConnection,
      keyFormat,
      keyType,
      referenceCoin,
    );
    // Before starting a new instance, delete any coins from the database.
    await db.deleteAllCoins();

    // Create a new instance, split coins and store them in the database.
    instance.splitAndStoreCoins(balance, totalNumOfCoins);
    return instance;
  }

  /**
   * Splits coins based on the given chunks of Gas and transactions estimate.
   * Sends the gas coins to the user's address.
   *
   * @param balance How much balance a coin should have in order to be used for the transactions.
   * @param totalNumOfCoins Number of coins which is estimated by number of transactions.
   */
  public async splitAndStoreCoins(
    balance: number,
    totalNumOfCoins: number,
  ): Promise<void> {
    try {
      const transfers: Transfer[] = this.buildCoinTransfers(
        balance,
        totalNumOfCoins,
      );

      const txb = new TransactionBlock();

      const coins: TransactionArgument[] = [];

      // Split coins from reference coin.
      for (const transfer of transfers) {
        const coin = txb.splitCoins(txb.object(this.referenceCoin), [
          txb.pure(transfer.amount, 'u64'),
        ]);
        coins.push(coin);
      }

      // Create a transfer transaction for each coin.
      txb.transferObjects(coins, txb.pure(this.userAddress, 'address'));

      // Sign and execute the transaction block.
      await this.userAccount.signAndExecuteTransactionBlock({
        transactionBlock: txb,
        options: {
          showObjectChanges: false,
          showBalanceChanges: false,
          showEffects: true,
          showEvents: false,
          showInput: false,
        },
        requestType: 'WaitForLocalExecution',
      });

      // Get all coins from the provider to see the newly split coins.
      const coinObjects = await this.provider.getCoins({
        owner: this.userAddress,
      });

      // Filter out the reference coin.
      const filteredCoins = coinObjects.data.filter(
        (coin) => coin.coinObjectId !== this.referenceCoin,
      );

      // Store the newly splitted coins in the database.
      db.storeCoins(filteredCoins);
    } catch (error) {
      console.error('Error splitting coins:', error);
      throw new Error('Failed to split coins.');
    }
  }

  /**
   * Builds an array of coin transfers based on the given gas budget and total number of coins.
   *
   * @param amount The balance value for each coin.
   * @param totalNumOfCoins The total number of coins.
   * @returns The array of coin transfers.
   */
  private buildCoinTransfers(
    amount: number,
    totalNumOfCoins: number,
  ): Transfer[] {
    const transfers: Transfer[] = [];

    try {
      for (let i = 0; i < totalNumOfCoins; i++) {
        // Create a transfer object with the user's SUI address as the recipient and the gas budget as the amount
        const transfer: Transfer = {
          to: this.userAddress,
          amount: amount,
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
   * Takes coins from the available gas coins in the database until the gas budget
   * is reached. If the database doesn't have enough gas coins, it will split
   * more coins from the provider for the caller and update the database.
   *
   * @param gasBudget The gas budget needed.
   * @returns An array of coin IDs the caller can use for gas.
   */
  public async takeCoins(gasBudget: number): Promise<Array<GasPaymentCoin>> {
    try {
      // Check database health.
      const dbHealth = await this.checkHealth();

      // If the database is empty, refill the queue.
      if (!dbHealth) {
        await this.refillQueue(gasBudget, 10); // TODO: Make this configurable.
      }

      // Check if the DB total balance is enough for the gas budget.
      const coinBalanceInDB = await db.getTotalBalance();

      if (coinBalanceInDB < gasBudget) {
        throw new Error('Insufficient balance available.');
      }

      // Fetch gas coins from the database.
      let selectedCoins: CoinData = await db.getAllCoins();

      // Keep only the coins that we need based on given gasBudget
      // and remove them from the database.
      const coinsToKeep: CoinData = [];

      // Keep track of the balance we want to reach.
      let currentBalance = 0;

      for (const coin of selectedCoins) {
        // Increase the current balance with the coin's balance.
        currentBalance += Number(coin.balance);

        // Add the coin to the array with coins to keep.
        coinsToKeep.push(coin);

        // Remove the coin from the database.
        await db.deleteCoin(coin.coinObjectId);

        // Stop getting coins when we reach the gas budget.
        if (currentBalance >= gasBudget) {
          break;
        }
      }

      // Overwrite the selectedCoins array with the coins to keep.
      selectedCoins = coinsToKeep;

      // Build gas payment object.
      const gasPaymentCoins = buildGasPayment(selectedCoins);

      // Return the coins to be used for gas payment.
      return gasPaymentCoins;
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
  public async getCoinById(coinId: string): Promise<Coin | undefined> {
    try {
      const coin = await db.getCoinById(coinId);

      if (Object.keys(coin).length === 0) {
        throw new Error(`Coin with ID ${coinId} not found`);
      }

      return new Coin(
        coin.version,
        coin.digest,
        coin.coinType,
        coin.previousTransaction,
        coin.coinObjectId,
        coin.balance,
      );
    } catch (error) {
      console.error('Error getting coin by ID:', error);
      throw error;
    }
  }

  /**
   * Refills the database with coins from the provider by
   * splitting the caller's balance into coins.
   *
   * @param gasBudget The gas budget for each coin.
   * @param totalNumOfCoins The total number of coins.
   */
  public async refillQueue(balance: number, totalNumOfCoins: number) {
    await this.splitAndStoreCoins(balance, totalNumOfCoins);
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

  private async checkHealth(): Promise<boolean> {
    const length = await db.getLength();
    console.log('length', length);
    return length > 0;
  }

  /**
   * Disconnects from the database.
   *
   * @returns void
   */
  public disconnectFromDB(): void {
    db.disconnect();
  }

  public setReferenceCoinId(coinId: string) {
    this.referenceCoin = coinId;
  }

  public getReferenceCoinId(): string {
    return this.referenceCoin;
  }
}
