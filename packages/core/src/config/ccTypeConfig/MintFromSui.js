import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";
;
export default (class MintFromSui {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }
  async process(tokenPair, convert) {
    try {
      let direction = (convert.convertType === "MINT");
      let decimals = direction ? tokenPair.fromDecimals : tokenPair.toDecimals;
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0);
      let networkFee = tool.parseFee(convert.fee, convert.value, "SUI", { formatWithDecimals: false, feeType: "networkFee" });
      let toChainType = direction ? tokenPair.toChainType : tokenPair.fromChainType;
      let toAddressInfo = tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType));
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        userAccount: toAddressInfo.text,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessMintFromSui",
        networkFee,
        fromAddr: convert.fromAddr
      };
      console.debug("MintFromSui params: %O", params);
      let steps = [
        { name: "userFastMint", stepIndex: 1, params }
      ];
      return steps;
    }
    catch (err) {
      console.error("MintFromSui error: %O", err);
      throw err;
    }
  }
});
