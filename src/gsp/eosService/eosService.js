'use strict';


class EosService {
    constructor() {
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_frameworkService = frameworkService;
        this.m_configService = frameworkService.getService("ConfigService");
        this.m_WebStores = frameworkService.getService("WebStores");
        this.m_eosInfo = await this.m_configService.getGlobalConfig("EOS");
    }

    async addTokenPair(obj_tokenPair) {

    }
}

module.exports = EosService;



