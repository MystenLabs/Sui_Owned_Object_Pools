import {
  Connection,
  Ed25519Keypair,
  fromB64,
  JsonRpcProvider,
  RawSigner,
  testnetConnection,
  TransactionBlock,
} from '@mysten/sui.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

import { CoinManagement } from '../src/coin-management';
import {
  buildGasPayment,
  getAnyKeyPair,
  getCoinWithMaxBalance,
  getGasCostFromDryRun,
} from '../src/helpers';

const provider = new JsonRpcProvider(testnetConnection);
const keypair = getAnyKeyPair(
  process.env.USER_PRIVATE_KEY!,
  'base64',
  'Ed25519',
);
const signer = new RawSigner(keypair, provider);

dotenv.config();

const mintedHeroes: string[] = [];
const mintGasUsed: number[] = [];
const burnGasUsed: number[] = [];
const updateGasUsed: number[] = [];
const fuseGasUsed: number[] = [];

const mintHero = async (cms: CoinManagement): Promise<void> => {
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

  const gasBudget = await getGasCostFromDryRun(tx, signer);
  console.log('necessary gasBudget', gasBudget);

  mintGasUsed.push(gasBudget || 0);

  // Get the sufficient available gas coins needed for the gasBudget
  const gasCoins = await cms.takeCoins(gasBudget !== null ? gasBudget : 0);

  tx.setGasPayment(gasCoins);

  try {
    const txRes = await signer.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      requestType: 'WaitForLocalExecution',
      options: {
        showEffects: true,
      },
    });
    console.log('txRes', txRes);
  } catch (e) {
    console.error('Could not sign and execute transaction block', e);
  }
};

// const updateHero = async (hero: string, stars: number): Promise<void> => {
//   const tx = new TransactionBlock();

//   tx.moveCall({
//     target: `${process.env.PACKAGE_ID}::hero_nft::update_stars`,
//     arguments: [tx.object(hero), tx.pure(stars)],
//   });

//   const signer = getSigner();

//   try {
//     const txRes = await signer.signAndExecuteTransactionBlock({
//       transactionBlock: tx,
//       requestType: 'WaitForLocalExecution',
//       options: {
//         showEffects: true,
//       },
//     });
//     console.log('Update hero', hero, stars);
//     const gasCost = getGasCostFromSuccessfulTx(txRes);
//     updateGasUsed.push(gasCost || 0);
//   } catch (e) {
//     console.error('Could not upgrade hero', e);
//   }
// };

// const burnHero = async (hero: string): Promise<void> => {
//   const tx = new TransactionBlock();

//   tx.moveCall({
//     target: `${process.env.PACKAGE_ID}::hero_nft::delete_hero`,
//     arguments: [tx.object(hero)],
//   });

//   const signer = getSigner();

//   try {
//     const txRes = await signer.signAndExecuteTransactionBlock({
//       transactionBlock: tx,
//       requestType: 'WaitForLocalExecution',
//       options: {
//         showEffects: true,
//       },
//     });

//     console.log('Burn hero', hero);
//     const gasCost = getGasCostFromSuccessfulTx(txRes);
//     burnGasUsed.push(gasCost || 0);
//   } catch (e) {
//     console.error('Could not burn hero', e);
//   }
// };

// const BATCH_SIZE = 5;

// const batchMint = async (): Promise<void> => {
//   for (let i = 0; i < BATCH_SIZE; i++) {
//     await mintHero();
//   }
// };

// const batchUpgrade = async (): Promise<void> => {
//   for (let i = 0; i < mintedHeroes.length; i++) {
//     await updateHero(mintedHeroes[i], i + 1);
//   }
// };

// const batchBurn = async (): Promise<void> => {
//   for (let i = 0; i < mintedHeroes.length; i++) {
//     await burnHero(mintedHeroes[i]);
//   }
// };

// const batchTest = async (): Promise<void> => {
//   await batchMint();
//   await batchUpgrade();
//   await batchBurn();

//   fs.writeFileSync(
//     './gas_results/mint_gas_results.json',
//     JSON.stringify(mintGasUsed),
//   );
//   fs.writeFileSync(
//     './gas_results/update_gas_results.json',
//     JSON.stringify(updateGasUsed),
//   );
//   fs.writeFileSync(
//     './gas_results/burn_gas_results.json',
//     JSON.stringify(burnGasUsed),
//   );
// };

// const testFuse = async (): Promise<void> => {
//   await mintHero();
//   await mintHero();
//   console.log('fuse cost', fuseGasUsed);

//   await mintHero();
//   await mintHero();
//   await updateHero(mintedHeroes[2], 2);
//   await burnHero(mintedHeroes[3]);
//   console.log('upgrade cost', updateGasUsed);
//   console.log('burn cost', burnGasUsed);
// };

// Script Initialization code.
if (process.argv[2] === undefined) {
  console.log('Please provide a command');
} else {
  const command = process.argv[2];

  switch (command) {
    case 'mintHero':
      CoinManagement.create(
        8000000,
        10,
        '0x00558a0eb6d553c4d34bbed80cd04cc0a67b6bdc70e876e4dafbac3aea61d086',
        process.env.USER_PRIVATE_KEY!,
        testnetConnection,
        'base64',
        'Ed25519',
      ).then((cms) => {
        mintHero(cms).then(() => {
          console.log(mintGasUsed);
        });
      });
      break;
    // case 'updateHero': // Add your Hero ObjectID before calling
    //   updateHero(
    //     '0x360b37ea8f7918f175cf1992bcb9926ed23843ad7e800ad7982d75f56fc927bb',
    //     2,
    //   ).then(() => {
    //     console.log(updateGasUsed);
    //   });
    //   break;
    // case 'burnHero':
    //   burnHero(
    //     '0x360b37ea8f7918f175cf1992bcb9926ed23843ad7e800ad7982d75f56fc927bb',
    //   ).then(() => {
    //     console.log(burnGasUsed);
    //   });
    //   break;
    // case 'testFuse':
    //   testFuse().then(() => {
    //     console.log(fuseGasUsed);
    //   });
    //   break;
    // case 'batchMint':
    //   batchMint().then(() => {
    //     console.log('minted heroes', mintedHeroes, mintGasUsed);
    //   });
    //   break;
    // case 'batchTest':
    //   batchTest();
    //   break;
    default:
      console.log('Invalid command');
      break;
  }
}
