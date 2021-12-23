const { ApiPromise, WsProvider } = require('@polkadot/api');
const { web3Accounts, web3Enable, web3FromAddress } = require('@polkadot/extension-dapp');
const { PolkadotSS58Format } = require('@substrate/txwrapper-core');
const tool = require("../../../utils/tool.js");
const BigNumber = require("bignumber.js");

// memo should like follows
// memo_Type + memo_Data, Divided Symbols should be '0x'
// Type: 1, normal userLock; Data: tokenPairID + toAccount + fee
// Type: 2, normal smg release; Data: tokenPairId + uniqueId/hashX
// Type: 3, abnormal smg transfer for memo_userLock; Data: uniqueId
// Type: 4, abnomral smg transfer for tag_userLock; Data: tag
// Type: 5, smg debt transfer; Data: srcSmg
const TX_TYPE = {
  UserLock:   1,
  SmgRelease: 2,
  smgDebt:    5,
  Invalid:    -1
}

const MemoTypeLen = 2;
const TokenPairIDLen = 4;
const WanAccountLen = 40; // This should be peer chain( Wan Or Eth) address length. Exclude leadind '0x'

class Polkadot {
  // mainnet: "wss://rpc.polkadot.io"
  // testnet: "wss://westend-rpc.polkadot.io"
  constructor(type, provider) {
    this.type = type;
    if (typeof provider === "string") {
      provider = new WsProvider(provider);
    }
    this.api = new ApiPromise({provider});
  }

  async getApi() {
    return this.api.isReady;
  }

  async getChainId() {
    return 0;
  }

  async getAccounts(network) {
    const allInjected = await web3Enable('WanBridge');
    if (allInjected.length) {
      let ss58Format = ("testnet" === network)? PolkadotSS58Format.westend : PolkadotSS58Format.polkadot;
      let accounts = await web3Accounts({ss58Format});
      return accounts.map(a => a.address);
    } else {
      console.error("polkadot{.js} not installed or not allowed");
      throw new Error("Not installed or not allowed");
    }
  }  

  buildUserLockMemo(tokenPair, userAccount, fee) {
    let memo = "";
    tokenPair = Number(tokenPair);
    userAccount = tool.hexStrip0x(userAccount);
    fee = new BigNumber(fee).toString(16);
    if ((tokenPair !== NaN) && (userAccount.length === WanAccountLen)) {
      let type = TX_TYPE.UserLock.toString(16).padStart(MemoTypeLen, 0);
      let tokenPair = parseInt(tokenPair).toString(16).padStart(TokenPairIDLen, 0);
      memo = type + tokenPair + userAccount + fee;
    } else {
      console.error("buildUserlockMemo parameter invalid");
    }
    return memo;
  }

  async sendTransaction(txs, sender) {
    await this.getApi();
    const fromInjector = await web3FromAddress(sender);
    const blockInfo = await this.api.rpc.chain.getBlock();
    const blockNumber = blockInfo.block.header.number;
    const blockHash = await this.api.rpc.chain.getBlockHash(blockNumber.unwrap());
    let options = {};
    options.signer = fromInjector.signer;
    options.blockHash = blockHash.toHex();
    options.era = 64;
    const txHash = await this.api.tx.utility.batchAll(txs).signAndSend(sender, options);
    return txHash.toHex();
  }
}

module.exports = Polkadot;