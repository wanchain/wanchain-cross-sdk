const elliptic = require('elliptic')
const Secp256k1 = elliptic.ec('secp256k1');
const Amino = require("@cosmjs/amino");
const encoding = require("@cosmjs/encoding");
const { bech32 } = require('bech32');

const AddressPrefix = {
  Cosmos: "cosmos",
  ATOM: "cosmos",
  Noble: "noble",
  NOBLE: "noble",
  Kava: "kava",
  KAVA: "kava",
}

function validateAddress(address, network, chain) {
  try {
    encoding.fromBech32(address);
    return (address.indexOf(AddressPrefix[chain]) === 0);
  } catch (err) {
    // console.error("cosmos validateAddress %s error: %O", address, err);
    return false;
  }
}

function gpk2Address(gpk, chain) {
  let pubKey = Secp256k1.keyFromPublic("04" + gpk.slice(2), 'hex');
  let compressed = pubKey.getPublic(true, 'hex');
  let buff = new Uint8Array(compressed.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  let rawAddress = Amino.rawSecp256k1PubkeyToRawAddress(buff);
  return encoding.toBech32(AddressPrefix[chain], rawAddress);
}

function getStandardAddressInfo(address, chain = "Noble") {
  let native = "", evm = "", cctp = "";
  if (validateAddress(address, "", chain)) {
    native = address;
    evm = asciiToHex(native);
    cctp = '0x' + Buffer.from(bech32.fromWords(bech32.decode(native).words)).toString('hex');
  } else {
    console.error("%s address %s is invalid", chain, address);
  }
  return {native, evm, text: native, cctp, compact: cctp};
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
};

module.exports = {
  validateAddress,
  gpk2Address,
  getStandardAddressInfo
}