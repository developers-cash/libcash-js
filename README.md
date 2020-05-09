# LibCash-JS

LibCash-JS is a "pure" JavaScript Bitcoin Cash NPM library intended to be used as a "core" package that provides commonly used utility functions. It does not (and should not) contain any code that leverages any service (e.g. REST API Calls, Sockets, etc).

Although it can be used as a stand-alone library - it is intended to be used as a foundation to other SDK's by "extending" from it, thus providing these SDK's with a common library they can use to provide common BCH utilities.

For example, the Flowee-JS package extends this class, providing the Flowee SDK with many functions that would be required in typical BCH use-cases.

```javascript
/**
 * The Flowee Class will now have all the features/functions of the LibCash-JS Library
 */
class Flowee extends LibCash {
  // ... Flowee specific Code here
}
```

## Usage

- Install library: `npm install @developers.cash/libcash-js`

- Instantiate in your code:

```javascript
const LibCash = require("@developers.cash/libcash-js")

// Stand-alone
let libCash = new libCash();

// Or extend your SDK with LibCash functions
class MyBCHSDK extends LibCash {
  constructor(opts) {
    super(opts);
  }
  
  getTransaction(txId) {
    // REST API call to return Raw Transaction
    // return this.Transaction.fromBuffer(tx);
  }
}
```

## Features

LibCash-JS provides the following Utility Classes:

- Address
- BitcoinCash
- Crypto
- ECPair
- HDNode
- Mnemonic
- Schnorr
- Script
- TransactionBuilder
- Transaction

## License
[MIT](LICENSE.md)
