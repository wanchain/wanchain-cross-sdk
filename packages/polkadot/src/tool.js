import keyring from "@polkadot/keyring";
import * as util from "@polkadot/util";
import * as utilCrypto from "@polkadot/util-crypto";
const { encodeAddress } = keyring;
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
    return (network === "mainnet") ? SS58Format.polkadot : SS58Format.westend;
  }
  else if (["PHA", "Phala"].includes(chain)) {
    return (network === "mainnet") ? SS58Format.phala : SS58Format.phala;
  }
  else {
    throw new Error("unsupported polkadot chain " + chain);
  }
}
function validateAddress(address, options = {}) {
  try {
    let format = getSS58Format(options.chain, options.network);
    let addr = encodeAddress(address, format);
    console.log("polkadot %s %s address %s formatted to %s", options.chain, options.network, address, addr);
    return (address === addr);
  }
  catch (err) {
    console.log("polkadot %s %s address %s is invalid: %s", options.chain, options.network, address, err);
    return false;
  }
}
function gpk2Address(gpk, chain, network) {
  let compressed = utilCrypto.secp256k1Compress(util.hexToU8a('0x04' + gpk.slice(2)));
  let format = getSS58Format(chain, network);
  return encodeAddress(utilCrypto.blake2AsU8a(compressed), format);
}
export { getSS58Format };
export { validateAddress };
export { gpk2Address };
export default {
  getSS58Format,
  validateAddress,
  gpk2Address
};
