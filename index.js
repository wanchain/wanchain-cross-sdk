import { WanBridge } from "./packages/core/index.js";

// extensions
import EvmExtension from './packages/evm';
import BitcoinExtension from './packages/bitcoin';
import CardanoExtension from "./packages/cardano/index.js";
import PolkadotExtension from "./packages/polkadot/index.js";
import TronExtension from "./packages/tron/index.js";
import CosmosExtension from "./packages/cosmos/index.js";
import SolanaExtension from "./packages/solana/index.js";
import AlgorandExtension from "./packages/algorand/index.js";
import SuiExtension from "./packages/sui/index.js";
import VeChainExtension from "./packages/vechain/index.js";
import TonExtension from "./packages/ton/index.js";
import MidnightExtension from "./packages/midnight/index.js";

export { WanBridge };
export { EvmExtension };
export { BitcoinExtension };
export { CardanoExtension };
export { PolkadotExtension };
export { TronExtension };
export { CosmosExtension };
export { SolanaExtension };
export { AlgorandExtension };
export { SuiExtension };
export { VeChainExtension };
export { TonExtension };
export { MidnightExtension };

export default {
  WanBridge,
  EvmExtension,
  BitcoinExtension,
  CardanoExtension,
  PolkadotExtension,
  TronExtension,
  CosmosExtension,
  SolanaExtension,
  AlgorandExtension,
  SuiExtension,
  VeChainExtension,
  TonExtension,
  MidnightExtension
};
