const MetamaskWallet = require("./src/wallet/metamask");
const RabbyWallet = require("./src/wallet/rabby");
const OKXWallet = require("./src/wallet/okx");
const XDCWallet = require("./src/wallet/xdc");
const CtrlWallet = require("./src/wallet/ctrl");
const WalletConnect = require("./src/wallet/walletconnect");
const WanWallet = require("./src/wallet/wanwallet");

module.exports = {
  MetamaskWallet,
  RabbyWallet,
  OKXWallet,
  XDCWallet,
  CtrlWallet,
  WalletConnect,
  WanWallet
};