const PolkadotJsWallet = require("./src/wallet/polkadotJs");
const tool = require("./src/tool");
const util = require("@polkadot/util");
const utilCrypto = require("@polkadot/util-crypto");
const { Keyring } = require("@polkadot/api");

module.exports = {
  getChains: () => ["Polkadot", "Phala"],
  getSymbols: () => ["DOT", "PHA"],
  PolkadotJsWallet,
  tool,
  util,
  utilCrypto,
  Keyring,
};