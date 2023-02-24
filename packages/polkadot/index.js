const PolkadotJsWallet = require("./src/wallet/polkadotJs");
const tool = require("./src/tool");

module.exports = {
  getChains: () => ["Polkadot", "Phala"],
  getSymbols: () => ["DOT", "PHA"],
  PolkadotJsWallet,
  tool
};