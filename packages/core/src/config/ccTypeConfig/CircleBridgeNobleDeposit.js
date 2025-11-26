import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";

class CircleBridgeNobleDeposit {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    try {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, tokenPair.toDecimals)).toFixed(0);
      let networkFee = tool.parseFee(convert.fee, convert.value, "USDC", { formatWithDecimals: false, feeType: "networkFee" });
      let chainInfo = (convert.convertType === "MINT") ? tokenPair.fromScInfo : tokenPair.toScInfo;
      let toChainType = (convert.convertType === "MINT") ? tokenPair.toChainType : tokenPair.fromChainType;
      let innerToAddr = convert.toAddr;
      if (toChainType === "SOL") {
        let sol = this.configService.getExtension(toChainType);
        let toAccount = tool.ascii2letter((convert.convertType === "MINT") ? tokenPair.toAccount : tokenPair.fromAccount);
        innerToAddr = sol.tool.getAssociatedTokenAddressSync(sol.tool.getPublicKey(toAccount), sol.tool.getPublicKey(convert.toAddr)).toString();
        console.log({ innerToAddr });
      }
      let toAddressInfo = tool.getStandardAddressInfo(toChainType, innerToAddr, this.configService.getExtension(toChainType));
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        feeHolder: chainInfo.feeHolder,
        userAccount: toAddressInfo.cctp || toAddressInfo.evm,
        toAddr: convert.toAddr, // for readability
        innerToAddr, // for cctp to solana
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessCircleBridgeNobleDeposit",
        networkFee,
        fromAddr: convert.fromAddr
      };
      console.debug("CircleBridgeNobleDeposit params: %O", params);
      let steps = [
        { name: "userFastBurn", stepIndex: 1, params }
      ];
      return steps;
    } catch (err) {
      console.error("CircleBridgeNobleDeposit error: %O", err);
      throw err;
    }
  }
}

export default CircleBridgeNobleDeposit;
