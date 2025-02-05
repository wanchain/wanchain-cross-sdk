const WanBridge = require('./src/bridge/wanBridge');
const Web3Wallet = require('./src/wallet/web3Wallet');
const UnisatWallet = require('./src/wallet/unisat');
const OkxBitcoinWallet = require('./src/wallet/okxBitcoin');

module.exports = {
  WanBridge,
  Web3Wallet,
  UnisatWallet,
  OkxBitcoinWallet
};