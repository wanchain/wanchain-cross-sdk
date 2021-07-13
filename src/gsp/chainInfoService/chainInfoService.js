'use strict';

module.exports = class ChainInfoService {
    constructor() {
        this.m_wanInfo = {};
        this.m_ethInfo = {};
        this.m_mapChainIdObj = new Map();// chainId - > chainInfo
        this.m_mapChainTypeObj = new Map();// // chainName - > chainInfo
        this.m_mapMaskChainIdObj = new Map();// // MaskChainId - > chainInfo
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        let configService = frameworkService.getService("ConfigService");

        let wanInfo = await configService.getConfig("StoremanService", "WanInfo");
        this.m_mapChainIdObj.set(wanInfo.chainId, wanInfo);
        this.m_mapChainTypeObj.set(wanInfo.chainType, wanInfo);
        this.m_mapMaskChainIdObj.set(wanInfo.MaskChainId, wanInfo);        

        let ethInfo = await configService.getConfig("StoremanService", "EthInfo");
        this.m_mapChainIdObj.set(ethInfo.chainId, ethInfo);
        this.m_mapChainTypeObj.set(ethInfo.chainType, ethInfo);
        this.m_mapMaskChainIdObj.set(ethInfo.MaskChainId, ethInfo);

        let bscInfo = await configService.getConfig("StoremanService", "BscInfo");
        this.m_mapChainIdObj.set(bscInfo.chainId, bscInfo);
        this.m_mapChainTypeObj.set(bscInfo.chainType, bscInfo);
        this.m_mapMaskChainIdObj.set(bscInfo.MaskChainId, bscInfo);

        let noEthChainInfo = await configService.getGlobalConfig("noEthChainInfo");
        for (let idx = 0; idx < noEthChainInfo.length; ++idx) {
            let obj = noEthChainInfo[idx];
            this.m_mapChainIdObj.set(obj.chainId, obj);
            this.m_mapChainTypeObj.set(obj.chainType, obj);
        }
        // console.log("ChainInfoService this.m_mapChainIdObj:", this.m_mapChainIdObj);
        // console.log("ChainInfoService this.m_mapChainTypeObj:", this.m_mapChainTypeObj);
        // console.log("ChainInfoService this.m_mapMaskChainIdObj:", this.m_mapMaskChainIdObj);
    }

    getChainInfoById(chainId) {
        let obj = this.m_mapChainIdObj.get(chainId);
        return obj;
    }

    getChainInfoByName(chainName) {
        let obj = this.m_mapChainTypeObj.get(chainName);
        return obj;
    }

    getChainInfoByMaskChainId(MaskchainId) {
        let obj = this.m_mapMaskChainIdObj.get(MaskchainId);
        return obj;
    }
}

