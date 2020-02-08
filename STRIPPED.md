### Removed
- src/SLP/*
  Thinking this might be better suited in its own library?
- src/bch-js
  This is replaced by index.js. The official BCH-JS library could then inherit from this library.
- src/blockbook.js
  REST API Calls
- src/blockchain.js
  REST API Calls
- src/control.js
  REST API Calls
- src/generating.js
  REST API Calls
- src/mining.js
  REST API Calls
- src/ninsight.js
  REST API Calls
- src/open-bazaar.js
  REST API Calls
- src/price.js
  REST API Calls
- src/raw-transactions.js
  Replaced with Transaction class that doesn't depend upon REST calls.
- src/socket.js
  Bitcoin.com Socket Connection
- src/util.js
  REST API Calls
- src/wallet.js
  REST API Calls (not certain on this)
- test/e2e/*
  End-to-end testing not necessary
- test/integration/*
  Integration testing not necessary
- test/unit/bitbox-shim.js
  Removed
- test/unit/blockbook.js
  Removed
- test/unit/blockchain.js
  Removed
- test/unit/control.js
  Removed
- test/unit/generating.js
  Removed
- test/unit/mining.js
  Removed
- test/unit/ninsight.js
  Removed
- test/unit/openbazaar.js
  Removed
- test/unit/price.js
  Removed
- test/unit/raw-transactions.js
  Removed
- test/unit/slp*
  Removed
- test/unit/util
  Removed
   
### Added
- src/transaction.js, src/types, src/bufferutils
  Used to encode/decode Raw transactions (does not depend upon REST).
  Would like to find a better alternative, as the code I stole drags in other dependencies.

### Modified

- address.js
  Remved unnecessary constructor.
- schnorr.js
  Removed unnecessary constructor.



