const anchor = require('@coral-xyz/anchor');
const { bs58 } = require('@coral-xyz/anchor/dist/cjs/utils/bytes');
const spl = require("@solana/spl-token");
const { PublicKey, Keypair } = require('@solana/web3.js');

function validateAddress(address) {
  try {
    let pk = new PublicKey(address);
    return PublicKey.isOnCurve(pk.toBytes());
  } catch (error) {
    return false;
  }
}

function getStandardAddressInfo(address) { // support bs58 encoded native or decoded format
  let native = "", evm = "", cctp = "";
  try {
    bs58.decode(address); // throw exception while it is decoded format
    native = address;
  } catch (err) { // decoded
    native = bs58.encode(Buffer.from(hexStrip0x(address), "hex"));
  }
  evm = asciiToHex(native);
  cctp = '0x' + Buffer.from(bs58.decode(native)).toString('hex');
  return {native, evm, ascii: native, cctp};
}

function hexStrip0x(hexStr) {
  if (0 == hexStr.indexOf('0x')) {
      return hexStr.slice(2);
  }
  return hexStr;
}

// according to web3.utils.asciiToHex
function asciiToHex(str) {
	let hexString = '';
	for (let i = 0; i < str.length; i += 1) {
		const hexCharCode = str.charCodeAt(i).toString(16);
		// might need a leading 0
		hexString += hexCharCode.length % 2 !== 0 ? ('0' + hexCharCode) : hexCharCode;
	}
	return '0x' + hexString;
}

function hex2bytes(hex) {
  const bytes = [];
  for (let c = 0; c < hex.length; c += 2) bytes.push(parseInt(hex.substr(c, 2), 16));
  return bytes;
}

function toBigNumber(value) {
  return new anchor.BN(value);
}

function getSystemProgramId() {
  return anchor.web3.SystemProgram.programId;
}

function getTokenProgramId() {
  return spl.TOKEN_PROGRAM_ID;
}

function findProgramAddress(label, programId, extraSeeds) {
  const seeds = [Buffer.from(anchor.utils.bytes.utf8.encode(label))];
  if (extraSeeds) {
    for (const extraSeed of extraSeeds) {
      if (typeof extraSeed === "string") {
        seeds.push(Buffer.from(anchor.utils.bytes.utf8.encode(extraSeed)));
      } else if (Array.isArray(extraSeed)) {
        seeds.push(Buffer.from(extraSeed));
      } else if (Buffer.isBuffer(extraSeed)) {
        seeds.push(extraSeed);
      } else {
        seeds.push(extraSeed.toBuffer());
      }
    }
  }
  const res = anchor.web3.PublicKey.findProgramAddressSync(seeds, programId);
  return {publicKey: res[0], bump: res[1]};
}

function getAssociatedTokenAddressSync(tokenAddress, owner) {
  return spl.getAssociatedTokenAddressSync(tokenAddress, owner);
}

function getPda(key, id, programId, idBytes) {
  const res = PublicKey.findProgramAddressSync([Buffer.from(key), new anchor.BN(id).toArrayLike(Buffer, "le", idBytes)], programId);
  return {publicKey: res[0], bump: res[1]};
}

function getPublicKey(address) {
  return new PublicKey(address);
}

function getKeypair() {
  return Keypair.generate();
}

function setComputeUnitLimit(units) {
  return anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({units});
}

function setComputeUnitPrice(microLamports) {
  return anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({microLamports});
}

const CctpMsgMapping = [
  ["version", 4],
  ["sourceDomain", 4],
  ["destinationDomain", 4],
  ["nonce", 8],
  ["sender", 32],
  ["recipient", 32],
  ["destinationCaller", 32],
  ["version", 4],
  ["burnToken", 32],
  ["mintRecipient", 32],
  ["amount", 32],
  ["messageSender", 32]
];

function parseCctpDepositMessage(messageHex) {
  let messageBytes = Buffer.from(hexStrip0x(messageHex), "hex")
  let begin = 0, msg = {};
  for (let i = 0; i < CctpMsgMapping.length; i++) {
    let end = begin + CctpMsgMapping[i][1];
    msg[CctpMsgMapping[i][0]] = messageBytes.subarray(begin, end);
    begin = end;
  }
  return msg;
}

module.exports = {
  validateAddress,
  getStandardAddressInfo,
  hex2bytes,
  toBigNumber,
  getSystemProgramId,
  getTokenProgramId,
  findProgramAddress,
  getAssociatedTokenAddressSync,
  getPda,
  getPublicKey,
  getKeypair,
  setComputeUnitLimit,
  setComputeUnitPrice,
  parseCctpDepositMessage
}