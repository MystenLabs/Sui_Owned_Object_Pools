import { Ed25519Keypair, fromB64, Secp256k1Keypair } from '@mysten/sui.js';

/// Method to make keypair from private key that is in string format
export function getKeyPair(privateKey: string): Ed25519Keypair {
  const privateKeyArray = Array.from(fromB64(privateKey));
  privateKeyArray.shift();
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
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
