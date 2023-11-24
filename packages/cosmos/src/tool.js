const elliptic = require('elliptic')
const Secp256k1 = elliptic.ec('secp256k1');
const Amino = require("@cosmjs/amino");
const encoding = require("@cosmjs/encoding");

const AddressPrefix = {
  Cosmos: "cosmos",
  ATOM: "cosmos", 
}

function validateAddress(address) {
  try {
    encoding.fromBech32(address);
    return true;
  } catch (err) {
    console.error("cosmos validateAddress %s error: %O", address, err);
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

module.exports = {
  validateAddress,
  gpk2Address
}