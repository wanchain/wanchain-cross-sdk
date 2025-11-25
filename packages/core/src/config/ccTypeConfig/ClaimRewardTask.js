import BigNumber from "bignumber.js";

export default (class ClaimRewardTask {
  constructor(frameworkService) {
    let configService = frameworkService.getService("ConfigService");
    this.crossTaskCfg = configService.getGlobalConfig("crossTask");
    this.iwan = frameworkService.getService("iWanConnectorService");
  }

  async process(tokenPair, convert) {
    let steps = [];
    let scAddr = this.crossTaskCfg.scAddr;
    // approve token
    if (convert.token !== "0x0000000000000000000000000000000000000000") {
      let approveParams = {
        chainType: "WAN",
        fromAddr: convert.fromAddr,
        erc20Addr: convert.token,
        value: "115792089237316195423570985008687907853269984665640564039457584007913129639935", // max
        spenderAddr: scAddr,
        taskType: "ProcessErc20ApproveSync"
      };
      let allowance = await this.iwan.getErc20Allowance("WAN", convert.token, convert.fromAddr, scAddr);
      allowance = new BigNumber(allowance);
      console.debug("ClaimRewardTask token %s allowance %s(%s->%s)", convert.token, allowance.toFixed(), convert.fromAddr, scAddr);
      if (allowance.gt(0)) {
        if (allowance.lt(convert.amount)) {
          // approve 0
          let approve0Params = Object.assign({}, approveParams);
          approve0Params.value = 0;
          steps.push({ name: "erc20Approve0", stepIndex: steps.length + 1, params: approve0Params });
          // approve
          steps.push({ name: "erc20Approve", stepIndex: steps.length + 1, params: approveParams });
        }
      } else {
        steps.push({ name: "erc20Approve", stepIndex: steps.length + 1, params: approveParams });
      }
    }
    // claim tx
    let params = {
      chainType: "WAN",
      fromAddr: convert.fromAddr,
      scAddr,
      taskId: convert.taskId,
      token: convert.token,
      value: convert.amount,
      collateralId: convert.collateralId,
      taskType: "ProcessClaimRewardTask"
    };
    console.debug("ClaimRewardTask params: %O", params);
    steps.push({ name: "claimRewardTask", stepIndex: steps.length + 1, params });
    return steps;
  }
});
