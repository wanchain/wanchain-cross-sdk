const PeraWallet = require('./src/wallet/pera');
const tool = require('./src/tool');

console.log("PeraWallet: %O", PeraWallet)

module.exports = {
  getChains: () => ["Algorand"],
  getSymbols: () => ["ALGO"],
  PeraWallet,
  tool
};