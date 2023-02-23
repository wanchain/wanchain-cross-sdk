const wasm = require("@emurgo/cardano-serialization-lib-asmjs");

function bytesAddressToBinary(bytes) {
  return bytes.reduce((str, byte) => str + byte.toString(2).padStart(8, '0'), '');
}

// WAValidator can not valid testnet address
function validateAddress(address, network) {
  const networkId = (network === "testnet")? 0 : 1;
  try {
    let addr = wasm.ByronAddress.from_base58(address);
    console.debug("%s is ADA Byron base58 address", address);
    return (addr.network_id() === networkId);
  } catch (e) {
    console.debug("%s is not ADA Byron base58 address: %O", address, e);
  }
  try {
    let addr = wasm.Address.from_bech32(address);
    try {
      let byronAddr = wasm.ByronAddress.from_address(addr);
      if (byronAddr) {
        console.debug("%s is ADA Byron bech32 address", address);
      }
      return (byronAddr.network_id() === networkId); // byronAddr is undefined to throw error
    } catch (e) {
      let prefix = bytesAddressToBinary(addr.to_bytes()).slice(0, 4);
      console.log("%s is Shelly type %s address", address, prefix);
      if (parseInt(prefix, 2) > 7) {
        return false;
      }
      return (addr.network_id() === networkId);
    }
  } catch (e) {
    console.debug("%s is not ADA bech32 address: %O", address, e);
  }
  return false;
}

module.exports = {
  validateAddress,
}