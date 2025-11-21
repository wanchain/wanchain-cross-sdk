import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";
'use strict';
export default (class MintXrpFromRipple {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }
  async process(tokenPair, convert) {
    try {
      let value = new BigNumber(convert.value);
      let direction = (convert.convertType === "MINT");
      let fromAccount = direction ? tokenPair.fromAccount : tokenPair.toAccount;
      if (fromAccount == 0) { // token ignore decimals
        let decimals = direction ? tokenPair.fromDecimals : tokenPair.toDecimals;
        value = value.multipliedBy(Math.pow(10, decimals));
      }
      value = value.toFixed();
      // neither apiServer nor storeman agent adopt the fee, they get fee from iwan or config contract,
      // so do not distinguish networkFee and operateFee, and ignore returned fee value of apiServer
      let fee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol);
      let toChainType = direction ? tokenPair.toChainType : tokenPair.fromChainType;
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).text,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        storemanGroupGpk: convert.gpkInfo.gpk,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessXrpMintFromRipple",
        fee
      };
      console.debug("Mint %s FromRipple params: %O", tokenPair.readableSymbol, params);
      let steps = [
        { name: "addTag", stepIndex: 1, params }
      ];
      return steps;
    }
    catch (err) {
      console.error("Mint %s FromRipple error: %O", tokenPair.readableSymbol, err);
      throw err;
    }
  }
});
