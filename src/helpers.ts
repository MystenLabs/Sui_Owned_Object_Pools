import { SuiClient } from '@mysten/sui.js/client';
import { Coin } from '@mysten/sui.js/dist/cjs/framework/framework';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SuiObjectResponse, SuiObjectRef } from '@mysten/sui.js/src/client/types/generated';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { fromB64 } from '@mysten/sui.js/utils';
import path from 'path';

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
  public MINIMUM_COIN_BALANCE = 2000000000;

  private client: SuiClient;
  private adminKeypair: Ed25519Keypair;

  public readonly objects: SuiObjectResponse[] = [];
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
  public async setupAdmin(minimumObjectsNeeded: number) {
    const setup = async () => {
      await this.parseCurrentCoinsAndObjects();
      await this.assureAdminHasEnoughObjects(minimumObjectsNeeded);
      await this.assureAdminHasEnoughCoins();
    }
    try {
      await setup()
    } catch (e) {
      console.warn(e);
      console.log("Retrying admin setup...");
      await setup()
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
        const coinToSplitId = coinToSplit.data?.objectId;
        if (coinToSplitId) {
          await this.addNewCoinToAccount(coinToSplitId);
        }
      }
    }
  }

  private async assureAdminHasEnoughObjects(numberOfObjectsNeeded: number) {
    while(this.objects.length < numberOfObjectsNeeded) {
      await this.addNewObjectToAccount();
    }
  }

  private async addNewObjectToAccount() {
    const mintAndTransferTxb = new TransactionBlock();
    const hero = mintAndTransferTxb.moveCall({
      arguments: [
        mintAndTransferTxb.object(process.env.NFT_APP_ADMIN_CAP!),
        mintAndTransferTxb.pure('zed'),
        mintAndTransferTxb.pure('gold'),
        mintAndTransferTxb.pure(3),
        mintAndTransferTxb.pure('ipfs://example.com/'),
      ],
      target: `${process.env.NFT_APP_PACKAGE_ID}::hero_nft::mint_hero`,
    });
    // Transfer to self
    mintAndTransferTxb.transferObjects(
      [hero],
      mintAndTransferTxb.pure(this.adminKeypair.getPublicKey().toSuiAddress()),
    );
    mintAndTransferTxb.setGasBudget(10000000);
    mintAndTransferTxb.setGasPayment(
      this.suiCoins.map(
        coin => this.toSuiObjectRef(coin)
      ));
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


  private async addNewCoinToAccount(cointToSplit : string) {
    const txb = new TransactionBlock();
    const coinToPay = await  this.client.getObject({ id: cointToSplit });
    let newcoins1 = txb.splitCoins(txb.gas, [txb.pure(7000000)]);
    let newcoins2 = txb.splitCoins(txb.gas, [txb.pure(7000000)]);
    txb.transferObjects([newcoins1, newcoins2], txb.pure(this.adminKeypair.toSuiAddress()));
    txb.setGasBudget(100000000);
    txb.setGasPayment([this.toSuiObjectRef(coinToPay)]);
    this.client.signAndExecuteTransactionBlock({
      signer: this.adminKeypair,
      transactionBlock: txb,
      requestType: "WaitForLocalExecution",
      options: {
        showEffects: true, showObjectChanges: true,
      },
    }).then((txRes) => {
      let status1 = txRes.effects?.status;
      if (status1?.status !== "success") {
        console.log("process failed. Status: ", status1);
        process.exit(1);
      }
      console.log("process Finished. Status: ", status1);
    }).catch((err) => {
      console.log("process failed. Error: ", err);
      process.exit(1);
    });
  }

  private toSuiObjectRef(coin: SuiObjectResponse): SuiObjectRef {
    return {
      objectId: coin.data?.objectId!,
      digest: coin.data?.digest!,
      version: coin.data?.version!,
    }
  }
}
