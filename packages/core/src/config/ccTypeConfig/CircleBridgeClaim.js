'use strict';

module.exports = class CircleBridgeClaim {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.uiStrService = frameworkService.getService("UIStrService");
  }

  async process(tokenPair, convert) {
    let chainInfo = (convert.ccTaskType === "MINT")? tokenPair.toScInfo : tokenPair.fromScInfo;
    let params = {
      ccTaskId: convert.ccTaskId,
      scChainType: chainInfo.chainType,
      claimScAddr: chainInfo.CircleBridge.claimScAddr,
      msg: convert.msg,
      attestation: convert.attestation,
      taskType: "ProcessCircleBridgeClaim",
      chainId: chainInfo.MaskChainId
    };
    console.debug("CircleBridgeClaim buildClaim params: %O", params);
    let burnTitle = this.uiStrService.getStrByName("MintTitle");
    let burnDesc = this.uiStrService.getStrByName("MintDesc");
    let step = {name: "receiveMessage", stepIndex: 0, title: burnTitle, desc: burnDesc, params};
    return step;
  }
}