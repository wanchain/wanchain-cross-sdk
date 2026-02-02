import SuiWallet from "./src/wallet/suiWallet.js";
import tool from "./src/tool.js";

export const getChains = () => ["Sui"];
export const getSymbols = () => ["SUI"];
export { SuiWallet };
export { tool };

export default {
  getChains,
  getSymbols,
  SuiWallet,
  tool
};
