const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
const { web3Accounts, web3Enable, web3FromAddress } = require('@polkadot/extension-dapp');
const { PolkadotSS58Format } = require('@substrate/txwrapper-core');
const tool = require("../../../utils/tool.js");
const BigNumber = require("bignumber.js");
const util = require("@polkadot/util");
const utilCrypto = require("@polkadot/util-crypto");

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
const ToAccountLen = 40; // without '0x'

class Polkadot {
  constructor(type, provider) {
    this.type = type;
    if (typeof(provider) === "string") {
      if (provider === "mainnet") {
        provider = "wss://rpc.polkadot.io";
      } else  if (provider === "testnet") {
        provider = "wss://westend-rpc.polkadot.io";
      }
      provider = new WsProvider(provider);
    }
    this.api = new ApiPromise({provider});
  }

  // standard function

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

  async getBalance(addr) {
    await this.getApi();
    let { data: balance } = await this.api.query.system.account(addr);
    return balance.free;
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

  // customized function

  async getApi() {
    return this.api.isReady;
  }

  buildUserLockData(tokenPair, userAccount, fee) {
    let memo = "";
    tokenPair = Number(tokenPair);
    userAccount = tool.hexStrip0x(userAccount);
    fee = new BigNumber(fee).toString(16);
    if ((tokenPair !== NaN) && (userAccount.length === ToAccountLen)) {
      let type = TX_TYPE.UserLock.toString(16).padStart(MemoTypeLen, 0);
      tokenPair = parseInt(tokenPair).toString(16).padStart(TokenPairIDLen, 0);
      memo = type + tokenPair + userAccount + fee;
    } else {
      console.error("buildUserlockMemo parameter invalid");
    }
    return memo;
  }

  async longPubKeyToAddress(longPubKey, ss58Format = 42) {
      longPubKey = '0x04' + longPubKey.slice(2);
      const tmp = util.hexToU8a(longPubKey);
      const pubKeyCompress = utilCrypto.secp256k1Compress(tmp);
      const hash = utilCrypto.blake2AsU8a(pubKeyCompress);
      const keyring = new Keyring({type: 'ecdsa', ss58Format: ss58Format});
      const address = keyring.encodeAddress(hash);
      return address;
  }

  async estimateFee(sender, txs) {
      await this.getApi();
      const fromInjector = await web3FromAddress(sender);
      const info = await this.api.tx.utility.batch(txs).paymentInfo(sender, {signer: fromInjector.signer});
      let fee = new BigNumber(info.partialFee.toHex());
      return fee;
  }
}

module.exports = Polkadot;