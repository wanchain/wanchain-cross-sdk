'use strict';

const axios = require("axios");

// LTC->WAN LTC->ETH
module.exports = class LtcProcessCoinUserFastMint {
    constructor(frameworkService) {
        this.m_frameworkService = frameworkService;
    }

    async confirmOnetimeAddress(oneTimeAddress) {
        try {
            this.m_configService = this.m_frameworkService.getService("ConfigService");
            this.m_apiServerConfig = await this.m_configService.getGlobalConfig("apiServer");

            let url = this.m_apiServerConfig.url + "/api/ltc/confirmAddrInfo";
            url = url + "/" + oneTimeAddress;
            let ret = await axios.post(url);
            if (ret.data.success === true) {
                console.log("confirmOnetimeAddress success");
            }
            else {
                console.log("confirmOnetimeAddress fail");
            }
        } catch (error) {
            console.log('confirmOnetimeAddress error', error);
        }
    }
};

