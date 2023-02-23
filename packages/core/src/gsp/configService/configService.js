'use strict';

const _ = require('lodash');

const config = {
  "mainnet": require("../../config/config_mainnet.json"),
  "testnet": require("../../config/config_testnet.json")
}

const abis = {
  "crossSc": require("../../config/abi/crossDelegate.json"),
  "erc20": require("../../config/abi/erc20.json"),
  "erc721": require("../../config/abi/erc721.json")
}

module.exports = class ConfigService {
    constructor() {
        this.extensions = new Map();
    }

    async init(network, extensions) {
        this.network = network;
        this.curConfig = config[network];
        // console.debug(this.curConfig);
        this._initExtensions(extensions);
    }

    getNetwork() {
        return this.network;
    }

    getAbi(contractName) {
        return abis[contractName];
    }

    getExtension(chainType) {
      return this.extensions.get(chainType);
    }

    async getConfig(serviceName, propertyPath) {
        let fullPropertyPath = serviceName;
        if (propertyPath && propertyPath !== '.') fullPropertyPath = fullPropertyPath + '.' + propertyPath;
        let ret = _.get(this.curConfig, fullPropertyPath);
        return ret;
    }

    async getGlobalConfig(name) {
        return _.get(this.curConfig, name);
    }

    _initExtensions(extensions) {
      if (!Array.isArray(extensions)) {
        extensions = [extensions];
      }
      extensions.forEach((ext, i) => {
        if (ext.getChains && ext.getSymbols) {
          let names = ext.getNames();
          let symbols = ext.getSymbols();
          if (names && symbols && (names.length === symbols.length)) {
            symbols.forEach((symbol, i) => {
              this.extensions.set(symbol, ext);
              console.debug("register %s(%s) extension", names[i], symbol);
            })
            return;
          }
        }
        throw new Error("Extension " + i + " is invalid");
      });
    }
}
