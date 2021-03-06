const Buffer = require('safe-buffer').Buffer;
const bcrypto = require('./crypto');
const bscript = require('./script');
const opcodes = require('bitcoincash-ops');
const typeforce = require('typeforce');
const varuint = require('varuint-bitcoin');

/**
 * Transaction Module
 */
class Transaction {
  constructor() {
    this.version = 1
    this.locktime = 0
    this.ins = []
    this.outs = []
  }
  
  static varSliceSize(someScript) {
    const length = someScript.length
    return varuint.encodingLength(length) + length
  }
  
  static vectorSize(someVector) {
    const length = someVector.length

    return varuint.encodingLength(length) + someVector.reduce(function (sum, witness) {
      return sum + this.varSliceSize(witness)
    }, 0)
  }
  
  static fromBuffer(buffer, __noStrict) {
    let offset = 0
    function readSlice (n) {
      offset += n
      return buffer.slice(offset - n, offset)
    }

    function readUInt32 () {
      const i = buffer.readUInt32LE(offset)
      offset += 4
      return i
    }

    function readInt32 () {
      const i = buffer.readInt32LE(offset)
      offset += 4
      return i
    }

    function readUInt64 () {
      const i = bufferutils.readUInt64LE(buffer, offset)
      offset += 8
      return i
    }

    function readVarInt () {
      const vi = varuint.decode(buffer, offset)
      offset += varuint.decode.bytes
      return vi
    }

    function readVarSlice () {
      return readSlice(readVarInt())
    }

    function readVector () {
      const count = readVarInt()
      const vector = []
      for (var i = 0; i < count; i++) vector.push(readVarSlice())
      return vector
    }

    const tx = new Transaction()
    tx.version = readInt32()

    const marker = buffer.readUInt8(offset)
    const flag = buffer.readUInt8(offset + 1)

    let hasWitnesses = false
    if (marker === Transaction.ADVANCED_TRANSACTION_MARKER &&
        flag === Transaction.ADVANCED_TRANSACTION_FLAG) {
      offset += 2
      hasWitnesses = true
    }

    const vinLen = readVarInt()
    for (var i = 0; i < vinLen; ++i) {
      tx.ins.push({
        hash: readSlice(32),
        index: readUInt32(),
        script: readVarSlice(),
        sequence: readUInt32(),
        witness: EMPTY_WITNESS
      })
    }

    const voutLen = readVarInt()
    for (i = 0; i < voutLen; ++i) {
      tx.outs.push({
        value: readUInt64(),
        script: readVarSlice()
      })
    }

    if (hasWitnesses) {
      for (i = 0; i < vinLen; ++i) {
        tx.ins[i].witness = readVector()
      }

      // was this pointless?
      if (!tx.hasWitnesses()) throw new Error('Transaction has superfluous witness data')
    }

    tx.locktime = readUInt32()

    if (__noStrict) return tx
    if (offset !== buffer.length) throw new Error('Transaction has unexpected data')

    return tx
  }
  
  fromHex(hex) {
    return Transaction.fromBuffer(Buffer.from(hex, 'hex'))
  }
  
  isCoinbaseHash(buffer) {
    typeforce(types.Hash256bit, buffer)
    for (var i = 0; i < 32; ++i) {
      if (buffer[i] !== 0) return false
    }
    return true
  }
  
  isCoinbase() {
    return this.ins.length === 1 && Transaction.isCoinbaseHash(this.ins[0].hash)
  }
  
  addInput(hash, index, sequence, scriptSig) {
    typeforce(types.tuple(
      types.Hash256bit,
      types.UInt32,
      types.maybe(types.UInt32),
      types.maybe(types.Buffer)
    ), arguments)

    if (types.Null(sequence)) {
      sequence = Transaction.DEFAULT_SEQUENCE
    }

    // Add the input and return the input's index
    return (this.ins.push({
      hash: hash,
      index: index,
      script: scriptSig || EMPTY_SCRIPT,
      sequence: sequence,
      witness: EMPTY_WITNESS
    }) - 1)
  }
  
  addOutput(scriptPubKey, value) {
    typeforce(types.tuple(types.Buffer, types.Satoshi), arguments)

    // Add the output and return the output's index
    return (this.outs.push({
      script: scriptPubKey,
      value: value
    }) - 1)
  }
  
  hasOutput(output) {
    for (let txOut of this.outs) {
      if (output.value === txOut.script.value) { // TODO Check output script
        return true
      }
    }
    
    return false;
  }
  
  hasOutputs(outputs) {
    for (let output of outputs) {
      if (!this.hasOutput(output)) {
        return false;
      }
    }
  }
  
  hasWitnesses() {
    return this.ins.some(function (x) {
      return x.witness.length !== 0
    })
  }
  
  weight() {
    const base = this.__byteLength(false)
    const total = this.__byteLength(true)
    return base * 3 + total
  }
  
  virtualSize() {
    return Math.ceil(this.weight() / 4)
  }
  
  byteLength() {
    return this.__byteLength(true)
  }
  
  __byteLength(__allowWitness) {
    const hasWitnesses = __allowWitness && this.hasWitnesses()

    return (
      (hasWitnesses ? 10 : 8) +
      varuint.encodingLength(this.ins.length) +
      varuint.encodingLength(this.outs.length) +
      this.ins.reduce(function (sum, input) { return sum + 40 + this.varSliceSize(input.script) }, 0) +
      this.outs.reduce(function (sum, output) { return sum + 8 + this.varSliceSize(output.script) }, 0) +
      (hasWitnesses ? this.ins.reduce(function (sum, input) { return sum + this.vectorSize(input.witness) }, 0) : 0)
    )
  }
  
  clone() {
    const newTx = new Transaction()
    newTx.version = this.version
    newTx.locktime = this.locktime

    newTx.ins = this.ins.map(function (txIn) {
      return {
        hash: txIn.hash,
        index: txIn.index,
        script: txIn.script,
        sequence: txIn.sequence,
        witness: txIn.witness
      }
    })

    newTx.outs = this.outs.map(function (txOut) {
      return {
        script: txOut.script,
        value: txOut.value
      }
    })

    return newTx
  }
  
  /**
  * Hash transaction for signing a specific input.
  *
  * Bitcoin uses a different hash for each signed transaction input.
  * This method copies the transaction, makes the necessary changes based on the
  * hashType, and then hashes the result.
  * This hash can then be used to sign the provided transaction input.
  */
  hashForSignature(inIndex, prevOutScript, hashType) {
    typeforce(types.tuple(types.UInt32, types.Buffer, /* types.UInt8 */ types.Number), arguments)

    // https://github.com/bitcoin/bitcoin/blob/master/src/test/sighash_tests.cpp#L29
    if (inIndex >= this.ins.length) return ONE

    // ignore OP_CODESEPARATOR
    const ourScript = bscript.compile(bscript.decompile(prevOutScript).filter(function (x) {
      return x !== opcodes.OP_CODESEPARATOR
    }))

    const txTmp = this.clone()

    // SIGHASH_NONE: ignore all outputs? (wildcard payee)
    if ((hashType & 0x1f) === Transaction.SIGHASH_NONE) {
      txTmp.outs = []

      // ignore sequence numbers (except at inIndex)
      txTmp.ins.forEach(function (input, i) {
        if (i === inIndex) return

        input.sequence = 0
      })

    // SIGHASH_SINGLE: ignore all outputs, except at the same index?
    } else if ((hashType & 0x1f) === Transaction.SIGHASH_SINGLE) {
      // https://github.com/bitcoin/bitcoin/blob/master/src/test/sighash_tests.cpp#L60
      if (inIndex >= this.outs.length) return ONE

      // truncate outputs after
      txTmp.outs.length = inIndex + 1

      // "blank" outputs before
      for (var i = 0; i < inIndex; i++) {
        txTmp.outs[i] = BLANK_OUTPUT
      }

      // ignore sequence numbers (except at inIndex)
      txTmp.ins.forEach(function (input, y) {
        if (y === inIndex) return

        input.sequence = 0
      })
    }

    // SIGHASH_ANYONECANPAY: ignore inputs entirely?
    if (hashType & Transaction.SIGHASH_ANYONECANPAY) {
      txTmp.ins = [txTmp.ins[inIndex]]
      txTmp.ins[0].script = ourScript

    // SIGHASH_ALL: only ignore input scripts
    } else {
      // "blank" others input scripts
      txTmp.ins.forEach(function (input) { input.script = EMPTY_SCRIPT })
      txTmp.ins[inIndex].script = ourScript
    }

    // serialize and hash
    const buffer = Buffer.allocUnsafe(txTmp.__byteLength(false) + 4)
    buffer.writeInt32LE(hashType, buffer.length - 4)
    txTmp.__toBuffer(buffer, 0, false)

    return bcrypto.hash256(buffer)
  }

  hashForWitnessV0(inIndex, prevOutScript, value, hashType) {
    typeforce(types.tuple(types.UInt32, types.Buffer, types.Satoshi, types.UInt32), arguments)

    let tbuffer, toffset
    function writeSlice (slice) { toffset += slice.copy(tbuffer, toffset) }
    function writeUInt32 (i) { toffset = tbuffer.writeUInt32LE(i, toffset) }
    function writeUInt64 (i) { toffset = bufferutils.writeUInt64LE(tbuffer, i, toffset) }
    function writeVarInt (i) {
      varuint.encode(i, tbuffer, toffset)
      toffset += varuint.encode.bytes
    }
    function writeVarSlice (slice) { writeVarInt(slice.length); writeSlice(slice) }

    let hashOutputs = ZERO
    let hashPrevouts = ZERO
    let hashSequence = ZERO

    if (!(hashType & Transaction.SIGHASH_ANYONECANPAY)) {
      tbuffer = Buffer.allocUnsafe(36 * this.ins.length)
      toffset = 0

      this.ins.forEach(function (txIn) {
        writeSlice(txIn.hash)
        writeUInt32(txIn.index)
      })

      hashPrevouts = bcrypto.hash256(tbuffer)
    }

    if (!(hashType & Transaction.SIGHASH_ANYONECANPAY) &&
        (hashType & 0x1f) !== Transaction.SIGHASH_SINGLE &&
        (hashType & 0x1f) !== Transaction.SIGHASH_NONE) {
      tbuffer = Buffer.allocUnsafe(4 * this.ins.length)
      toffset = 0

      this.ins.forEach(function (txIn) {
        writeUInt32(txIn.sequence)
      })

      hashSequence = bcrypto.hash256(tbuffer)
    }

    if ((hashType & 0x1f) !== Transaction.SIGHASH_SINGLE &&
        (hashType & 0x1f) !== Transaction.SIGHASH_NONE) {
      const txOutsSize = this.outs.reduce(function (sum, output) {
        return sum + 8 + this.varSliceSize(output.script)
      }, 0)

      tbuffer = Buffer.allocUnsafe(txOutsSize)
      toffset = 0

      this.outs.forEach(function (out) {
        writeUInt64(out.value)
        writeVarSlice(out.script)
      })

      hashOutputs = bcrypto.hash256(tbuffer)
    } else if ((hashType & 0x1f) === Transaction.SIGHASH_SINGLE && inIndex < this.outs.length) {
      const output = this.outs[inIndex]

      tbuffer = Buffer.allocUnsafe(8 + this.varSliceSize(output.script))
      toffset = 0
      writeUInt64(output.value)
      writeVarSlice(output.script)

      hashOutputs = bcrypto.hash256(tbuffer)
    }

    tbuffer = Buffer.allocUnsafe(156 + this.varSliceSize(prevOutScript))
    toffset = 0

    const input = this.ins[inIndex]
    writeUInt32(this.version)
    writeSlice(hashPrevouts)
    writeSlice(hashSequence)
    writeSlice(input.hash)
    writeUInt32(input.index)
    writeVarSlice(prevOutScript)
    writeUInt64(value)
    writeUInt32(input.sequence)
    writeSlice(hashOutputs)
    writeUInt32(this.locktime)
    writeUInt32(hashType)
    return bcrypto.hash256(tbuffer)
  }
  
  /**
  * Hash transaction for signing a specific input for Bitcoin Cash.
  */
  hashForCashSignature(inIndex, prevOutScript, inAmount, hashType) {
    typeforce(types.tuple(types.UInt32, types.Buffer, /* types.UInt8 */ types.Number, types.maybe(types.UInt53)), arguments)

    // This function works the way it does because Bitcoin Cash
    // uses BIP143 as their replay protection, AND their algo
    // includes `forkId | hashType`, AND since their forkId=0,
    // this is a NOP, and has no difference to segwit. To support
    // other forks, another parameter is required, and a new parameter
    // would be required in the hashForWitnessV0 function, or
    // it could be broken into two..

    // BIP143 sighash activated in BitcoinCash via 0x40 bit
    if (hashType & Transaction.SIGHASH_BITCOINCASHBIP143) {
      if (types.Null(inAmount)) {
        throw new Error('Bitcoin Cash sighash requires value of input to be signed.')
      }
      return this.hashForWitnessV0(inIndex, prevOutScript, inAmount, hashType)
    } else {
      return this.hashForSignature(inIndex, prevOutScript, hashType)
    }
  }

  getHash() {
    return bcrypto.hash256(this.__toBuffer(undefined, undefined, false))
  }

  getId() {
    // transaction hash's are displayed in reverse order
    return this.getHash().reverse().toString('hex')
  }

  toBuffer(buffer, initialOffset) {
    return this.__toBuffer(buffer, initialOffset, true)
  }

  __toBuffer(buffer, initialOffset, __allowWitness) {
    if (!buffer) buffer = Buffer.allocUnsafe(this.__byteLength(__allowWitness))

    let offset = initialOffset || 0
    function writeSlice (slice) { offset += slice.copy(buffer, offset) }
    function writeUInt8 (i) { offset = buffer.writeUInt8(i, offset) }
    function writeUInt32 (i) { offset = buffer.writeUInt32LE(i, offset) }
    function writeInt32 (i) { offset = buffer.writeInt32LE(i, offset) }
    function writeUInt64 (i) { offset = bufferutils.writeUInt64LE(buffer, i, offset) }
    function writeVarInt (i) {
      varuint.encode(i, buffer, offset)
      offset += varuint.encode.bytes
    }
    function writeVarSlice (slice) { writeVarInt(slice.length); writeSlice(slice) }
    function writeVector (vector) { writeVarInt(vector.length); vector.forEach(writeVarSlice) }

    writeInt32(this.version)

    const hasWitnesses = __allowWitness && this.hasWitnesses()

    if (hasWitnesses) {
      writeUInt8(Transaction.ADVANCED_TRANSACTION_MARKER)
      writeUInt8(Transaction.ADVANCED_TRANSACTION_FLAG)
    }

    writeVarInt(this.ins.length)

    this.ins.forEach(function (txIn) {
      writeSlice(txIn.hash)
      writeUInt32(txIn.index)
      writeVarSlice(txIn.script)
      writeUInt32(txIn.sequence)
    })

    writeVarInt(this.outs.length)
    this.outs.forEach(function (txOut) {
      if (!txOut.valueBuffer) {
        writeUInt64(txOut.value)
      } else {
        writeSlice(txOut.valueBuffer)
      }

      writeVarSlice(txOut.script)
    })

    if (hasWitnesses) {
      this.ins.forEach(function (input) {
        writeVector(input.witness)
      })
    }

    writeUInt32(this.locktime)

    // avoid slicing unless necessary
    if (initialOffset !== undefined) return buffer.slice(initialOffset, offset)
    return buffer
  }

  toHex() {
    return this.toBuffer().toString('hex')
  }

  setInputScript(index, scriptSig) {
    typeforce(types.tuple(types.Number, types.Buffer), arguments)

    this.ins[index].script = scriptSig
  }

  setWitness(index, witness) {
    typeforce(types.tuple(types.Number, [types.Buffer]), arguments)

    this.ins[index].witness = witness
  }
}

Transaction.DEFAULT_SEQUENCE = 0xffffffff
Transaction.SIGHASH_ALL = 0x01
Transaction.SIGHASH_NONE = 0x02
Transaction.SIGHASH_SINGLE = 0x03
Transaction.SIGHASH_ANYONECANPAY = 0x80
Transaction.SIGHASH_BITCOINCASHBIP143 = 0x40
Transaction.ADVANCED_TRANSACTION_MARKER = 0x00
Transaction.ADVANCED_TRANSACTION_FLAG = 0x01
Transaction.FORKID_BCH = 0x00

const EMPTY_SCRIPT = Buffer.allocUnsafe(0)
const EMPTY_WITNESS = []
const ZERO = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex')
const ONE = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
const VALUE_UINT64_MAX = Buffer.from('ffffffffffffffff', 'hex')
const BLANK_OUTPUT = {
  script: EMPTY_SCRIPT,
  valueBuffer: VALUE_UINT64_MAX
}

const UINT31_MAX = Math.pow(2, 31) - 1
function UInt31 (value) {
  return typeforce.UInt32(value) && value <= UINT31_MAX
}

function BIP32Path (value) {
  return typeforce.String(value) && value.match(/^(m\/)?(\d+'?\/)*\d+'?$/)
}
BIP32Path.toJSON = function () { return 'BIP32 derivation path' }

const SATOSHI_MAX = 21 * 1e14
function Satoshi (value) {
  return typeforce.UInt53(value) && value <= SATOSHI_MAX
}

// external dependent types
const ECPoint = typeforce.quacksLike('Point')

// exposed, external API
const Network = typeforce.compile({
  messagePrefix: typeforce.oneOf(typeforce.Buffer, typeforce.String),
  bip32: {
    public: typeforce.UInt32,
    private: typeforce.UInt32
  },
  pubKeyHash: typeforce.UInt8,
  scriptHash: typeforce.UInt8,
  wif: typeforce.UInt8
})

// extend typeforce types with ours
const types = {
  BIP32Path: BIP32Path,
  Buffer256bit: typeforce.BufferN(32),
  ECPoint: ECPoint,
  Hash160bit: typeforce.BufferN(20),
  Hash256bit: typeforce.BufferN(32),
  Network: Network,
  Satoshi: Satoshi,
  UInt31: UInt31
}

for (var typeName in typeforce) {
  types[typeName] = typeforce[typeName]
}

// https://github.com/feross/buffer/blob/master/index.js#L1127
function verifuint(value, max) {
  if (typeof value !== 'number')
    throw new Error('cannot write a non-number as a number');
  if (value < 0)
    throw new Error('specified a negative value for writing an unsigned value');
  if (value > max) throw new Error('RangeError: value out of range');
  if (Math.floor(value) !== value)
    throw new Error('value has a fractional component');
}
function readUInt64LE(buffer, offset) {
  const a = buffer.readUInt32LE(offset);
  let b = buffer.readUInt32LE(offset + 4);
  b *= 0x100000000;
  verifuint(b + a, 0x001fffffffffffff);
  return b + a;
}
exports.readUInt64LE = readUInt64LE;
function writeUInt64LE(buffer, value, offset) {
  verifuint(value, 0x001fffffffffffff);
  buffer.writeInt32LE(value & -1, offset);
  buffer.writeUInt32LE(Math.floor(value / 0x100000000), offset + 4);
  return offset + 8;
}
exports.writeUInt64LE = writeUInt64LE;
function reverseBuffer(buffer) {
  if (buffer.length < 1) return buffer;
  let j = buffer.length - 1;
  let tmp = 0;
  for (let i = 0; i < buffer.length / 2; i++) {
    tmp = buffer[i];
    buffer[i] = buffer[j];
    buffer[j] = tmp;
    j--;
  }
  return buffer;
}
exports.reverseBuffer = reverseBuffer;

const bufferutils = {
  readUInt64LE: readUInt64LE,
  writeUInt64LE: writeUInt64LE
};

/**
 * Helper class for serialization of bitcoin data types into a pre-allocated buffer.
 * @private
 */
class BufferWriter {
  constructor(buffer, offset = 0) {
    this.buffer = buffer;
    this.offset = offset;
    typeforce(types.tuple(types.Buffer, types.UInt32), [buffer, offset]);
  }
  writeUInt8(i) {
    this.offset = this.buffer.writeUInt8(i, this.offset);
  }
  writeInt32(i) {
    this.offset = this.buffer.writeInt32LE(i, this.offset);
  }
  writeUInt32(i) {
    this.offset = this.buffer.writeUInt32LE(i, this.offset);
  }
  writeUInt64(i) {
    this.offset = writeUInt64LE(this.buffer, i, this.offset);
  }
  writeVarInt(i) {
    varuint.encode(i, this.buffer, this.offset);
    this.offset += varuint.encode.bytes;
  }
  writeSlice(slice) {
    if (this.buffer.length < this.offset + slice.length) {
      throw new Error('Cannot write slice out of bounds');
    }
    this.offset += slice.copy(this.buffer, this.offset);
  }
  writeVarSlice(slice) {
    this.writeVarInt(slice.length);
    this.writeSlice(slice);
  }
  writeVector(vector) {
    this.writeVarInt(vector.length);
    vector.forEach(buf => this.writeVarSlice(buf));
  }
}
exports.BufferWriter = BufferWriter;

/**
 * Helper class for reading of bitcoin data types from a buffer.
 * @private
 */
class BufferReader {
  constructor(buffer, offset = 0) {
    this.buffer = buffer;
    this.offset = offset;
    typeforce(types.tuple(types.Buffer, types.UInt32), [buffer, offset]);
  }
  readUInt8() {
    const result = this.buffer.readUInt8(this.offset);
    this.offset++;
    return result;
  }
  readInt32() {
    const result = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return result;
  }
  readUInt32() {
    const result = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return result;
  }
  readUInt64() {
    const result = readUInt64LE(this.buffer, this.offset);
    this.offset += 8;
    return result;
  }
  readVarInt() {
    const vi = varuint.decode(this.buffer, this.offset);
    this.offset += varuint.decode.bytes;
    return vi;
  }
  readSlice(n) {
    if (this.buffer.length < this.offset + n) {
      throw new Error('Cannot read slice out of bounds');
    }
    const result = this.buffer.slice(this.offset, this.offset + n);
    this.offset += n;
    return result;
  }
  readVarSlice() {
    return this.readSlice(this.readVarInt());
  }
  readVector() {
    const count = this.readVarInt();
    const vector = [];
    for (let i = 0; i < count; i++) vector.push(this.readVarSlice());
    return vector;
  }
}

module.exports = Transaction 
