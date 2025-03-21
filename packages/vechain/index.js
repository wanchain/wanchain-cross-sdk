const VeWorldWallet = require("./src/wallet/veWorld");
const tool = require("./src/tool").default;

module.exports = {
  getChains: () => ["VeWorld"],
  getSymbols: () => ["VET"],
  VeWorldWallet,
  tool
};