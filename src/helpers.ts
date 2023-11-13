import { SuiClient } from '@mysten/sui.js/client';
import { SuiObjectRef, SuiObjectResponse } from '@mysten/sui.js/client/';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { fromB64 } from '@mysten/sui.js/utils';
import dotenv from 'dotenv';
import path from 'path';

/**
 * Returns an Ed25519Keypair object generated from the given private key.
 * @param privateKey - The private key to generate the keypair from.
 * @returns The Ed25519Keypair object generated from the given private key.
 */
export function getKeyPair(privateKey: string): Ed25519Keypair {
  const privateKeyArray = Array.from(fromB64(privateKey));
  privateKeyArray.shift();
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
}

/**
 * Represents the environment variables used in the unit tests of the library.
 */
type EnvironmentVariables = {
  NFT_APP_PACKAGE_ID: string;
  NFT_APP_ADMIN_CAP: string;
  SUI_NODE: string;
  ADMIN_ADDRESS: string;
  ADMIN_SECRET_KEY: string;
  TEST_USER_ADDRESS: string;
  TEST_USER_SECRET: string;
  GET_WORKER_TIMEOUT_MS: number;
};

/**
 * Retrieves environment variables from a specified path and returns them as an object.
 * @param pathToEnv - The path to the environment file. Defaults to '../.env'.
 * @param isTest - A boolean indicating whether the function is being called in a test environment.
 * Useful for checking if all the required environment variables are present.
 * The required environment variables between test and non-test environments could differ.
 * @returns An object containing the retrieved environment variables.
 */
export function getEnvironmentVariables(pathToEnv = '../.env', isTest = false) {
  dotenv.config({
    path: path.resolve(__dirname, pathToEnv),
  });

  const env = {
    NFT_APP_PACKAGE_ID: process.env.NFT_APP_PACKAGE_ID ?? '',
    NFT_APP_ADMIN_CAP: process.env.NFT_APP_ADMIN_CAP ?? '',
    SUI_NODE: process.env.SUI_NODE ?? '',
    ADMIN_ADDRESS: process.env.ADMIN_ADDRESS ?? '',
    ADMIN_SECRET_KEY: process.env.ADMIN_SECRET_KEY ?? '',
    TEST_USER_ADDRESS: process.env.TEST_USER_ADDRESS ?? '',
    TEST_USER_SECRET: process.env.TEST_USER_SECRET ?? '',
    GET_WORKER_TIMEOUT_MS: parseInt(
      process.env.GET_WORKER_TIMEOUT_MS ?? '10000',
    ),
  } as EnvironmentVariables;

  if (isTest) {
    const testEnvVariables: string[] = Array.from(Object.keys(env));
    checkForMissingEnvVariables(env, testEnvVariables);
  }
  return env;
}

/**
 * Checks if an object is "Immutable" by looking up its data on the blockchain.
 * @param objectId - The ID of the object to check.
 * @param client - The SuiClient instance to use for the API request.
 * @returns A Promise that resolves to a boolean indicating whether the object is owned by an "Immutable" owner.
 * @throws An error if the "owner" field of the object cannot be extracted.
 */
export async function isImmutable(objectId: string, client: SuiClient) {
  const obj = await client.getObject({
    id: objectId,
    options: {
      showOwner: true,
    },
  });
  const objectOwner = obj?.data?.owner;
  if (!objectOwner) {
    throw new Error(`Could not extract "owner" field of object ${objectId}`);
  }
  return objectOwner == 'Immutable';
}

/**
 * Checks if the given object type is a coin.
 * Defaults to checking if the object type is a SUI (gas) coin.
 * @param objectType The object type to check.
 * @param ofType The expected object type.
 * @returns True if the object type is a coin, false otherwise.
 */
export function isCoin(
  objectType: string,
  ofType = '0x2::coin::Coin<0x2::sui::SUI>',
) {
  return objectType === ofType;
}

/**
 * Checks if the required environment variables are present and have a value.
 * Throws an error if any of the required environment variables are missing.
 *
 * @param env - An object containing the environment variables to check.
 * @param envVariablesToCheck - An array of strings representing the names of the environment variables to check.
 * @throws {Error} If any of the required environment variables are missing.
 */
function checkForMissingEnvVariables(
  env: EnvironmentVariables,
  envVariablesToCheck: string[],
) {
  for (const [key, value] of Object.entries(env)) {
    if (envVariablesToCheck.includes(key) && !value) {
      throw new Error(`Missing environment variable ${key}`);
    }
  }
}

/**
 * Asynchronously waits for the specified amount of time.
 * @param ms - The number of milliseconds to wait.
 * @returns A promise that resolves after the specified time has elapsed.
 */
export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compares the contents of two maps and returns true if they are equal, false otherwise.
 * @param map1 - The first map to compare.
 * @param map2 - The second map to compare.
 * @returns True if the maps are equal, false otherwise.
 */
export function compareMaps<T>(map1: Map<string, T>, map2: Map<string, T>) {
  let testVal;
  if (map1.size !== map2.size) {
    return false;
  }
  for (const [key, val] of map1) {
    testVal = map2.get(key);
    // in cases of an undefined value, make sure the key
    // actually exists on the object so there are no false positives
    if (testVal !== val || (testVal === undefined && !map2.has(key))) {
      return false;
    }
  }
  return true;
}

/**
 * A helper class for setting up tests. It provides methods for ensuring that
 * the admin has enough coins and objects to run the tests.
 */
export class SetupTestsHelper {
  public MINIMUM_COIN_BALANCE: number;
  private readonly env: EnvironmentVariables;
  private client: SuiClient;
  private adminKeypair: Ed25519Keypair;

  public readonly objects: SuiObjectResponse[] = [];
  private suiCoins: SuiObjectResponse[] = [];

  constructor() {
    this.env = getEnvironmentVariables('../test/.env');
    this.MINIMUM_COIN_BALANCE = 700000000;
    this.client = new SuiClient({
      url: this.env.SUI_NODE,
    });
    this.adminKeypair = getKeyPair(this.env.ADMIN_SECRET_KEY);
  }

  /**
   * Sets up the admin by ensuring they have enough objects and coins.
   * @param minimumObjectsNeeded The minimum number of objects the admin needs.
   * @param minimumCoinsNeeded The minimum number of coins the admin needs.
   */
  public async setupAdmin(
    minimumObjectsNeeded: number,
    minimumCoinsNeeded: number,
  ) {
    const setup = async () => {
      await this.parseCurrentGasCoinsAndObjects();
      await this.assureAdminHasEnoughObjects(minimumObjectsNeeded);
      await this.assureAdminHasMoreThanEnoughCoins(minimumCoinsNeeded);
    };
    try {
      await setup();
    } catch (e) {
      console.warn(e);
      console.log('Retrying admin setup...');
      await setup();
    }
  }

  private async parseCurrentGasCoinsAndObjects() {
    let cursor: string | null | undefined = null;
    let resp;
    do {
      resp = await this.client.getOwnedObjects({
        owner: this.adminKeypair.toSuiAddress(),
        options: {
          showContent: true,
          showType: true,
        },
        cursor,
      });
      resp?.data.forEach((object) => {
        if (isCoin(object?.data?.type ?? '')) {
          this.suiCoins.push(object);
        } else {
          this.objects.push(object);
        }
      });
      cursor = resp?.nextCursor;
    } while (resp?.hasNextPage);
  }

  /*
  Reassure that the admin has enough coins and if not add them to him
   */
  private async assureAdminHasMoreThanEnoughCoins(minimumCoinsNeeded: number) {
    let coinToSplit: SuiObjectResponse | undefined;
    if (this.suiCoins.length < minimumCoinsNeeded) {
      for (let i = 0; i < minimumCoinsNeeded - this.suiCoins.length; i++) {
        coinToSplit = this.suiCoins.find((coin) => {
          const content = coin.data?.content;
          if (content && 'fields' in content && 'balance' in content.fields) {
            return (
              Number(content.fields?.balance ?? '0') >
              2 * this.MINIMUM_COIN_BALANCE
            );
          } else {
            return false;
          }
        });
        if (!coinToSplit) {
          throw new Error(
            `No coin with enough balance found. \
            To add new coins to account by splitting \
            you need at least ${2 * this.MINIMUM_COIN_BALANCE}`,
          );
        }
        const coinToSplitId = coinToSplit.data?.objectId;
        if (coinToSplitId) {
          await this.addNewCoinToAccount(coinToSplitId);
        }
      }
    }
  }

  private async assureAdminHasEnoughObjects(numberOfObjectsNeeded: number) {
    while (this.objects.length < numberOfObjectsNeeded) {
      await this.addNewObjectToAccount();
    }
  }

  private async addNewObjectToAccount() {
    const mintAndTransferTxb = new TransactionBlock();
    const hero = mintAndTransferTxb.moveCall({
      arguments: [
        mintAndTransferTxb.object(this.env.NFT_APP_ADMIN_CAP),
        mintAndTransferTxb.pure('zed'),
        mintAndTransferTxb.pure('gold'),
        mintAndTransferTxb.pure(3),
        mintAndTransferTxb.pure('ipfs://example.com/'),
      ],
      target: `${this.env.NFT_APP_PACKAGE_ID}::hero_nft::mint_hero`,
    });
    // Transfer to self
    mintAndTransferTxb.transferObjects(
      [hero],
      mintAndTransferTxb.pure(this.adminKeypair.getPublicKey().toSuiAddress()),
    );
    mintAndTransferTxb.setGasBudget(10000000);
    mintAndTransferTxb.setGasPayment(
      this.suiCoins.map((coin) => this.toSuiObjectRef(coin)),
    );
    await this.client.signAndExecuteTransactionBlock({
      transactionBlock: mintAndTransferTxb,
      requestType: 'WaitForLocalExecution',
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
      signer: this.adminKeypair,
    });
  }

  private async addNewCoinToAccount(cointToSplit: string) {
    const txb = new TransactionBlock();
    const coinToPay = await this.client.getObject({ id: cointToSplit });
    const newcoins1 = txb.splitCoins(txb.gas, [
      txb.pure(this.MINIMUM_COIN_BALANCE),
    ]);
    const newcoins2 = txb.splitCoins(txb.gas, [
      txb.pure(this.MINIMUM_COIN_BALANCE),
    ]);
    txb.transferObjects(
      [newcoins1, newcoins2],
      txb.pure(this.adminKeypair.toSuiAddress()),
    );
    txb.setGasBudget(100000000);
    txb.setGasPayment([this.toSuiObjectRef(coinToPay)]);
    this.client
      .signAndExecuteTransactionBlock({
        signer: this.adminKeypair,
        transactionBlock: txb,
        requestType: 'WaitForLocalExecution',
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      })
      .then((txRes) => {
        const status = txRes.effects?.status?.status;
        if (status !== 'success') {
          throw new Error(
            `Failed to split and add new coin to admin account! ${status}`,
          );
        }
      })
      .catch((err) => {
        throw new Error(
          `Failed to split coin <${cointToSplit}> and add new coin to admin account! ${err}`,
        );
      });
  }

  private toSuiObjectRef(coin: SuiObjectResponse): SuiObjectRef {
    const data = coin.data;
    if (!data?.objectId || !data?.digest || !data?.version) {
      throw new Error('Invalid coin - missing data');
    }
    return {
      objectId: data?.objectId,
      digest: data?.digest,
      version: data?.version,
    };
  }
}
