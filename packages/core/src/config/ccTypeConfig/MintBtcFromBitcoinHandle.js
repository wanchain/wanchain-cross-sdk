import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";

export default (class MintBtcFromBitcoinHandle {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    let direction = (convert.convertType === "MINT");
    let fromChainType = direction ? tokenPair.fromChainType : tokenPair.toChainType;
    let toChainType = direction ? tokenPair.toChainType : tokenPair.fromChainType;
    let decimals = direction ? tokenPair.fromDecimals : tokenPair.toDecimals;
    try {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0);
      let fee = tool.parseFee(convert.fee, convert.value, tokenPair.ancestorSymbol);
      let taskType = convert.wallet ? "ProcessMintFromBitcoinWallet" : "ProcessMintBtcFromBitcoin";
      let taskName = convert.wallet ? "userFastMint" : "addOTA";
      let addrInfo = tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType));
      let userAccount = convert.wallet ? addrInfo.compact : addrInfo.text; // op_return use compact format to avoid size limit
      let params = {
        ccTaskId: convert.ccTaskId,
        fromChainType,
        toChainType,
        userAccount,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        gpkInfo: convert.gpkInfo,
        tokenPairID: convert.tokenPairId,
        value,
        taskType,
        fee,
        fromAddr: convert.fromAddr,
        decimals
      };
      console.debug("Mint %s params: %O", fromChainType, params);
      let steps = [
        { name: taskName, stepIndex: 1, params }
      ];
      return steps;
    } catch (err) {
      console.error("Mint %s error: %O", fromChainType, err);
      throw err;
    }
  }
});
