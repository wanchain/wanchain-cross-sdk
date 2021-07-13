'use strict';


const XrpProcessCoinUserFastMint = require("./xrpProcessCoinUserFastMint");

class XrpService {
    constructor() {
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_configService = frameworkService.getService("ConfigService");
        this.m_WebStores = frameworkService.getService("WebStores");
        this.m_xrpInfo = await this.m_configService.getGlobalConfig("XRP");
        this.m_apiServerConfig = await this.m_configService.getGlobalConfig("apiServer");
    }

    async confirmTagId(tagId) {
        let xrpProcessCoinUserFastMint = new XrpProcessCoinUserFastMint(this.m_frameworkService);
        return await xrpProcessCoinUserFastMint.confirmTagId(tagId);
    }

    async cancelTagId(tagId) {

    }

    async addTokenPair(tokenPairObj) {
    }
}

module.exports = XrpService;



