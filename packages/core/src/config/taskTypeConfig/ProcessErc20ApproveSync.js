'use strict';

const ProcessBaseSync = require("./processBaseSync.js");

module.exports = class ProcessErc20ApproveSync extends ProcessBaseSync {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(stepData, wallet) {
    let params = stepData.params;
    let options = {chainType: params.chainType, from: params.fromAddr};
    let scData = await this.txGeneratorService.generatorErc20ApproveData(params.erc20Addr, params.spenderAddr, params.value, options);
    let txData = await this.txGeneratorService.generateTx(params.chainType, scData.gasLimit, params.erc20Addr, 0, scData.data, params.fromAddr);
    await this.sendTx(stepData, txData, wallet);
  }
};