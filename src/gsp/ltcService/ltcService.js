'use strict';

const LtcProcessCoinUserFastMint = require("./ltcProcessCoinUserFastMint");

class LtcService {
    constructor() {
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_frameworkService = frameworkService;
        this.m_configService = frameworkService.getService("ConfigService");
        this.m_WebStores = frameworkService.getService("WebStores");
        this.m_ltcInfo = await this.m_configService.getGlobalConfig("LTC");
    }

    async confirmOnetimeAddress(oneTimeAddress) {
        let ltcUserLock = new LtcProcessCoinUserFastMint(this.m_frameworkService);
        return await ltcUserLock.confirmOnetimeAddress(oneTimeAddress);
    }

    async cancelOnetimeAddress(oneTimeAddress) {

    }

    async addTokenPair(obj_tokenPair) {

    }
}

module.exports = LtcService;



