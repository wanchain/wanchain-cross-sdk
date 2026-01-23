import * as _ from "lodash";
import configMainnet from "../../config/config_mainnet.json" with { type: "json" };
import configTestnet from "../../config/config_testnet.json" with { type: "json" };
import crossDelegate from "../../config/abi/crossDelegate.json" with { type: "json" };
import erc20 from "../../config/abi/erc20.json" with { type: "json" };
import erc721 from "../../config/abi/erc721.json" with { type: "json" };
import circleBridgeProxy from "../../config/abi/circleBridge/circleBridgeProxy.json" with { type: "json" };
import tokenMessenger from "../../config/abi/circleBridge/TokenMessenger.json" with { type: "json" };
import messageTransmitter from "../../config/abi/circleBridge/MessageTransmitter.json" with { type: "json" };
import cctpV2Proxy from "../../config/abi/circleBridge/cctpV2Proxy.json" with { type: "json" };
import tokenMessengerV2 from "../../config/abi/circleBridge/TokenMessengerV2.json" with { type: "json" };
import messageTransmitterV2 from "../../config/abi/circleBridge/MessageTransmitterV2.json" with { type: "json" };
import feeSubsidy from "../../config/abi/feeSubsidy.json" with { type: "json" };
import bridge from "../../config/abi/algorand/bridge.json" with { type: "json" };
import rewardTask from "../../config/abi/rewardTask.json" with { type: "json" };
import crossConfig from "../../config/abi/crossConfig.json" with { type: "json" };

const config = {
  "mainnet": configMainnet,
  "testnet": configTestnet
};

const abis = {
  "crossSc": crossDelegate,
  "erc20": erc20,
  "erc721": erc721,
  "cctpProxy": circleBridgeProxy,
  "cctpTokenMessenger": tokenMessenger,
  "cctpMessageTransmitter": messageTransmitter,
  "cctpV2Proxy": cctpV2Proxy,
  "cctpV2TokenMessenger": tokenMessengerV2,
  "cctpV2MessageTransmitter": messageTransmitterV2,
  "subsidyCrossSc": feeSubsidy,
  "algorandBridge": bridge,
  "rewardTask": rewardTask,
  "crossConfig": crossConfig,
};

class ConfigService {
  constructor() {
    this.extensions = new Map();
  }

  async init(network, options) {
    this.network = network;
    this.curConfig = config[network];
    // console.debug(this.curConfig);
    await this._initExtensions(options.extensions || []);
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

  getConfig(serviceName, propertyPath) {
    let fullPropertyPath = serviceName;
    if (propertyPath && propertyPath !== '.') {
      fullPropertyPath = fullPropertyPath + '.' + propertyPath;
    }
    let ret = _.get(this.curConfig, fullPropertyPath);
    return ret;
  }

  getGlobalConfig(name) {
    return _.get(this.curConfig, name);
  }

  async _initExtensions(extensions) {
    if (!Array.isArray(extensions)) {
      extensions = [extensions];
    }
    await Promise.all(extensions.map(async (ext, i) => {
      if (ext.getChains && ext.getSymbols) { // not necessary for extensions which only define wallets
        let chains = ext.getChains();
        let symbols = ext.getSymbols();
        if (chains && symbols && (chains.length === symbols.length)) {
          if (ext.init) {
            await ext.init(this.network);
          }
          symbols.forEach((symbol, i) => {
            this.extensions.set(symbol, ext);
            console.debug("register %s(%s) extension", chains[i], symbol);
          });
          return;
        }
      }
    }));
  }
}

export default ConfigService;
