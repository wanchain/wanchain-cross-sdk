const MidnightLaceWallet = require("./src/wallet/lace");
const tool = require("./src/tool");

async function init(network) {
  await tool.initApi(network);
}

module.exports = {
  getChains: () => ["Midnight"],
  getSymbols: () => ["DUST"],
  MidnightLaceWallet,
  tool,
  init
};