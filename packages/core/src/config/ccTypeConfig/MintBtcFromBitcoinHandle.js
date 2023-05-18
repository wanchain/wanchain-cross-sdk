'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');

const handleNames = {
  BTC: "MintBtcFromBitcoinHandle",
  LTC: "MintLtcFromLitecoinHandle",
  DOGE: "MintDogeFromDogecoinHandle"
};

module.exports = class MintBtcFromBitcoinHandle {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    let handleName = handleNames[tokenPair.fromChainType];
    try {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, tokenPair.fromDecimals));
      let fee = tool.parseFee(convert.fee, convert.value, tokenPair.ancestorSymbol);
      let toChainType = tokenPair.toChainType;
      let params = {
        ccTaskId: convert.ccTaskId,
        fromChainType: tokenPair.fromChainType,
        toChainType,
        userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).evm,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        storemanGroupGpk: convert.storemanGroupGpk,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessMintBtcFromBitcoin",
        fee
      };
      if (convert.gpkDetail) {
        params.gpkDetail = convert.gpkDetail
      }
      console.debug("%s params: %O", handleName, params);
      let steps = [
        {name: "addOTA", stepIndex: 1, title: "MintTitle", desc: "MintDesc", params}
      ];
      return steps;
    } catch (err) {
      console.error("%s error: %O", handleName, err);
      throw err;
    }
  }
};
