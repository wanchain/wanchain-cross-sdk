const PhantomWallet = require("./src/wallet/phantom");
const tool = require("./src/tool").default;

module.exports = {
  getChains: () => ["Solana"],
  getSymbols: () => ["SOL"],
  PhantomWallet,
  tool
};