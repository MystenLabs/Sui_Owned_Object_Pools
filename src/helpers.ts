import { SuiClient } from '@mysten/sui.js/client';
import { Coin } from '@mysten/sui.js/dist/cjs/framework/framework';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import {
  SuiObjectRef,
  SuiObjectResponse,
} from '@mysten/sui.js/src/client/types/generated';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { fromB64 } from '@mysten/sui.js/utils';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({
  path: path.resolve(__dirname, '../test/.env'),
});
/// Method to make keypair from private key that is in string format
export function getKeyPair(privateKey: string): Ed25519Keypair {
  const privateKeyArray = Array.from(fromB64(privateKey));
  privateKeyArray.shift();
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
}

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

export function getEnvironmentVariables() {
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

  checkForMissingVariables(env);

  return env;
}

export function isCoin(objectType: string, ofType: string) {
  const symbolRegExp = /^(\w+)::coin::Coin<\w+::\w+::(\w+)>$/;
  const matchAndGroups = objectType.match(symbolRegExp);
  if (!matchAndGroups || matchAndGroups.length < 2) {
    return false;
  }
  const coinSymbol = matchAndGroups[2];
  return coinSymbol === ofType;
}

function checkForMissingVariables(env: EnvironmentVariables) {
  for (const [key, value] of Object.entries(env)) {
    if (!value) {
      throw new Error(`Missing environment variable ${key}`);
    }
  }
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
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

export class SetupTestsHelper {
  public MINIMUM_COIN_BALANCE: number;
  private readonly env: EnvironmentVariables;
  private client: SuiClient;
  private adminKeypair: Ed25519Keypair;

  public readonly objects: SuiObjectResponse[] = [];
  private suiCoins: SuiObjectResponse[] = [];

  constructor() {
    this.env = getEnvironmentVariables();
    this.MINIMUM_COIN_BALANCE = 700000000;
    this.client = new SuiClient({
      url: this.env.SUI_NODE,
    });
    this.adminKeypair = getKeyPair(this.env.ADMIN_SECRET_KEY);
  }

  /*
  Reassure that the admin has enough coins and objects to run the tests
   */
  public async setupAdmin(
    minimumObjectsNeeded: number,
    minimumCoinsNeeded: number,
  ) {
    const setup = async () => {
      await this.parseCurrentCoinsAndObjects();
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

  private async parseCurrentCoinsAndObjects() {
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
        if (isCoin(object?.data?.type ?? '', 'SUI')) {
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
        coinToSplit = this.suiCoins.find((coin) =>
          Coin.getBalance(coin)
            ? (Coin.getBalance(coin) ?? 0) > 2 * this.MINIMUM_COIN_BALANCE
            : false,
        );
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
