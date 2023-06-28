import {
    Ed25519Keypair,
    JsonRpcProvider,
    RawSigner,
    TransactionBlock,
    fromB64,
    testnetConnection
} from "@mysten/sui.js"

import * as dotenv from "dotenv";
dotenv.config();


// initialize a provider for testnet
const provider = new JsonRpcProvider(testnetConnection);

const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY!;


/// helper to make keypair from private key that is in string format
function getKeyPair(privateKey: string): Ed25519Keypair {
    let privateKeyArray = Array.from(fromB64(privateKey));
    privateKeyArray.shift();
    return Ed25519Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
}

// make the keypairs
const userKeyPair = getKeyPair(USER_PRIVATE_KEY);

// addresses
const userAddress = userKeyPair.getPublicKey().toSuiAddress();

console.log("user_address= ", userAddress);
const user_account = new RawSigner(userKeyPair, provider);
console.log("user_account= ", user_account);


  async function splitCoins(gasBudget: number, txnsEstimate: number, balance: number) {

    // Procure a list of some Sui transfers to make:
    const transfers: Transfer[] = getTransfers();
    // Splitting the balance into coins using `splitCoins` function
    const txb = new TransactionBlock();
    
    // First, split the gas coin into multiple coins:
    const coins = txb.splitCoins(
        txb.gas,
        transfers.map((transfer) => txb.pure(transfer.amount))
    );
    // Next, create a transfer transaction for each coin:
    transfers.forEach((transfer, index) => {
        txb.transferObjects([coins[index]], txb.pure(transfer.to));
    });

    return user_account.signAndExecuteTransactionBlock({
        transactionBlock: txb,
        options: {
            showObjectChanges: true,
            showBalanceChanges: true,
            showEffects: true,
            showEvents: true,
            showInput: true,
        },
            requestType: "WaitForLocalExecution",
          });   
}

interface Transfer {
    to: string;
    amount: number;
  }
  
function getTransfers(): Transfer[] {
    
    const transfers: Transfer[] = [];
  
    for (let i = 0; i < 10; i++) {
      const transfer: Transfer = {
        to: "0x63d978f8eea20a587f227c8add048d6b8c0126d36178c11ae585d2d8d346237a",
        amount: 100
      };
      transfers.push(transfer);
    }
    return transfers;
  }
  
  
async function main() {

    splitCoins(120, 10, 42900381368).then((res) => console.log(res));
}

// start the program
main();
