const TonkeeperWallet = require("./src/wallet/tonkeeper");
const tool = require("./src/tool").default;

module.exports = {
  getChains: () => ["Ton"],
  getSymbols: () => ["TON"],
  TonkeeperWallet,
  tool
};