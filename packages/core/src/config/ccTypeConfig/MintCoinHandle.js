import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";

class MintCoinHandle {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    let decimals = (convert.convertType === "MINT") ? tokenPair.fromDecimals : tokenPair.toDecimals;
    let fromChainType = (convert.convertType === "MINT") ? tokenPair.fromChainType : tokenPair.toChainType;
    let toChainType = (convert.convertType === "MINT") ? tokenPair.toChainType : tokenPair.fromChainType;
    let fromScInfo = (convert.convertType === "MINT") ? tokenPair.fromScInfo : tokenPair.toScInfo;
    let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals));
    let feeUnit = fromScInfo.symbol || fromScInfo.chainType;
    let fee = tool.parseFee(convert.fee, convert.value, feeUnit, { formatWithDecimals: false });
    let networkFee = tool.parseFee(convert.fee, convert.value, feeUnit, { formatWithDecimals: false, feeType: "networkFee" });
    let params = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: fromChainType,
      crossScAddr: fromScInfo.crossScAddr,
      storemanGroupId: convert.storemanGroupId,
      tokenPairID: convert.tokenPairId,
      value,
      userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).evm,
      toAddr: convert.toAddr, // only for readability
      taskType: "ProcessCoinUserFastMint",
      fee,
      networkFee
    };
    console.debug("MintCoinHandle params: %O", params);
    params.chainId = await convert.wallet.getChainId();
    let steps = [
      { name: "userFastMint", stepIndex: 1, params }
    ];
    return steps;
  }
}

export default MintCoinHandle;
