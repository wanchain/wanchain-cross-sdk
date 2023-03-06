const TronLinkWallet = require("./src/wallet/tronLink");
const tool = require("./src/tool");

module.exports = {
  getChains: () => ["Tron"],
  getSymbols: () => ["TRX"],
  TronLinkWallet,
  tool,
};