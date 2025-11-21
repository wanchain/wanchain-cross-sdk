import algosdk from "algosdk";
function validateAddress(address) {
  if (address.length === 58) { // 58-character base32 string includes the checksum
    return algosdk.isValidAddress(address);
  }
  else {
    return false;
  }
}
function getStandardAddressInfo(address) {
  if (validateAddress(address)) {
    let native = address;
    let evm = asciiToHex(native);
    // ignore cctp address as it is not supported now
    let compact = '0x' + Buffer.from(algosdk.decodeAddress(native).publicKey).toString('hex');
    return { native, evm, text: native, compact };
  }
  else {
    throw new Error("Algorand address is invalid: " + address);
  }
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
  b.writeBigUInt64BE(BigInt(id), 2 + prefix.length);
  return new Uint8Array(b);
}
function getLogCodec(types) {
  return algosdk.ABIType.from(types);
}
export { validateAddress };
export { getStandardAddressInfo };
export { getAlgoSdk };
export { getPrefixKey };
export { getLogCodec };
export default {
  validateAddress,
  getStandardAddressInfo,
  getAlgoSdk,
  getPrefixKey,
  getLogCodec
};
