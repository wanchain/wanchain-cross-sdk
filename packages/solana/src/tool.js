const anchor = require('@coral-xyz/anchor');
const { bs58 } = require('@coral-xyz/anchor/dist/cjs/utils/bytes');
const spl = require("@solana/spl-token");
const { PublicKey, Keypair } = require('@solana/web3.js');

function validateAddress(address) {
  try {
    bs58.decode(address);
    return true;
  } catch (err) {
    console.error("solana validateAddress %s error: %O", address, err);
    return false;
  }
}

function getStandardAddressInfo(address) {
  let native = "", evm = "", cctp = "";
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) { // standard evm address
    native = bs58.encode(Buffer.from(address.substr(2), "hex"));
  } else if (/^[0-9a-fA-F]{40}$/.test(address)) { // short evm address
    native = bs58.encode(Buffer.from(address, "hex"));
  } else if (validateAddress(address)) {
    native = address;
  }
  if (native) {
    evm = asciiToHex(native);
    cctp = '0x' + Buffer.from(bs58.decode(native)).toString('hex');
  }
  return {native, evm, ascii: native, cctp};
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

module.exports = {
  validateAddress,
  getStandardAddressInfo,
  hex2bytes,
  toBigNumber,
  getSystemProgramId,
  getTokenProgramId,
  findProgramAddress,
  getPda,
  getPublicKey,
  getKeypair,
  setComputeUnitLimit
}