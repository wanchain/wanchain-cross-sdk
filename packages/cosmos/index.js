const KeplrWallet = require("./src/wallet/keplr");
const tool = require("./src/tool");

module.exports = {
  getChains: () => ["Cosmos"],
  getSymbols: () => ["ATOM"],
  KeplrWallet,
  tool
};