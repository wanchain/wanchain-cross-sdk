const { encodeAddress } = require('@polkadot/keyring');
const util = require("@polkadot/util");
const utilCrypto = require("@polkadot/util-crypto");

// self define to reduce imported package size
const SS58Format = {
  polkadot: 0,
  kusama: 2,
  phala: 30,
  westend: 42,
  substrate: 42,
};

function getSS58Format(chain, network) {
  if (["DOT", "Polkadot"].includes(chain)) {
    return (network === "mainnet")? SS58Format.polkadot : SS58Format.westend;
  } else if (["PHA", "Phala"].includes(chain)) {
    return (network === "mainnet")? SS58Format.phala : SS58Format.phala;
  } else {
    throw new Error("unsupported polkadot chain " + chain);
  }
}

function validateAddress(address, network, chain) {
  try {
    let format = getSS58Format(chain, network);
    let addr = encodeAddress(address, format);
    console.log("polkadot %s %s address %s formatted to %s", chain, network, address, addr);
    return (address === addr);
  } catch(err) {
    console.log("polkadot %s %s address %s is invalid: %s", chain, network, address, err);
    return false;
  }
}

function gpk2Address(gpk, chain, network) {
  let compressed = utilCrypto.secp256k1Compress(util.hexToU8a('0x04' + gpk.slice(2)));
  let format = getSS58Format(chain, network);
  return encodeAddress(utilCrypto.blake2AsU8a(compressed), format);
}

module.exports = {
  getSS58Format,
  validateAddress,
  gpk2Address
}