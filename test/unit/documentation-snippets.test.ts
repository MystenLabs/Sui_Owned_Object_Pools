// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client/';
import type { SuiObjectRef, SuiObjectResponse } from '@mysten/sui.js/client/';
import { getKeyPair } from '../helpers/helpers';
import { ExecutorServiceHandler } from '../../src/executorServiceHandler';

/// Splits a specific coin and then transfer the split coin to the same address.
async function splitCoinAndTransferToSelf(
  client: SuiClient,
  coinObjectId: string,
  yourAddressSecretKey: string,
) {
  const txb = new TransactionBlock();
  const coinToPay = await client.getObject({ id: coinObjectId });
  const newCoin = txb.splitCoins(txb.gas, [txb.pure(300000000)]);
  txb.transferObjects([newCoin], txb.pure(coinObjectId));
  txb.setGasBudget(100000000);
  txb.setGasPayment([toSuiObjectRef(coinToPay)]);
  await client
    .signAndExecuteTransactionBlock({
      signer: getKeyPair(yourAddressSecretKey),
      transactionBlock: txb,
      requestType: 'WaitForLocalExecution',
      options: {
        showEffects: true,
      },
    })
    .then((txRes) => {
      const status = txRes.effects?.status?.status;
      if (status !== 'success') {
        throw new Error(
          `Could not split coin! ${txRes.effects?.status?.error}`,
        );
      }
    })
    .catch((err) => {
      throw new Error(`Error thrown: Could not split coin!: ${err}`);
    });
}

function toSuiObjectRef(coin: SuiObjectResponse): SuiObjectRef {
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

describe('README test - TODO: remove it', async () => {
  it('should be removed', async () => {
    const client = new SuiClient({
      url: 'https://fullnode.testnet.sui.io:443',
    });
    // TODO: add your coin object id here
    const objectId: string =
      '0x7ba6d3135fec2b6b36f130dcb9efb7e814ef34363c414363aa98a6f4b66e9b2f';
    // TODO: add your address secret key here
    const yourAddressSecretKey: string =
      'AD5Y4F8FwyiAGKdSdAnkbgNLxTj1taR6MsKsYEbXjTvx';

    // Split the coin 20 times -> Create 20 new coins and transfer them to your address
    for (let i = 0; i < 1; i++) {
      await splitCoinAndTransferToSelf(client, objectId, yourAddressSecretKey);
    }

    const eshandler = await ExecutorServiceHandler.initialize(
      getKeyPair(yourAddressSecretKey),
      client,
    );
  });
});
