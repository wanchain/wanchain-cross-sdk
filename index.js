const {WanBridge, Web3Wallet} = require('./packages/core');

// extensions
const CardanoExtension = require('./packages/cardano');
const PolkadotExtension = require('./packages/polkadot');
const TronExtension = require('./packages/tron');
const CosmosExtension = require('./packages/cosmos');
const SolanaExtension = require('./packages/solana');

module.exports = {
  WanBridge,
  Web3Wallet,
  CardanoExtension,
  PolkadotExtension,
  TronExtension,
  CosmosExtension,
  SolanaExtension
};