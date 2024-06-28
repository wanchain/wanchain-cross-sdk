const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool");

class AssetPairs {

  constructor() {
    this.assetPairList = [];
    this.smgList = [];
    this.tokens = new Set(); // not need to be classified by chain
  }

  setAssetPairs(tokenPairs, smgs, configService = null) {
    if (smgs) { // maybe only update active tokenpairs by crossTypes
      let smgList = smgs.map(smg => {
        if (!(smg.algo1 && smg.algo2)) {
          smg.algo1 = smg.curve1; // bn256 => schnorr
          smg.algo2 = smg.curve2; // secp256 => ecdsa
        }
        const smgInfo = {
          id: smg.groupId,
          name: tool.ascii2letter(smg.groupId),
          gpk1: smg.gpk1,
          gpk2: smg.gpk2,
          curve1: smg.curve1,
          curve2: smg.curve2,
          endTime: smg.endTime,
          algo1: smg.algo1,
          algo2: smg.algo2,
        };
        for (let i = 3; smg["gpk" + i]; i++) {
          smgInfo["gpk" + i] = smg["gpk" + i];
          smgInfo["curve" + i] = smg["curve" + i];
          smgInfo["algo" + i] = smg["algo" + i];
        }
        return smgInfo;
      });
      this.smgList = smgList;
    }

    if (tokenPairs) { // maybe only update smgs
      let pairList = tokenPairs.map(pair => { // tokenPairService have chainType info but not expose to frontend
        this.tokens.add(this.getTokenAccount(pair.fromChainType, pair.fromAccount, configService).toLowerCase());
        this.tokens.add(this.getTokenAccount(pair.toChainType, pair.toAccount, configService).toLowerCase());
        let assetPair = {
          assetPairId: pair.id,
          assetType: pair.readableSymbol,    // the readable ancestory symbol for this token
          assetAlias: pair.assetAlias,
          protocol: pair.protocol,           // token protocol: Erc20, Erc721, Erc1155
          ancestorChainName: pair.ancestorChainName, // ancestor Chain Name
          fromSymbol: pair.fromSymbol,       // token symbol for fromChain
          toSymbol: pair.toSymbol,           // token symbol for toChain
          fromDecimals: pair.fromDecimals,   // from token decimals
          toDecimals: pair.toDecimals,       // to token decimals
          fromChainName: pair.fromChainName, // from Chain Name
          toChainName: pair.toChainName,     // to Chain Name
          fromAccount: pair.fromAccount,
          toAccount: pair.toAccount,
          fromIsNative: pair.fromIsNative,   // is fromAccount is coin or native token
          toIsNative: pair.toIsNative,       // is toAccount is coin or native token
          fromIssuer: pair.fromIssuer,       // issuer of fromAccount, only for xFlow
          toIssuer: pair.toIssuer,           // issuer of toAccount, only for xFlow
          bridge: pair.bridge,               // bridge, default is WanBridge
          direction: pair.direction,
        };
        return assetPair;
      });
      this.assetPairList = pairList.sort(this.sortBy);
    }
  }

  sortBy(a, b) {
    if (a.assetType < b.assetType) {
      return -1;
    } else if (a.assetType > b.assetType) {
      return 1;
    }
    if (a.fromChainName < b.fromChainName) {
      return -1;
    } else if (a.fromChainName > b.fromChainName) {
      return 1;
    }
    if (a.toChainName < b.toChainName) {
      return -1;
    } else if (a.toChainName > b.toChainName) {
      return 1;
    }
    return 0;
  }

  isReady() {
    return ((this.assetPairList.length > 0) && (this.smgList.length > 0));
  }

  getTokenAccount(chainType, account, configService) {
    let result = "";
    if (account === "0x0000000000000000000000000000000000000000") {
      result = account;
    } else if (chainType === "XRP") {
      result = tool.parseXrpTokenPairAccount(account, false)[1]; // issuer, empty for XRP coin
    } else if (chainType === "NOBLE") { // ascii of token name
      result = tool.ascii2letter(account);
    } else if (chainType === "SOL") { // ascii of token account
      result = tool.ascii2letter(account);
    } else if (chainType === "ADA") { // ascii of policyId.name, not address
      result = tool.ascii2letter(account);
    } else if (chainType === "ALGO") { // ALGO token is id, not address
      result = new BigNumber(account).toFixed();
    } else {
      result = tool.getStandardAddressInfo(chainType, account, configService.getExtension(chainType)).native;
    }
    // console.log("getTokenAccount: %s, %s => %s", chainType, account, result);
    return result;
  }

  isTokenAccount(chainType, account, extension) {
    let checkAccount = tool.getStandardAddressInfo(chainType, account, extension).native.toLowerCase();
    return this.tokens.has(checkAccount);
  }
}

module.exports = AssetPairs;
