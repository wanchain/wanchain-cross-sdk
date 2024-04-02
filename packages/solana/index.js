const PhantomWallet = require("./src/wallet/phantom");
const tool = require("./src/tool");

module.exports = {
  getChains: () => ["Solana"],
  getSymbols: () => ["SOL"],
  PhantomWallet,
  tool
};