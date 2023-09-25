'use strict';

module.exports = class ChainInfoService {
  constructor() {
    this.m_mapChainIdObj = new Map();   // chainId - > chainInfo
    this.m_mapChainNameObj = new Map();  // chainName - > chainInfo
    this.m_mapChainTypeObj = new Map();  // chainType - > chainInfo
  }

  async init(frameworkService) {
    this.m_frameworkService = frameworkService;
    let configService = frameworkService.getService("ConfigService");
    let chainsInfo = configService.getGlobalConfig("StoremanService");
    // console.log("chainInfoService chainsInfo:", chainsInfo);
    for (let idx = 0; idx < chainsInfo.length; ++idx) {
      let obj = chainsInfo[idx];
      obj._isEVM = true;
      this.m_mapChainIdObj.set(obj.chainId, obj);
      this.m_mapChainNameObj.set(obj.chainName, obj);
      this.m_mapChainTypeObj.set(obj.chainType, obj);
    }

    let noEthChainInfo = configService.getGlobalConfig("noEthChainInfo");
    for (let idx = 0; idx < noEthChainInfo.length; ++idx) {
      let obj = noEthChainInfo[idx];
      this.m_mapChainIdObj.set(obj.chainId, obj);
      this.m_mapChainNameObj.set(obj.chainName, obj);
      this.m_mapChainTypeObj.set(obj.chainType, obj);
    }
    // console.log("ChainInfoService this.m_mapChainIdObj:", this.m_mapChainIdObj);
    // console.log("ChainInfoService this.m_mapChainTypeObj:", this.m_mapChainTypeObj);
  }

  getChainInfoById(chainId) {
    let obj = this.m_mapChainIdObj.get(chainId);
    return obj;
  }

  getChainInfoByName(chainName) {
    let obj = this.m_mapChainNameObj.get(chainName);
    return obj;
  }

  getChainInfoByType(chainType) {
    let obj = this.m_mapChainTypeObj.get(chainType);
    return obj;
  }

  getCoinSymbol(chainType) {
    let chain = this.m_mapChainTypeObj.get(chainType);
    return chain.symbol || chainType;
  }
}

