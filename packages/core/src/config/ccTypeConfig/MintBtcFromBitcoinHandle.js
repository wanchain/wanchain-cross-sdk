'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');

module.exports = class MintBtcFromBitcoinHandle {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    let direction = (convert.convertType === "MINT");
    let fromChainType = direction? tokenPair.fromChainType : tokenPair.toChainType;
    let toChainType = direction? tokenPair.toChainType : tokenPair.fromChainType;
    let decimals = direction? tokenPair.fromDecimals : tokenPair.toDecimals;
    try {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0);
      let fee = tool.parseFee(convert.fee, convert.value, tokenPair.ancestorSymbol);
      let taskType = convert.wallet? "ProcessMintFromBitcoinWallet" : "ProcessMintBtcFromBitcoin";
      let params = {
        ccTaskId: convert.ccTaskId,
        fromChainType,
        toChainType,
        userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).ascii,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        gpkInfo: convert.gpkInfo,
        tokenPairID: convert.tokenPairId,
        value,
        taskType,
        fee
      };
      console.debug("Mint %s params: %O", fromChainType, params);
      let steps = [
        {name: "addOTA", stepIndex: 1, title: "MintTitle", desc: "MintDesc", params}
      ];
      return steps;
    } catch (err) {
      console.error("Mint %s error: %O", fromChainType, err);
      throw err;
    }
  }
};
