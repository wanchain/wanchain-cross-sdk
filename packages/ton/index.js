import TonkeeperWallet from "./src/wallet/tonkeeper.js";
import tool$0 from "./src/tool.js";
const tool = tool$0.default;
export const getChains = () => ["Ton"];
export const getSymbols = () => ["TON"];
export { TonkeeperWallet };
export { tool };
export default {
  getChains,
  getSymbols,
  TonkeeperWallet,
  tool
};
