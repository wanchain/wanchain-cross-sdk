import BigNumber from "bignumber.js";
import Web3 from "web3";
import ProcessBaseSync from "./processBaseSync.js";
;
const web3 = new Web3();
export default (class ProcessClaimRewardTask extends ProcessBaseSync {
  constructor(frameworkService) {
    super(frameworkService);
    this.configService = frameworkService.getService("ConfigService");
    this.iwan = frameworkService.getService("iWanConnectorService");
  }
  async process(stepData, wallet) {
    let params = stepData.params;
    console.log("ProcessClaimRewardTask params: %O", params);
    let scData = await this.genTxData(params);
    let txData = await this.txGeneratorService.generateTx(params.chainType, scData.gasLimit, params.scAddr, scData.coin, scData.data, params.fromAddr);
    await this.sendTx(stepData, txData, wallet);
  }
  async genTxData(params) {
    let abi = this.configService.getAbi("rewardTask");
    let sc = new web3.eth.Contract(abi, params.scAddr);
    let data = sc.methods.claimTask(params.taskId, params.collateralId).encodeABI();
    let coin = (params.token === "0x0000000000000000000000000000000000000000") ? "0x" + new BigNumber(params.value).toString(16) : "0x00";
    let gasLimit = await this.iwan.estimateGas(params.chainType, { from: params.fromAddr, to: params.scAddr, value: coin, data });
    console.debug("ProcessClaimRewardTask gasLimit: %s", gasLimit);
    return { data, gasLimit, coin };
  }
});
