import LaceWallet from "./src/wallet/lace.js";
import OneAmWallet from "./src/wallet/1am.js";
import tool from "./src/tool.js";

async function init(network) {
  await tool.setApiProviders(network);
}

export const getChains = () => ["Midnight"];
export const getSymbols = () => ["DUST"];
export { LaceWallet };
export { OneAmWallet };
export { tool };
export { init };

export default {
  getChains,
  getSymbols,
  LaceWallet,
  OneAmWallet,
  tool,
  init
};
