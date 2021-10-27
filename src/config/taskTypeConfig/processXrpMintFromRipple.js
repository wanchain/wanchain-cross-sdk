'use strict';
let BigNumber = require("bignumber.js");

const axios = require("axios");


module.exports = class ProcessXrpMintFromRipple {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
  }

  async process(paramsJson, wallet) {
    let WebStores = this.m_frameworkService.getService("WebStores");
    let params = paramsJson.params;
    try {
      let tagInfo = await this.getTagId(paramsJson, params.toChainType, params.userAccount, params.storemanGroupId, params.storemanGroupGpk);
      //console.log("ProcessXrpMintFromRipple finishStep:", params.ccTaskId, paramsJson.stepIndex, tagInfo);
      if (tagInfo.tagId === 0) {
        WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", "Failed", "Failed to generate ota address");
        return;
      } else {
        // XRP apiServerNetworkFee includes service fee, and the fee is fixed, dot not emit event, otherwise it will cause an error
        // let eventService = this.m_frameworkService.getService("EventService");
        // let obj = {
        //   "ccTaskId": params.ccTaskId,
        //   "apiServerNetworkFee": tagInfo.apiServerNetworkFee
        // };
        // await eventService.emitEvent("NetworkFee", obj);
        WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", tagInfo.tagId);
      }
      return;
    } catch (err) {
      console.error("ProcessXrpMintFromRipple process error: %O", err);
      WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", "Failed", "Failed to generate ota address");
    }
  }

  async getTagId(paramsJson, chainType, chainAddr, storemanGroupId, storemanGroupPublicKey) {
    let params = paramsJson.params;
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
        networkFee: new BigNumber(params.fee).plus(params.networkFee).toFixed(),
        value: params.value
      };
      console.debug("ProcessXrpMintFromRipple data:", data);
      let ret = await axios.post(url, data);
      console.debug("ProcessXrpMintFromRipple url:", url);
      if (ret.data.success === true) {
        data.tagId = ret.data.tagId;
        data.ccTaskId = params.ccTaskId;
        let blockNumber = await iwanBCConnector.getBlockNumber(chainType);
        data.fromBlockNumber = blockNumber;
        let checkXrpTxService = this.m_frameworkService.getService("CheckXrpTxService");
        await checkXrpTxService.addTagInfo(data);
        // 添加apiServer端获取的networkFee
        return {
          tagId: ret.data.tagId,
          apiServerNetworkFee: ret.data.apiServerNetworkFee
        };
      }
      else {
        return {
          "tagId": 0
        };
      }
    }
    catch (err) {
      console.log("getTagId err:", err);
      return {
        "tagId": 0
      };
    }
  }
};