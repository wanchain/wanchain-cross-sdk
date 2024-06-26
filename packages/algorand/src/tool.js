const algosdk = require('algosdk');

function validateAddress(address) {
  return algosdk.isValidAddress(address);
}

function getStandardAddressInfo(address) { // support encoded native or decoded format
  let native = "", evm = "", cctp = "";
  if (algosdk.isValidAddress(address)) {
    native = address;
  } else {
    native = algosdk.encodeAddress(Buffer.from(hexStrip0x(address), "hex"));
  }
  evm = asciiToHex(native);
  cctp = '0x' + Buffer.from(algosdk.decodeAddress(native).publicKey).toString('hex');
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

function getAlgoSdk() {
  return algosdk;
}

function getPrefixKey(prefix, id) {
  let len = 8 + prefix.length;
  let b = Buffer.alloc(2 + len);
  b.writeUint16BE(len, 0);
  b.write(prefix, 2);
  b.writeBigUInt64BE(BigInt(id), 2 + prefix.length)
  return new Uint8Array(b);
}

module.exports = {
  validateAddress,
  getStandardAddressInfo,
  getAlgoSdk,
  getPrefixKey
}