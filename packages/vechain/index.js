import VeWorldWallet from "./src/wallet/veWorld.js";

export const getChains = () => ["VeChain"];
export const getSymbols = () => ["VET"];
export { VeWorldWallet };

export default {
  getChains,
  getSymbols,
  VeWorldWallet
};
