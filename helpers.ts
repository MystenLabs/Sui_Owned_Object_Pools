import { Ed25519Keypair, fromB64 } from "@mysten/sui.js";

/// Method to make keypair from private key that is in string format
export function getKeyPair(privateKey: string): Ed25519Keypair {
  const privateKeyArray = Array.from(fromB64(privateKey));
  privateKeyArray.shift();
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
}
