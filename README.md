# Coin Management System (CMS)

This is an initial design of a coin management system. The outcome should be a library with a good docs that will allow any builder to have an address issuing many concurrent transactions without locking its coins.

## Develop
Install dependencies with `npm install`

### Test
Usually we use testnet for testing. Switch to testnet with: `sui client switch --env testnet`

First and foremost, you need to define a `.env`. The file template is in [.env.example](https://github.com/MystenLabs/coin_management_system/blob/main/test/.env.example). The variables defined there are the following

```[.env]
# The Admin should also be the publisher of the nft_app smart contract
ADMIN_SECRET_KEY=

# A user address that is used as a receiver of txbs. Used for testing.
TEST_USER_ADDRESS=
TEST_USER_SECRET=

# This object id points to a test nft object owned by the admin account. Used for testing.
TEST_NFT_OBJECT_ID=
# This object id is arbitrary and should not exist. Used for testing.
TEST_NON_EXISTING_OBJECT_ID=
# This object id should exist in the network but not be owned by the admin account. Used for testing.
TEST_NOT_OWNED_BY_ADMIN_OBJECT_ID=

# Used for testing. Get this by publishing the move_examples/nft_app/
NFT_APP_PACKAGE_ID=
NFT_APP_ADMIN_CAP=

# Example: "https://fullnode.testnet.sui.io:443"
SUI_NODE=

# NOTE: The Admin should also be the publisher of the nft_app smart contract
```

Tip: You can see your addresses' secret keys by running `cat ~/.sui/sui_config/sui.keystore`

We use the [jest](https://jestjs.io/) framework for testing. Having installed the project's packages with `npm install`, you can run the tests by either:

1. The vscode `jest` extension (Extension Id: **Orta.vscode-jest**) - [Recommended]

The extension provides a flask to the IDE sidebar where you run the tests (altogether or one-by-one) and show the results in the editor. You can also run the tests in debug mode and set breakpoints in the code. Very useful when doing [TDD](https://en.wikipedia.org/wiki/Test-driven_development).

2. ... or from the command line using `node_modules/.bin/jest --verbose` - Best for CI/CD
