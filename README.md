# Sui Execution Handler

A library that provides a set of tools for managing multiple concurrent
transactions on the Sui network to help avoiding object equivocation and locking.

## Quickstart

### Installation
```bash
npm i sui-execution-handler
```

### Usage
Note: _You can find a more detailed example in the [section below](#Example-code)._
```typescript
// Initialize the ExecutorServiceHandler.
const eshandler = await ExecutorServiceHandler.initialize(
adminKeypair,
suiClient,
);

/// An then for each incoming request...
/// ...get the incoming transactionBlock
const myTransactionBlock;

/// and send it for execution
const promise = eshandler.execute(myTransactionBlock, suiClient, splitStrategy);
```

## Motivation

**Equivocation** is a common pitfall for builders using owned objects:
Implementing horizontal scaling or concurrency for a service that executes
transactions on Sui in the natural way results in an architecture that issues 
multiple transactions in parallel from the same account.

The community largely avoids using owned objects as a result, which also means 
they don’t benefit from their lower latency, which is a **unique selling point** 
for Sui. On top of that, they are impossible to completely avoid, because the 
transaction’s gas coin must be owned.

Finally, the situation is exacerbated by **gas smashing** (which combines automatically
all transaction’s gas coins into one) and our SDK’s default **coin selection** logic
which uses all the `Coin<SUI>`s owned by an address for every transaction’s 
gas payment. These defaults make sending transactions from an individual’s wallet 
simple (doing so automatically cleans up Coin dust), but mean that developers 
writing services need to work against the defaults to maintain distinct gas 
coins to run transactions in parallel.

**This library is a solution to the above, simplifying access to owned objects from 
back-end services that also need to take advantage of concurrency,
without equivocating their objects.**

## Solution

The main modules of the library are `executorServiceHandler.ts` and `pool.ts`.

- `executorServiceHandler.ts` contains the logic of the executor service - meaning
that it acts like a load balancer, distributing the transactions to the worker pools.
- `pool.ts` contains the logic of the worker pools.


As a user of the library you will only need to use the `executorServiceHandler.ts` module.

The basic idea of our solution is to use multiple **worker pools**
where each one of them will execute one of the transactions. 

The flow goes as follows:

1. First we initialize the ExecutorServiceHandler containing only one mainPool.
Then whenever a transaction is submitted to the ExecutorServiceHandler, it will
try to find if there is an available worker pool to sign and execute the transaction. 
Note that the main pool is not a worker pool.

2. If a worker pool is not found, the executor handler will create one by splitting
the mainPool - i.e. taking a part of the mainPool's objects and coins and creating a new worker pool.  
This is how the executor handler scales up. You can define the split logic by providing
a SplitStrategy object to the ExecutorServiceHandler on initialization.

### Example code

Let's define an example to make things clearer: Assume that we need to execute 10 transactions that transfer 100 MIST each to a fixed recipient.
```typescript
/* HERE ARE DEFINED THE PREPARATORY STEPS IF YOU WANT TO CODE ALONG*/
// Define the transaction block
function createPaymentTxb(recipient: string): TransactionBlock {
  const txb = new TransactionBlock();
  const [coin] = txb.splitCoins(txb.gas, [txb.pure(MIST_TO_TRANSFER)]);
  txb.transferObjects([coin], txb.pure("<recipient-address>"));
  return txb;
}
// Define your admin keypair and client
const ADMIN_SECRET_KEY: string = "<your-address-secret-key>";
const adminPrivateKeyArray = Uint8Array.from(
  Array.from(fromB64(ADMIN_SECRET_KEY)),
);
const adminKeypair = Ed25519Keypair.fromSecretKey(
  adminPrivateKeyArray.slice(1),
);

const client = new SuiClient({
  url: process.env.SUI_NODE!,
});

```

Now we setup the service handler and to execute the transactions we defined above, we will use the `execute` method of the `ExecutorServiceHandler` class.

```typescript
// Setup the executor service
const eshandler = await ExecutorServiceHandler.initialize(
  adminKeypair,
  client,
);
// Define the number of transactions to execute
const promises = [];
let txb: TransactionBlock;
for (let i = 0; i < 10; i++) {
  txb = createPaymentTxb(process.env.TEST_USER_ADDRESS!);
  promises.push(eshandler.execute(txb, client, splitStrategy));
}

// Collect the promise results
const results = await Promise.allSettled(promises);
```

It's that simple! 

## Local Development

### Installing the library

Install dependencies with `npm install`

### Code consistency
Before commiting your changes, run `npm run lint` to check for code style consistency.

### Testing

Tests are a great way to get familiar with the library. For each test scenario
there is a small description of the test's purpose and the library's commands to achieve that.

To **setup** the tests environment use `./test/initial_setup.sh`

The script will create a .env file in the test folder.
When the script is complete you only need to add a `ADMIN_SECRET_KEY` and a `TEST_USER_SECRET` to the `.env`.

Usually we use the testnet network for testing. Switch to testnet with: `sui client switch --env testnet`

At the end of the setup your .env should look like the template [.env.example](https://github.com/MystenLabs/coin_management_system/blob/main/test/.env.example).
i.e.

```[.env]
# The Admin should also be the publisher of the nft_app smart contract
ADMIN_SECRET_KEY=

# A user address that is used as a receiver of txbs. Used for testing.
TEST_USER_ADDRESS=
TEST_USER_SECRET=

# Used for testing. Get this by publishing the move_examples/nft_app/
NFT_APP_PACKAGE_ID=
NFT_APP_ADMIN_CAP=

# Example: "https://fullnode.testnet.sui.io:443"
SUI_NODE=

GET_WORKER_TIMEOUT_MS=1000
```

_Tip: You can see your addresses' secret keys by running `cat ~/.sui/sui_config/sui.keystore`. Each
secret's corresponding address is in the same row line that appears in `sui client addresses`_.

We use the [jest](https://jestjs.io/) framework for testing. Having installed the project's packages with `npm install`, you can run the tests by either:

1. The vscode `jest` extension (Extension Id: **Orta.vscode-jest**) - [Recommended]

The extension provides a flask to the IDE sidebar where you run the tests (altogether or one-by-one) and show the results in the editor. You can also run the tests in debug mode and set breakpoints in the code. Very useful when doing [TDD](https://en.wikipedia.org/wiki/Test-driven_development).

2. ... or from the command line using `npm run test` - Best for CI/CD
