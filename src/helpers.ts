import {
  Ed25519Keypair,
  fromB64,
  JsonRpcProvider,
  RawSigner,
  Secp256k1Keypair,
  TransactionBlock,
  TransactionDigest,
  TransactionEffects,
} from '@mysten/sui.js';

/**
 * Retrieves the key pair (Ed25519 or Secp256k1) based on the provided key, key format, and key type.
 *
 * @param key - The private key or passphrase for generating the key pair.
 * @param keyFormat - The format of the key ('base64' | 'hex' | 'passphrase').
 * @param keyType - The type of the private key ('Ed25519' | 'Secp256k1').
 * @returns (Ed25519Keypair | Secp256k1Keypair) key pair.
 * @throws Error if the key format is invalid, the key type is invalid, or there is an error generating the key pair.
 */
export function getAnyKeyPair(
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
 * Find the coin with the biggest balance.
 */
export async function getCoinWithMaxBalance(
  provider: JsonRpcProvider,
  address: string,
): Promise<{
  version: string;
  digest: string;
  coinType: string;
  previousTransaction: string;
  coinObjectId: string;
  balance: string;
}> {
  const coins = await provider.getCoins({
    owner: address,
    coinType: '0x2::sui::SUI',
  });

  const coinWithMaxBalance = coins.data.reduce((maxCoin, currentCoin) => {
    const maxBalance = Number(maxCoin.balance);
    const currentBalance = Number(currentCoin.balance);

    return currentBalance > maxBalance ? currentCoin : maxCoin;
  });

  return coinWithMaxBalance;
}

type GasPaymentCoin = {
  digest: string;
  objectId: string;
  version: string | number;
};

type Coin = {
  version: string;
  digest: string;
  coinType: string;
  previousTransaction: string;
  coinObjectId: string;
  balance: string;
};

interface GasCost {
  computationCost: string;
  storageCost: string;
  storageRebate: string;
  nonRefundableStorageFee: string;
}

export function buildGasPayment(coins: Array<Coin>): Array<GasPaymentCoin> {
  // Build gas payment object.
  const gasPaymentCoins: Array<GasPaymentCoin> = [];

  for (const coin of coins) {
    gasPaymentCoins.push({
      digest: coin.digest,
      objectId: coin.coinObjectId,
      version: coin.version,
    });
  }

  // Return the coins to be used for gas payment.
  return gasPaymentCoins;
}

export async function getGasCostFromDryRun(
  txn: TransactionBlock,
  signer: RawSigner,
) {
  const txRes = await signer.dryRunTransactionBlock({
    transactionBlock: txn,
  });

  const gasCost =
    txRes.effects.status.status === 'success' ? txRes.effects.gasUsed : null;

  let gasBudget: number | null = null;
  if (typeof gasCost === 'object' && gasCost !== null) {
    const { computationCost, storageCost } = gasCost as GasCost;

    const parsedComputationCost = parseInt(computationCost, 10);
    const parsedStorageCost = parseInt(storageCost, 10);

    if (!isNaN(parsedComputationCost) && !isNaN(parsedStorageCost)) {
      gasBudget = parsedComputationCost + parsedStorageCost;
    } else {
      throw new Error('GasBudget was not calculated properly');
    }
  }

  return gasBudget;
}
