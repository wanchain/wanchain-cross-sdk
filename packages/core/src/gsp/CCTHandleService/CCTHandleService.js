"use strict";

let ccTypeConfig = require("../../config/ccTypeConfig/ccTypeConfig.js");

module.exports = class CCTHandleService {
    constructor() {
        this.m_mapCCTypeToHandler = new Map(); // ccType => Hanlder
    }

    async init(frameworkService) {
        try {
            this.m_frameworkService = frameworkService;
            for (let idx = 0; idx < ccTypeConfig.length; ++idx) {
                let obj = ccTypeConfig[idx];
                this.m_mapCCTypeToHandler.set(obj.name, obj.handle);
            }
        }
        catch (err) {
            console.log("CCTHandleService init err:", err);
        }
    }

    async getConvertInfo(convertJson) {
        try {
            let tokenPairService = this.m_frameworkService.getService("TokenPairService");
            let tokenPair = tokenPairService.getTokenPair(convertJson.tokenPairId);
            if (!tokenPair) {
                return {
                    stepNum: 0,
                    // errCode: globalConstant.ERR_OTHER_UNKNOWN_ERR
                };
            }
            let ccType = tokenPair.ccType[convertJson.convertType];
            let CCTypeHandle = this.m_mapCCTypeToHandler.get(ccType);
            let handler = new CCTypeHandle(this.m_frameworkService);
            let stepInfo = await handler.process(tokenPair, convertJson);
            return stepInfo;
        } catch (err) {
            console.log("getConvertInfo err:", err);
            return {
                stepNum: 0,
                // errCode: globalConstant.ERR_OTHER_UNKNOWN_ERR
            };
        }
    }

    async addCCTHandle(ccType, CCTHandle) {
        this.m_mapCCTypeToHandler.set(ccType, CCTHandle);
    }
};

