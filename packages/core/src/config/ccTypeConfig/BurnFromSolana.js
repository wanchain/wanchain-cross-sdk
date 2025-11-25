import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";

export default (class BurnFromSolana {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    try {
      let direction = (convert.convertType === "MINT");
      let chainInfo = direction ? tokenPair.fromScInfo : tokenPair.toScInfo;
      let decimals = direction ? tokenPair.fromDecimals : tokenPair.toDecimals;
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0);
      let toChainType = direction ? tokenPair.toChainType : tokenPair.fromChainType;
      let toAddressInfo = tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType));
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        feeHolder: chainInfo.feeHolder,
        userAccount: toAddressInfo.text,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessBurnFromSolana",
        fromAddr: convert.fromAddr
      };
      console.debug("BurnFromSolana params: %O", params);
      let steps = [
        { name: "userFastBurn", stepIndex: 1, params }
      ];
      return steps;
    } catch (err) {
      console.error("BurnFromSolana error: %O", err);
      throw err;
    }
  }
});
