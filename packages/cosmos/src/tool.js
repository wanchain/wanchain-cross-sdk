const elliptic = require('elliptic')
const Secp256k1 = elliptic.ec('secp256k1');
const Amino = require("@cosmjs/amino");
const encoding = require("@cosmjs/encoding");
const { bech32 } = require('bech32');

const AddressPrefix = {
  Cosmos: "cosmos",
  ATOM: "cosmos",
  Noble: "noble",
  NOBLE: "noble"
}

function validateAddress(address) {
  try {
    encoding.fromBech32(address);
    return true;
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
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) { // standard evm address
    native = bech32.encode(AddressPrefix[chain], bech32.toWords(Buffer.from(address.substr(2), 'hex')));
  } else if (/^[0-9a-fA-F]{40}$/.test(address)) { // short evm address
    native = bech32.encode(AddressPrefix[chain], bech32.toWords(Buffer.from(address, 'hex')));
  } else if (validateAddress(address)) {
    native = address;
  }
  if (native) {
    evm = asciiToHex(native);
    cctp = '0x' + Buffer.from(bech32.fromWords(bech32.decode(native).words)).toString('hex');
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
};

module.exports = {
  validateAddress,
  gpk2Address,
  getStandardAddressInfo
}