import TronLinkWallet from "./src/wallet/tronLink.js";
import tool from "./src/tool.js";
export const getChains = () => ["Tron"];
export const getSymbols = () => ["TRX"];
export { TronLinkWallet };
export { tool };
export default {
    getChains,
    getSymbols,
    TronLinkWallet,
    tool
};
