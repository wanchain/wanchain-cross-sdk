import KeplrWallet from "./src/wallet/keplr.js";
import tool from "./src/tool.js";
export const getChains = () => ["Cosmos", "Noble", "Kava"];
export const getSymbols = () => ["ATOM", "NOBLE", "KAVA"];
export { KeplrWallet };
export { tool };
export default {
  getChains,
  getSymbols,
  KeplrWallet,
  tool
};
