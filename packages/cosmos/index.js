const KeplrWallet = require("./src/wallet/keplr");
const tool = require("./src/tool");

module.exports = {
  getChains: () => ["Cosmos", "Noble"],
  getSymbols: () => ["ATOM", "NOBLE"],
  KeplrWallet,
  tool
};