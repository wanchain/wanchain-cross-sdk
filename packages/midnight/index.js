import MidnightLaceWallet from "./src/wallet/lace.js";
import tool from "./src/tool.js";

async function init(network) {
  await tool.setApiProviders(network);
}

export const getChains = () => ["Midnight"];
export const getSymbols = () => ["DUST"];
export { MidnightLaceWallet };
export { tool };
export { init };

export default {
  getChains,
  getSymbols,
  MidnightLaceWallet,
  tool,
  init
};
