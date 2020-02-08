const Address = require('./address');
const BitcoinCash = require('./bitcoincash');
const Crypto = require('./crypto');
const ECPair = require('./ecpair');
const HDNode = require('./hdnode');
const Mnemonic = require('./mnemonic');
const Schnorr = require('./schnorr');
const Script = require('./script');
const Transaction = require('./transaction');
const TransactionBuilder = require('./transaction-builder');

class LibCash {
  constructor() {
    this.Address = new Address();
    this.BitcoinCash = new BitcoinCash(this.Address);
    this.Crypto = Crypto;
    this.ECPair = ECPair;
    this.ECPair.setAddress(this.Address);
    this.HDNode = new HDNode(this.Address);
    this.Mnemonic = new Mnemonic(this.Address);
    this.Schnorr = new Schnorr();
    this.Script = new Script();
    this.Transaction = Transaction; // TODO Turn into class to cure my OCD
    this.TransactionBuilder = TransactionBuilder;
    this.TransactionBuilder.setAddress(this.Address)
  }
}

module.exports = LibCash;
