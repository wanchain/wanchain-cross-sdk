import TonkeeperWallet from "./src/wallet/tonkeeper.js";
import tool from "./src/tool.js";

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
