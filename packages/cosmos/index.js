const KeplrWallet = require("./src/wallet/keplr");
const tool = require("./src/tool");

module.exports = {
  getChains: () => ["Cosmos", "Noble", "Kava"],
  getSymbols: () => ["ATOM", "NOBLE", "KAVA"],
  KeplrWallet,
  tool
};