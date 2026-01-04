
class ChainInfoService {
  constructor() {
    this.chainId2Info = new Map();
    this.chainName2Info = new Map();
    this.chainType2Info = new Map();
  }

  async init(frameworkService) {
    this.m_frameworkService = frameworkService;
    let configService = frameworkService.getService("ConfigService");
    let evmChains = configService.getGlobalConfig("StoremanService");
    for (let chain of evmChains) {
      chain._isEVM = true;
      this.chainId2Info.set(chain.chainId, chain);
      this.chainName2Info.set(chain.chainName, chain);
      this.chainType2Info.set(chain.chainType, chain);
    }
    let noEvmChains = configService.getGlobalConfig("noEthChainInfo");
    for (let chain of noEvmChains) {
      this.chainId2Info.set(chain.chainId, chain);
      this.chainName2Info.set(chain.chainName, chain);
      this.chainType2Info.set(chain.chainType, chain);
    }
  }

  getChainInfoById(chainId) {
    return this.chainId2Info.get(chainId);
  }

  getChainInfoByName(chainName) {
    return this.chainName2Info.get(chainName);
  }

  getChainInfoByType(chainType) {
    return this.chainType2Info.get(chainType);
  }

  getCoinSymbol(chainType) {
    let chain = this.chainType2Info.get(chainType);
    return chain.symbol || chainType;
  }
}

export default ChainInfoService;
