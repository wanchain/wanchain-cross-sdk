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

let libInitState = 0;

async function initBitcoinLib() {
  if (libInitState === 0) {
    libInitState = 1;
    try {
      let ecc = await import('tiny-secp256k1');
      bitcoin.initEccLib(ecc);
      libInitState = 2;
      console.debug("bitcoinjs-lib ready");
    } catch (err) {
      console.error("bitcoinjs-lib init error: %O", err);
      libInitState = 0;
    }
  }
}

setTimeout(async() => {
  await initBitcoinLib();
}, 0);

module.exports = class ProcessMintBtcFromBitcoin {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
  }

  async process(stepData, wallet) {
    let WebStores = this.frameworkService.getService("WebStores");
    let params = stepData.params;
    let processorName = names[params.fromChainType];
    try {
      let ota = await this.generateOnetimeAddress(stepData, params.fromChainType, params.toChainType, params.userAccount, params.storemanGroupId, params.gpkInfo);
      // console.log("task %s %s finishStep %s ota: %s", params.ccTaskId, processorName, stepData.stepIndex, ota.address);
      if (ota.address) {
        WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", {address: ota.address, randomId: ota.randomId});
      } else {
        WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Failed to generate ota address");
      }
    } catch (err) {
      console.error("%s err: %O", processorName, err);
      WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Failed to generate ota address");
    }
  }

  async generateOnetimeAddress(stepData, fromChainType, toChainType, chainAddr, storemanGroupId, gpkInfo) {
    let params = stepData.params;
    try {
      let storemanService = this.frameworkService.getService("StoremanService");
      let configService = this.frameworkService.getService("ConfigService");
      let apiServerConfig = configService.getGlobalConfig("apiServer");
      let chainInfoService = this.frameworkService.getService("ChainInfoService");
      let chainInfo = chainInfoService.getChainInfoByType(fromChainType);
      let network = networks[fromChainType][chainInfo.network];

      const randomId = '0x' + crypto.randomBytes(32).toString('hex');
      const hashValue = crypto.createHash('sha256').update(randomId + chainAddr).digest('hex');
      if (hashValue.startsWith('0x')) {
        hashValue = ret.slice(2);
      }

      let tmpGPK = gpkInfo.gpk;
      if (tmpGPK.startsWith('0x')) {
        tmpGPK = "04" + tmpGPK.slice(2);
      }

      let ota = null;
      if (gpkInfo.algo == 2) { // schnorr340
        if (libInitState === 0) {
          console.debug("fix bitcoinjs-lib");
          await initBitcoinLib();
        }
        if (libInitState !== 2) {
          throw new Error("bitcoinjs-lib unavailable");
        }
        ota = this.getP2TR(hashValue, tmpGPK, network);
        console.debug("generate %s p2tr ota %s", fromChainType, ota);
      } else {
        ota = this.getP2SH(hashValue, tmpGPK, network);
      }
      let url = apiServerConfig.url + "/api/" + fromChainType.toLowerCase() + "/addAddrInfo";
      // save ota and id to apiServer
      let data = {
        oneTimeAddr: ota,
        randomId,
        chainType: toChainType,
        chainAddr: chainAddr,
        smgPublicKey: gpkInfo.gpk,
        smgId: storemanGroupId,
        tokenPairId: params.tokenPairID,
        networkFee: params.fee,
        value: params.value.toFixed()
      };

      let ret = await axios.post(url, data);
      if (ret.data.success === true) {
        let serviceName = "Check" + fromChainType.charAt(0).toUpperCase() + fromChainType.substr(1).toLowerCase() + "TxService"
        let checkTxService = this.frameworkService.getService(serviceName);
        data.fromBlockNumber = await storemanService.getChainBlockNumber(toChainType);
        data.ccTaskId = params.ccTaskId;
        data.fromChain = fromChainType;
        await checkTxService.addOTAInfo(data);
        return {
          address: ota,
          randomId
        };
      } else {
        console.error("%s ProcessMintBtcFromBitcoin generateOnetimeAddress, url: %s, data: %O, ret: %O", names[fromChainType], url, data, ret);
        return {
          address: ""
        };
      }
    } catch (error) {
      console.error('%s generateOnetimeAddress error: %O', names[fromChainType], error);
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

  getP2TR(hashVal, publicKey, network) {
    const xOnlyMpcPk = Buffer.from(publicKey.slice(2, 66), 'hex');
    const redeemScript = bitcoin.script.fromASM(
      `
      ${hashVal}
      OP_DROP
      OP_DUP
      OP_HASH160
      ${bitcoin.crypto.hash160(xOnlyMpcPk).toString('hex')}
      OP_EQUALVERIFY
      OP_CHECKSIG
      `.trim().replace(/\s+/g, ' '),
    )
    const scriptTree = {
      output: redeemScript,
      version: 0xc0
    }
    const p2tr = bitcoin.payments.p2tr({
      internalPubkey: xOnlyMpcPk,
      scriptTree: scriptTree,
      redeem: scriptTree,
      network 
    })
    return p2tr.address;
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