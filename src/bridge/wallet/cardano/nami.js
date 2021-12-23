const wasm = require("@emurgo/cardano-serialization-lib-asmjs");
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

const WanAccountLen = 40; // This should be peer chain( Wan Or Eth) address length. Exclude leadind '0x'

class Nami {
  constructor(type, provider) {
    this.type = type;
    this.cardano = window.cardano;
  }

  async getChainId() {
    return this.cardano.getNetworkId();
  }

  async getAccounts(network) {
    try {
      await this.cardano.enable();
      let accounts = await this.cardano.getUsedAddresses();
      accounts = accounts.map(v => wasm.Address.from_bytes(Buffer.from(v, 'hex')).to_bech32());
      return accounts;
    } catch (err) {
      console.error("polkadot{.js} not installed or not allowed");
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance(addr) {
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      let balance = await this.cardano.getBalance();
      return wasm.BigNum.from_bytes(Buffer.from(balance, 'hex')).to_str();
    } else {
      console.error("%s is not used address", addr);
      throw new Error("Not used address");
    }
  }  

  buildUserLockMetaData(tokenPair, userAccount, fee) {
    tokenPair = Number(tokenPair);
    userAccount = tool.hexStrip0x(userAccount);
    fee = new BigNumber(fee).toString(16);
    if ((tokenPair !== NaN) && (userAccount.length === WanAccountLen)) {
      let data = {
        1: {
          type: TX_TYPE.UserLock,
          tokenPair,
          userAccount,
          fee: new BigNumber(fee).toString(16)
        }
      };
      data = wasm.encode_json_str_to_metadatum(JSON.stringify(data), wasm.MetadataJsonSchema.BasicConversions);
      return wasm.GeneralTransactionMetadata.from_bytes(data.to_bytes());
    } else {
      console.error("buildUserLockMetaData parameter invalid");
      return null;
    }
  }

  async sendTransaction(txs, sender) {
  }
}

module.exports = Nami;