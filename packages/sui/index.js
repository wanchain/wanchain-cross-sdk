const SuiWallet = require("./src/wallet/SuiWallet");
const tool = require("./src/tool").default;

module.exports = {
  getChains: () => ["Sui"],
  getSymbols: () => ["SUI"],
  SuiWallet,
  tool
};