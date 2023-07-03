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
  }
  