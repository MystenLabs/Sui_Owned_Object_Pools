# Coin Management System (CMS)

This is an initial design of a coin management system. The outcome should be a library with a good docs that will allow any builder to have an address issuing many concurrent transactions without locking its coins.

## Develop
Install dependencies with `npm install`

### Test
To setup the tests environment use `./test/initial_setup.sh`

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
```

_Tip: You can see your addresses' secret keys by running `cat ~/.sui/sui_config/sui.keystore`_

We use the [jest](https://jestjs.io/) framework for testing. Having installed the project's packages with `npm install`, you can run the tests by either:

1. The vscode `jest` extension (Extension Id: **Orta.vscode-jest**) - [Recommended]

The extension provides a flask to the IDE sidebar where you run the tests (altogether or one-by-one) and show the results in the editor. You can also run the tests in debug mode and set breakpoints in the code. Very useful when doing [TDD](https://en.wikipedia.org/wiki/Test-driven_development).

2. ... or from the command line using `node_modules/.bin/jest --verbose` - Best for CI/CD
