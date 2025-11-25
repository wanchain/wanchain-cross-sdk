import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";
;
export default (class BurnFromCardano {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }
  async process(tokenPair, convert) {
    try {
      let direction = (convert.convertType === "MINT");
      let chainInfo = direction ? tokenPair.fromScInfo : tokenPair.toScInfo;
      let decimals = direction ? tokenPair.fromDecimals : tokenPair.toDecimals;
      let toChainType = direction ? tokenPair.toChainType : tokenPair.fromChainType;
      let tokenType = tokenPair.protocol;
      let value = (tokenType === "Erc20") ? new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0) : convert.value;
      // fee is not necessary, storeman agent get fee from config contract
      let fee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol, { formatWithDecimals: false });
      let networkFee = tool.parseFee(convert.fee, convert.value, "ADA", { formatWithDecimals: false, feeType: "networkFee" });
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        crossScAddr: chainInfo.crossScAddr,
        feeHolder: chainInfo.feeHolder,
        userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).text,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        storemanGroupGpk: convert.gpkInfo.gpk,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessBurnFromCardano",
        fee,
        networkFee,
        fromAddr: convert.fromAddr,
        tokenType
      };
      console.debug("Burn %s FromCardano params: %O", tokenPair.readableSymbol, params);
      let steps = [
        { name: "userFastBurn", stepIndex: 1, params }
      ];
      return steps;
    }
    catch (err) {
      console.error("Burn %s FromCardano error: %O", tokenPair.readableSymbol, err);
      throw err;
    }
  }
});
