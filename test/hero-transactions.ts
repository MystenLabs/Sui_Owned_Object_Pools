import {
  Connection,
  Ed25519Keypair,
  fromB64,
  JsonRpcProvider,
  testnetConnection,
  RawSigner,
  TransactionBlock,
} from '@mysten/sui.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

import { CoinManagement } from '../src/CoinManagement';

  // Ways to create a CoinManagement instances
  // const cms = CoinManagement.createDefault(); // default rpcConnection is testnet

  const cms = CoinManagement.createDefault(testnetConnection);
  // const cms = CoinManagement.createWithCustomOptions(
  //   1735076, // chunksOfGas
  //   10, // txnsEstimate
  //   testnetConnection,
  //  );


dotenv.config();

console.log('Connecting to ', process.env.SUI_NETWORK);

const getProvider = (): JsonRpcProvider => {
  const suiNetwork = process.env.SUI_NETWORK!;

  if (!suiNetwork) {
    throw new Error('SUI_NETWORK is not defined in the environment variables');
  }

  const connOptions = new Connection({
    fullnode: suiNetwork,
  });
  const provider = new JsonRpcProvider(connOptions);

  return provider;
};

const getKeyPair = (privateKey: string): Ed25519Keypair => {
  const privateKeyArray: number[] = Array.from(fromB64(privateKey));
  privateKeyArray.shift();
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
};

const getSigner = (): RawSigner => {
  const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY!;
  const keypair = getKeyPair(USER_PRIVATE_KEY);

  const provider = getProvider();

  const signer = new RawSigner(keypair, provider);
  return signer;
};

const getGasCostFromSuccessfulTx = (txRes: any): number | null => {
  if (txRes.effects.status.status === 'success') {
    return txRes.effects.gasUsed;
  }
  return null;
};

const mintedHeroes: string[] = [];
const mintGasUsed: number[] = [];
const burnGasUsed: number[] = [];
const updateGasUsed: number[] = [];
const fuseGasUsed: number[] = [];

const mintHero = async (): Promise<void> => {
  const tx = new TransactionBlock();

  const hero = tx.moveCall({
    target: `${process.env.PACKAGE_ID}::hero_nft::mint_hero`,
    arguments: [
      tx.object(process.env.ADMIN_CAP_ID!),
      tx.pure('George'),
      tx.pure('Pro'),
      tx.pure(0),
      tx.pure(
        'https://static.wixstatic.com/media/db21f3_8770071c75f2409980109236eb055bb2~mv2.jpg/v1/fill/w_420,h_419,al_c,lg_1,q_80,enc_auto/Untitled.jpg',
      ),
    ],
  });

  tx.transferObjects([hero], tx.pure(process.env.NON_CUSTODIAN_ADDRESS!));

  const signer = getSigner();

  try {
    const txRes = await signer.dryRunTransactionBlock({
      transactionBlock: tx,
    });

    console.log('Mint hero', txRes.effects?.created?.[0]?.reference?.objectId);
    const objectId = txRes.effects?.created?.[0]?.reference?.objectId;
    if (objectId !== undefined) {
      mintedHeroes.push(objectId);
    }
    
    interface GasCost {
      computationCost: string;
      storageCost: string;
      storageRebate: string;
      nonRefundableStorageFee: string;
    }
    
    const gasCost = getGasCostFromSuccessfulTx(txRes);
    let gasBudget: number | null = null;
    
    if (typeof gasCost === 'object' && gasCost !== null) {
      const { computationCost, storageCost, storageRebate } = gasCost as GasCost;
    
      const parsedComputationCost = parseInt(computationCost, 10);
      const parsedStorageCost = parseInt(storageCost, 10);
    
      if (!isNaN(parsedComputationCost) && !isNaN(parsedStorageCost)) {
        gasBudget = (parsedComputationCost + parsedStorageCost);
      }
    }
    
    console.log('gas cost:', gasBudget);
    mintGasUsed.push(gasCost || 0);

    const gasCoins = await cms.takeCoins(gasBudget !== null ? gasBudget : 0, 0, 0.003470152);

    if (gasCoins.length === 0) {
      console.log('Unable to take gas coins. Insufficient balance available.');
    } else {
      console.log('Taken coins:');

      const mygasCoins: {
        digest: string;
        objectId: string;
        version: string | number;
      }[] = [];

      for (const coinId of gasCoins) {
        const coin = cms.getCoinById(coinId);
        if (coin) {
          console.log('-------Coin Used-------');
          console.log('Coin:', coin.coinObjectId);
          console.log('Balance:', coin.balance);
          console.log('Version:', coin.version);
          console.log('Digest:', coin.digest);

          mygasCoins.push({
            digest: coin.digest,
            objectId: coin.coinObjectId,
            version: coin.version,
          });
        }
      }
      tx.setGasPayment(mygasCoins);

      try {
        const txRes = await signer.signAndExecuteTransactionBlock({
          transactionBlock: tx,
          requestType: 'WaitForLocalExecution',
          options: {
            showEffects: true,
          },
        });
      } catch (e) {
        console.error('Could not sign and execute transaction block', e);
      }

    }
  } catch (e) {
    console.error('Could not mint hero', e);
  }
};


const updateHero = async (hero: string, stars: number): Promise<void> => {
  const tx = new TransactionBlock();

  tx.moveCall({
    target: `${process.env.PACKAGE_ID}::hero_nft::update_stars`,
    arguments: [tx.object(hero), tx.pure(stars)],
  });

  const signer = getSigner();

  try {
    const txRes = await signer.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      requestType: 'WaitForLocalExecution',
      options: {
        showEffects: true,
      },
    });
    console.log('Update hero', hero, stars);
    const gasCost = getGasCostFromSuccessfulTx(txRes);
    updateGasUsed.push(gasCost || 0);
  } catch (e) {
    console.error('Could not upgrade hero', e);
  }
};

const burnHero = async (hero: string): Promise<void> => {
  const tx = new TransactionBlock();

  tx.moveCall({
    target: `${process.env.PACKAGE_ID}::hero_nft::delete_hero`,
    arguments: [tx.object(hero)],
  });

  const signer = getSigner();

  try {
    const txRes = await signer.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      requestType: 'WaitForLocalExecution',
      options: {
        showEffects: true,
      },
    });

    console.log('Burn hero', hero);
    const gasCost = getGasCostFromSuccessfulTx(txRes);
    burnGasUsed.push(gasCost || 0);
  } catch (e) {
    console.error('Could not burn hero', e);
  }
};

const BATCH_SIZE = 5;

const batchMint = async (): Promise<void> => {
  for (let i = 0; i < BATCH_SIZE; i++) {
    await mintHero();
  }
};

const batchUpgrade = async (): Promise<void> => {
  for (let i = 0; i < mintedHeroes.length; i++) {
    await updateHero(mintedHeroes[i], i + 1);
  }
};

const batchBurn = async (): Promise<void> => {
  for (let i = 0; i < mintedHeroes.length; i++) {
    await burnHero(mintedHeroes[i]);
  }
};

const batchTest = async (): Promise<void> => {
  await batchMint();
  await batchUpgrade();
  await batchBurn();

  fs.writeFileSync(
    './gas_results/mint_gas_results.json',
    JSON.stringify(mintGasUsed),
  );
  fs.writeFileSync(
    './gas_results/update_gas_results.json',
    JSON.stringify(updateGasUsed),
  );
  fs.writeFileSync(
    './gas_results/burn_gas_results.json',
    JSON.stringify(burnGasUsed),
  );
};

const testFuse = async (): Promise<void> => {
  await mintHero();
  await mintHero();
  console.log('fuse cost', fuseGasUsed);

  await mintHero();
  await mintHero();
  await updateHero(mintedHeroes[2], 2);
  await burnHero(mintedHeroes[3]);
  console.log('upgrade cost', updateGasUsed);
  console.log('burn cost', burnGasUsed);
};

// Script Initialization code.
if (process.argv[2] === undefined) {
  console.log('Please provide a command');
} else {
  const command = process.argv[2];

  switch (command) {
    case 'mintHero':
      mintHero().then(() => {
        console.log(mintGasUsed);
      });
      break;
    case 'updateHero': // Add your Hero ObjectID before calling
      updateHero(
        '0x360b37ea8f7918f175cf1992bcb9926ed23843ad7e800ad7982d75f56fc927bb',
        2,
      ).then(() => {
        console.log(updateGasUsed);
      });
      break;
    case 'burnHero':
      burnHero(
        '0x360b37ea8f7918f175cf1992bcb9926ed23843ad7e800ad7982d75f56fc927bb',
      ).then(() => {
        console.log(burnGasUsed);
      });
      break;
    case 'testFuse':
      testFuse().then(() => {
        console.log(fuseGasUsed);
      });
      break;
    case 'batchMint':
      batchMint().then(() => {
        console.log('minted heroes', mintedHeroes, mintGasUsed);
      });
      break;
    case 'batchTest':
      batchTest();
      break;
    default:
      console.log('Invalid command');
      break;
  }
}
