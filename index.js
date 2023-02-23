const {WanBridge, Web3Wallet} = require('./packages/core');

// extensions
const CardanoExtension = require('./packages/cardano');
const PolkadotExtension = require('./packages/polkadot');
const TronExtension = require('./packages/tron');

module.exports = {
  WanBridge,
  Web3Wallet,
  CardanoExtension,
  PolkadotExtension,
  TronExtension
};