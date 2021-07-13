'use strict';

const axios = require("axios");

module.exports = class XrpProcessCoinUserFastMint {
    constructor(frameworkService) {
        this.m_frameworkService = frameworkService;
    }

    async confirmTagId(tagId) {
        try {
            this.m_configService = this.m_frameworkService.getService("ConfigService");
            this.m_apiServerConfig = await this.m_configService.getGlobalConfig("apiServer");

            let url = this.m_apiServerConfig.url + "/api/xrp/confirmTagInfo";
            url = url + "/" + tagId;
            let ret = await axios.post(url);
            if (ret.data.success === true) {
                console.log("confirmTagId true tagId:", tagId);
            }
            else {
                console.log("confirmTagId false tagId:", tagId);
            }
        }
        catch (err) {
            console.log("confirmTagId err:", err);
        }
    }
};

