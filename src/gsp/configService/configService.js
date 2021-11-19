'use strict';

const _ = require('lodash');
const ConfigServiceInterface = require("./configServiceInterface");

const config = {
  "mainnet": require("../../config/config_mainnet.json"),
  "testnet": require("../../config/config_testnet.json")
}

const abis = {
  "crossSc": require("../../config/abi/crossDelegate.json"),
  "erc20": require("../../config/abi/erc20.json"),
  "erc721": require("../../config/abi/erc721.json")
}

module.exports = class ConfigService extends ConfigServiceInterface {
    constructor() {
        super();
    }

    async init(network) {
        this.network = network;
        this.m_confgJson = config[network];
        this.m_confgJson.StoremanService.forEach(chainInfo => {
            chainInfo.crossScAbiJson = "crossSc";
            chainInfo.erc20AbiJson = "erc20"; 
        })
        // console.log(this.m_confgJson);
    }

    getNetwork() {
        return this.network;
    }

    getAbi(contractName) {
        return abis[contractName];
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
