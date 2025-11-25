import PeraWallet from "./src/wallet/pera";
import tool from "./src/tool.js";

export const getChains = () => ["Solana"];
export const getSymbols = () => ["SOL"];
export { PeraWallet };
export { tool };

export default {
  getChains,
  getSymbols,
  PeraWallet,
  tool
};
