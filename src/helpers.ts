import path from 'path';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromB64 } from '@mysten/sui.js/utils';
import { SuiClient } from '@mysten/sui.js/client';
import { SuiObjectResponse } from '@mysten/sui.js/src/client/types/generated';
import { Coin } from '@mysten/sui.js/dist/cjs/framework/framework';
import { TransactionBlock } from '@mysten/sui.js/transactions';

require('dotenv').config({
  path: path.resolve(__dirname, '../test/.env'),
});

/// Method to make keypair from private key that is in string format
export function getKeyPair(privateKey: string): Ed25519Keypair {
  const privateKeyArray = Array.from(fromB64(privateKey));
  privateKeyArray.shift();
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
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
  public MINIMUM_ADMIN_COINS_NEEDED = 4;
  public MINIMUM_COIN_BALANCE = 20000000;

  private client: SuiClient;
  private adminKeypair: Ed25519Keypair;

  private objects: SuiObjectResponse[] = [];
  private suiCoins: SuiObjectResponse[] = [];

  constructor() {
    this.client = new SuiClient({
      url: process.env.SUI_NODE!,
    });
    this.adminKeypair = getKeyPair(process.env.ADMIN_SECRET_KEY!);
  }

  /*
  Reassure that the admin has enough coins and objects to run the tests
   */
  public async setupAdmin() {
    await this.parseCurrentCoinsAndObjects();
    await this.assureAdminHasEnoughCoins();
    // TODO await this.assureAdminHasEnoughObjects();
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
        if (Coin.isSUI(object)) {
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
  private async assureAdminHasEnoughCoins() {
    let coinToSplit: SuiObjectResponse;
    if (this.suiCoins.length < this.MINIMUM_ADMIN_COINS_NEEDED) {
      for (
        let i = 0;
        i < this.MINIMUM_ADMIN_COINS_NEEDED - this.suiCoins.length;
        i++
      ) {
        coinToSplit = this.suiCoins.find((coin) =>
          Coin.getBalance(coin)
            ? Coin.getBalance(coin)! > 2 * this.MINIMUM_COIN_BALANCE
            : false,
        )!;
        const gasCoin = this.suiCoins.find((coin) =>
          coinToSplit?.data?.objectId !== coin.data?.objectId
        );
        if (!gasCoin) {
          throw new Error('Failed to find a coin to use as gas. Split a coin manually or get one from faucet.');
        }
        if (coinToSplit) {
          await this.addNewCoinToAccount(coinToSplit, gasCoin);
        }
      }
    }
  }


  /*
  Increase the coins of the admin account
   */
  private async addNewCoinToAccount(fromCoin: SuiObjectResponse, gasCoin: SuiObjectResponse) {
    const transactionBlockSplitCoin = new TransactionBlock();
    const [coin] = transactionBlockSplitCoin.splitCoins(
      transactionBlockSplitCoin.pure(fromCoin.data?.objectId!),
      [transactionBlockSplitCoin.pure(this.MINIMUM_COIN_BALANCE)],
    );
    transactionBlockSplitCoin.transferObjects(
      [coin],
      transactionBlockSplitCoin.pure(this.adminKeypair.toSuiAddress()),
    );
    transactionBlockSplitCoin.setGasBudget(10000000);

    transactionBlockSplitCoin.setGasPayment([{
        objectId: gasCoin.data?.objectId!,
        digest: gasCoin.data?.digest!,
        version: gasCoin.data?.version!,
    }]);

    let coins = await this.client.getAllCoins({
      owner: this.adminKeypair.toSuiAddress(),
    });

    const res = await this.client.signAndExecuteTransactionBlock({
      // @ts-ignore
      transactionBlock: transactionBlockSplitCoin,
      requestType: 'WaitForLocalExecution',
      options: { showEffects: true },
      signer: this.adminKeypair,
    });

    if (res.effects?.status?.status !== 'success') {
      throw new Error('Failed to split coin');
    }
  }
}
