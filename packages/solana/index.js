import PhantomWallet from "./src/wallet/phantom.js";
import tool from "./src/tool.js";

export const getChains = () => ["Solana"];
export const getSymbols = () => ["SOL"];
export { PhantomWallet };
export { tool };

export default {
  getChains,
  getSymbols,
  PhantomWallet,
  tool
};
