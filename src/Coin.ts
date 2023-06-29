export class Coin {
    // Define the Coin constructor
    constructor(
      public version: string,
      public digest: string,
      public coinType: string,
      public previousTransaction: string,
      public coinObjectId: string,
      public balance: string,
      public lockedUntilEpoch?: number | null
    ) {}
  
    // Accessors for Coin class properties
    get Version(): string {
      return this.version;
    }
  
    get Digest(): string {
      return this.digest;
    }
  
    get CoinType(): string {
      return this.coinType;
    }
  
    get PreviousTransaction(): string {
      return this.previousTransaction;
    }
  
    get CoinObjectId(): string {
      return this.coinObjectId;
    }
  
    get Balance(): string {
      return this.balance;
    }
  
    get LockedUntilEpoch(): number | null | undefined {
      return this.lockedUntilEpoch;
    }
  }
  