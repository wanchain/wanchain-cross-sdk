'use strict';

const BigNumber = require("bignumber.js");
const axios = require("axios");

module.exports = class ProcessXrpMintFromRipple {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
  }

  async process(stepData, wallet) {
    let WebStores = this.m_frameworkService.getService("WebStores");
    let params = stepData.params;
    try {
      let tagId = await this.getTagId(stepData, params.toChainType, params.userAccount, params.storemanGroupId, params.storemanGroupGpk);
      if (tagId) {
        WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", tagId);
      } else {
        WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Failed to generate ota address");
      }
    } catch (err) {
      console.error("ProcessXrpMintFromRipple process error: %O", err);
      WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Failed to generate ota address");
    }
  }

  async getTagId(stepData, chainType, chainAddr, storemanGroupId, storemanGroupPublicKey) {
    let params = stepData.params;
    try {
      let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
      let configService = this.m_frameworkService.getService("ConfigService");
      let apiServerConfig = await configService.getGlobalConfig("apiServer");

      let url = apiServerConfig.url + "/api/xrp/addTagInfo";
      // save p2sh 和id 到apiServer
      let data = {
        chainType: chainType,
        chainAddr: chainAddr,
        smgPublicKey: storemanGroupPublicKey,
        smgId: storemanGroupId,
        tokenPairId: params.tokenPairID,
        networkFee: new BigNumber(params.fee).toFixed(),
        value: params.value
      };
      let ret = await axios.post(url, data);
      if (ret.data.success === true) {
        data.tagId = ret.data.tagId;
        data.ccTaskId = params.ccTaskId;
        let blockNumber = await iwanBCConnector.getBlockNumber(chainType);
        data.fromBlockNumber = blockNumber;
        let checkXrpTxService = this.m_frameworkService.getService("CheckXrpTxService");
        await checkXrpTxService.addTagInfo(data);
        // 添加apiServer端获取的networkFee
        return ret.data.tagId;
      } else {
        console.error("ProcessXrpMintFromRipple getTagId, url: %s data: %O, result: %O", url, data, ret);
        return 0;
      }
    } catch (err) {
      console.error("ProcessXrpMintFromRipple getTagId error: %O", err);
      return 0;
    }
  }
};