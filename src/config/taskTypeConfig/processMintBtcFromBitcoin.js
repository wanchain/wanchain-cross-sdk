'use strict';

const crypto = require('crypto');
const bitcoin = require('bitcoinjs-lib');
const axios = require("axios");

const names = {
  BTC: "ProcessMintBtcFromBitcoin",
  LTC: "ProcessMintLtcFromLitecoin",
  DOGE: "ProcessMintDogeFromDogecoin"
};

const litecoinPrefix = '\\x19Litecoin Signed Message:\n';
const DogecoinPrefix = "\\x19Dogecoin Signed Message:\n";
const testnetBip32 = {
  public: 0x019DA462,
  private: 0x019D9CFE,
};

const networks = {
  BTC: bitcoin.networks,
  LTC: {
    mainnet: {
      messagePrefix: litecoinPrefix,
      bip32: {
        private: 0x488ADE4,
        public: 0x488B21E,
      },
      bech32: 'ltc',
      scriptHash: 0x32,
      pubKeyHash: 0x30,
      wif: 0xb0,
    },
    testnet: {
      messagePrefix: litecoinPrefix,
      bip32: testnetBip32,
      bech32: 'tltc',
      scriptHash: 0x3a,
      pubKeyHash: 0x6f,
      wif: 0xef,
    }
  },
  DOGE: {
    mainnet: {
      messagePrefix: DogecoinPrefix,
      bip32: {
        public: 0x02facafd,
        private: 0x02fac398,
      },
      pubKeyHash: 0x1e,
      scriptHash: 0x16,
      wif: 0x9e,
    },
    testnet: {
      messagePrefix: DogecoinPrefix,
      bip32: testnetBip32,
      pubKeyHash: 0x71,
      scriptHash: 0xc4,
      wif: 0xf1,
    }
  }
}

module.exports = class ProcessMintBtcFromBitcoin {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
  }

  async process(paramsJson, wallet) {
    let WebStores = this.m_frameworkService.getService("WebStores");
    let params = paramsJson.params;
    let processorName = names[params.fromChainType];
    try {
      let p2sh = await this.generateOnetimeAddress(paramsJson, params.fromChainType, params.toChainType, params.userAccount, params.storemanGroupId, params.storemanGroupGpk);
      // console.log("task %s %s finishStep %s ota: %s", params.ccTaskId, processorName, paramsJson.stepIndex, p2sh.address);
      if (p2sh.address === "") {
        WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", "Failed", "Failed to generate ota address");
      } else {
        // networkfee
        let eventService = this.m_frameworkService.getService("EventService");
        let obj = {
          "ccTaskId": params.ccTaskId,
          "apiServerNetworkFee": p2sh.apiServerNetworkFee
        };
        await eventService.emitEvent("NetworkFee", obj);
        WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", p2sh.address); // networkfee
      }
    } catch (err) {
      console.error("%s err: %O", processorName, err);
      WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", "Failed", "Failed to generate ota address");
    }
  }

  async generateOnetimeAddress(paramsJson, fromChainType, toChainType, chainAddr, storemanGroupId, storemanGroupPublicKey) {
    let params = paramsJson.params;
    try {
      let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
      let configService = this.m_frameworkService.getService("ConfigService");
      let apiServerConfig = await configService.getGlobalConfig("apiServer");

      let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
      let chainInfo = await chainInfoService.getChainInfoByType(fromChainType);
      let network = networks[fromChainType][chainInfo.NETWORK];

      const random = crypto.randomBytes(32).toString('hex');
      const id = '0x' + random;
      const hash = crypto.createHash('sha256');
      hash.update(id + chainAddr);
      let hashValue = hash.digest('hex');
      if (hashValue.startsWith('0x')) {
        hashValue = ret.slice(2);
      }

      let tmpGPK = storemanGroupPublicKey;
      if (tmpGPK.startsWith('0x')) {
        tmpGPK = "04" + tmpGPK.slice(2);
      }

      let p2sh = this.getP2SH(hashValue, tmpGPK, network);
      let url = apiServerConfig.url + "/api/" + fromChainType.toLowerCase() + "/addAddrInfo";
      // save p2sh 和id 到apiServer
      let data = {
        oneTimeAddr: p2sh,
        randomId: id,
        chainType: toChainType,
        chainAddr: chainAddr,
        smgPublicKey: storemanGroupPublicKey,
        smgId: storemanGroupId,
        tokenPairId: params.tokenPairID,
        networkFee: params.networkFee,
        value: params.value.toFixed()
      };

      let ret = await axios.post(url, data);
      if (ret.data.success === true) {
        let blockNumber = await iwanBCConnector.getBlockNumber(toChainType);
        let serviceName = "Check" + fromChainType.charAt(0).toUpperCase() + fromChainType.substr(1).toLowerCase() + "TxService"
        let checkTxService = this.m_frameworkService.getService(serviceName);
        data.fromBlockNumber = blockNumber;
        data.ccTaskId = params.ccTaskId;
        await checkTxService.addOTAInfo(data);
        return {
          address: p2sh,
          apiServerNetworkFee: ret.data.apiServerNetworkFee
        };
      } else {
        return {
          address: ""
        };
      }
    } catch (error) {
      console.log('%s generateOnetimeAddress error: %O', names[fromChainType], error);
      return {
        address: ""
      }
    }
  }

  getP2SH(hashVal, publicKey, networkInfo) {
    const p2sh = bitcoin.payments.p2sh({
      network: networkInfo,
      redeem: {
        output: this.getRedeemScript(hashVal, publicKey),
        network: networkInfo
      },
    });
    return p2sh.address;
  }

  getRedeemScript(hashVal, publicKey) {
    return bitcoin.script.fromASM(
      `
        ${hashVal}
        OP_DROP
        OP_DUP
        OP_HASH160
        ${bitcoin.crypto.hash160(Buffer.from(publicKey, 'hex')).toString('hex')}
        OP_EQUALVERIFY
        OP_CHECKSIG
        `.trim()
        .replace(/\s+/g, ' '),
    )
  }
};