import PeraWallet from "./src/wallet/pera";
import tool from "./src/tool.js";

export const getChains = () => ["Algorand"];
export const getSymbols = () => ["ALGO"];
export { PeraWallet };
export { tool };

export default {
  getChains,
  getSymbols,
  PeraWallet,
  tool
};
