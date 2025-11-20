import BigNumber from "bignumber.js";
import axios from "axios";
'use strict';
export default (class ProcessXrpMintFromRipple {
    constructor(frameworkService) {
        this.frameworkService = frameworkService;
        this.configService = frameworkService.getService("ConfigService");
        this.storemanService = this.frameworkService.getService("StoremanService");
        this.tokenPairService = frameworkService.getService("TokenPairService");
    }
    async process(stepData, wallet) {
        let WebStores = this.frameworkService.getService("WebStores");
        let params = stepData.params;
        try {
            let tagId = await this.getTagId(stepData, params.toChainType, params.userAccount, params.storemanGroupId, params.storemanGroupGpk);
            if (tagId) {
                WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", tagId);
            }
            else {
                WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Failed to generate ota address");
            }
        }
        catch (err) {
            console.error("ProcessXrpMintFromRipple process error: %O", err);
            WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Failed to generate ota address");
        }
    }
    async getTagId(stepData, chainType, chainAddr, storemanGroupId, storemanGroupPublicKey) {
        let params = stepData.params;
        try {
            let tokenPair = this.tokenPairService.getTokenPair(params.tokenPairID);
            let direction = (chainType === tokenPair.toChainType) ? "MINT" : "BURN";
            let taskType = this.tokenPairService.getTokenEventType(params.tokenPairID, direction);
            let apiServerConfig = this.configService.getGlobalConfig("apiServer");
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
                data.fromBlockNumber = await this.storemanService.getChainBlockNumber(chainType);
                data.taskType = taskType;
                let checkXrpTxService = this.frameworkService.getService("CheckXrpTxService");
                await checkXrpTxService.addTagInfo(data);
                // 添加apiServer端获取的networkFee
                return ret.data.tagId;
            }
            else {
                console.error("ProcessXrpMintFromRipple getTagId, url: %s data: %O, result: %O", url, data, ret);
                return 0;
            }
        }
        catch (err) {
            console.error("ProcessXrpMintFromRipple getTagId error: %O", err);
            return 0;
        }
    }
});
