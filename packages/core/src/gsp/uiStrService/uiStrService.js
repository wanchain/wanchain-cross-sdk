'use strict';

module.exports = class UIStrService {
    constructor() {
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_configService = frameworkService.getService("ConfigService");
        this.m_uiStrConfig = this.m_configService.getGlobalConfig("UIStrService");
    }

    getStrByName(strName) {
        return this.m_uiStrConfig[strName];
    }
};

