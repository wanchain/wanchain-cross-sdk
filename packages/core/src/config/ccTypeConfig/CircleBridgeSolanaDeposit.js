import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";
;
export default (class CircleBridgeSolanaDeposit {
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
      let networkFee = tool.parseFee(convert.fee, convert.value, "SOL", { formatWithDecimals: false, feeType: "networkFee" });
      let toChainType = direction ? tokenPair.toChainType : tokenPair.fromChainType;
      let toAddressInfo = tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType));
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        feeHolder: chainInfo.feeHolder,
        userAccount: toAddressInfo.cctp || toAddressInfo.evm,
        toAddr: convert.toAddr, // for readability
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessCircleBridgeSolanaDeposit",
        networkFee,
        fromAddr: convert.fromAddr
      };
      console.debug("CircleBridgeSolanaDeposit params: %O", params);
      let steps = [
        { name: "userFastBurn", stepIndex: 1, params }
      ];
      return steps;
    }
    catch (err) {
      console.error("CircleBridgeSolanaDeposit error: %O", err);
      throw err;
    }
  }
});
