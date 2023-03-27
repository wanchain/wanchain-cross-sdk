const NamiWallet = require("./src/wallet/nami");
const tool = require("./src/tool");

module.exports = {
  getChains: () => ["Cardano"],
  getSymbols: () => ["ADA"],
  NamiWallet,
  tool
};