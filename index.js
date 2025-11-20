const {WanBridge, Web3Wallet, UnisatWallet, OkxBitcoinWallet} = require('./packages/core');

// extensions
const CardanoExtension = require('./packages/cardano');
const PolkadotExtension = require('./packages/polkadot');
const TronExtension = require('./packages/tron');
const CosmosExtension = require('./packages/cosmos');
const SolanaExtension = require('./packages/solana');
const AlgorandExtension = require('./packages/algorand');
const SuiExtension = require('./packages/sui');
const VeChainExtension = require('./packages/vechain');
const TonExtension = require('./packages/ton');
const MidnightExtension = require('./packages/midnight');

module.exports = {
  WanBridge,
  Web3Wallet,
  UnisatWallet,
  OkxBitcoinWallet,
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