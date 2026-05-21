import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";

class MintFromMidnight {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
    let extension = this.configService.getExtension("DUST");
    this.tool = extension.tool;
  }

  async process(tokenPair, convert) {
    try {
      let direction = (convert.convertType === "MINT");
      let chainInfo = direction ? tokenPair.fromScInfo : tokenPair.toScInfo;
      let decimals = direction ? tokenPair.fromDecimals : tokenPair.toDecimals;
      let toChainType = direction ? tokenPair.toChainType : tokenPair.fromChainType;
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0);
      let networkFee = tool.parseFee(convert.fee, convert.value, "NIGHT", { formatWithDecimals: false, feeType: "networkFee" });
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        crossScAddr: chainInfo.crossScAddr,
        userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).text,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessMintFromMidnight",
        networkFee,
        fromAddr: convert.fromAddr
      };
      console.debug("MintFromMidnight params: %O", params);
      let steps = [
        { name: "userFastMint", stepIndex: 1, params }
      ]
      return steps;
    } catch (err) {
      console.error("MintFromMidnight error: %O", err);
      throw err;
    }
  }
}

export default MintFromMidnight;
