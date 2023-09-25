const {WanBridge, Web3Wallet, WanWallet} = require('./packages/core');

// extensions
const CardanoExtension = require('./packages/cardano');
const PolkadotExtension = require('./packages/polkadot');
const TronExtension = require('./packages/tron');

module.exports = {
  WanBridge,
  Web3Wallet,
  WanWallet,
  CardanoExtension,
  PolkadotExtension,
  TronExtension
};