'use strict';

const _ = require('lodash');
const ConfigServiceInterface = require("./configServiceInterface");
const crossScAbiJson = require("../../config/abi/abi.CrossDelegate.json");
const erc20AbiJson = require("../../config/abi/erc20.abi.json");

const config = {
  "mainnet": require("../../config/config_mainnet.json"),
  "testnet": require("../../config/config_testnet.json")
}

module.exports = class ConfigService extends ConfigServiceInterface {
    constructor() {
        super();
    }

    async init(network) {
        this.m_confgJson = config[network];
        this.m_confgJson.StoremanService.WanInfo.crossScAbiJson = crossScAbiJson;
        this.m_confgJson.StoremanService.WanInfo.erc20AbiJson = erc20AbiJson;        
        this.m_confgJson.StoremanService.EthInfo.crossScAbiJson = crossScAbiJson;
        this.m_confgJson.StoremanService.EthInfo.erc20AbiJson = erc20AbiJson;        
        this.m_confgJson.StoremanService.BscInfo.crossScAbiJson = crossScAbiJson;
        this.m_confgJson.StoremanService.BscInfo.erc20AbiJson = erc20AbiJson;
        // console.log(this.m_confgJson);
    }

    async getConfig(serviceName, propertyPath) {
        let fullPropertyPath = serviceName;
        if (propertyPath && propertyPath !== '.') fullPropertyPath = fullPropertyPath + '.' + propertyPath;
        let ret = _.get(this.m_confgJson, fullPropertyPath);
        return ret;
    }

    async getGlobalConfig(name) {
        return _.get(this.m_confgJson, name);
    }
}
