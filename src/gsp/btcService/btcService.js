'use strict';

const BtcProcessCoinUserFastMint = require("./btcProcessCoinUserFastMint");

class BtcService {
    constructor() {
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_frameworkService = frameworkService;
        this.m_configService = frameworkService.getService("ConfigService");
        this.m_WebStores = frameworkService.getService("WebStores");
        this.m_btcInfo = await this.m_configService.getGlobalConfig("BTC");
    }

    async confirmOnetimeAddress(oneTimeAddress) {
        let btcUserLock = new BtcProcessCoinUserFastMint(this.m_frameworkService);
        return await btcUserLock.confirmOnetimeAddress(oneTimeAddress);
    }

    async cancelOnetimeAddress(oneTimeAddress) {

    }

    async addTokenPair(obj_tokenPair) {

    }
}

module.exports = BtcService;



