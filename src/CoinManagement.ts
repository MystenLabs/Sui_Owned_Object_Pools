import {
    Ed25519Keypair,
    JsonRpcProvider,
    RawSigner,
    TransactionBlock,
    fromB64,
    testnetConnection,
    MIST_PER_SUI,
  } from "@mysten/sui.js";
  // Import the Coin class
  import { Coin } from "./Coin";
  // import { getKeyPair } from "./helpers";
  
  // Import the dotenv module to handle the .env file
  import * as dotenv from "dotenv";
  dotenv.config();

    // Define the Transfer interface for the getTransfers method
    interface Transfer {
        to: string;
        amount: number;
    }

    // Define the CoinData type
    type CoinData = Coin[];

    export class CoinManagement {
        
        private provider: JsonRpcProvider;
        private userKeyPair: Ed25519Keypair;
        private userAccount: RawSigner;
        private fetchedCoins: Coin[] = [];
        
        // Define the constructor for the CoinManagementSystem class
        constructor() {
            this.provider = new JsonRpcProvider(testnetConnection);
            const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY!;
            this.userKeyPair = this.getKeyPair(USER_PRIVATE_KEY);
            this.userAccount = new RawSigner(this.userKeyPair, this.provider);
        }
    
        private getKeyPair(privateKey: string): Ed25519Keypair {
            let privateKeyArray = Array.from(fromB64(privateKey));
            privateKeyArray.shift();
            return Ed25519Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
        }

          public async splitCoins(gasBudget: number, txnsEstimate: number): Promise<void>{
            const tranfers: Transfer[] = this.buildCoinTransfers(gasBudget, txnsEstimate);


          }

        // buildCoinTransfers method for making a list of transfers
        private buildCoinTransfers(gasBudget: number, totalNumofCoins: number): Transfer[] {
            const transfers: Transfer[] = [];

            for (let i=0; i < totalNumofCoins; i++){
                const transfer: Transfer = {
                    to: this.userKeyPair.getPublicKey().toSuiAddress(), // The address of the user 0x63d978f8eea20a587f227c8add048d6b8c0126d36178c11ae585d2d8d346237a
                    amount: gasBudget, // The amount of gas coin to be transferred
            };
            transfers.push(transfer);
        }
            return transfers;
        }
    
    
    
    }
