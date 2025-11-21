import PhantomWallet from "./src/wallet/phantom.js";
import tool$0 from "./src/tool.js";
const tool = tool$0.default;
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
