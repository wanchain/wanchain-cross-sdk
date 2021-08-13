'use strict';
let BigNumber = require("bignumber.js");

const crypto = require('crypto');
const bitcoin = require('bitcoinjs-lib');
const axios = require("axios");


module.exports = class ProcessMintBtcFromBitcoin {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
  }

  //let userFastMintParaJson = {
  //    "ccTaskId": convertJson.ccTaskId,
  //    "toChainType": tokenPairObj.toChainType,
  //    "userAccount": convertJson.toAddr,
  //    "storemanGroupId": convertJson.storemanGroupId,
  //    "storemanGroupGpk": convertJson.storemanGroupGpk,
  //    "tokenPairID": convertJson.tokenPairId,
  //    "value": value,
  //    "taskType": "ProcessMintBtcFromBitcoin",
  //    "fee": fees.mintFeeBN
  //};
  async process(paramsJson, wallet) {
    let WebStores = this.m_frameworkService.getService("WebStores");
    let params = paramsJson.params;
    try {
      let p2sh = await this.generateOnetimeAddress(paramsJson, params.toChainType, params.userAccount, params.storemanGroupId, params.storemanGroupGpk);
      //console.log("ProcessMintBtcFromBitcoin finishStep:", params.ccTaskId, paramsJson.stepIndex, p2sh.address);
      if (p2sh.address === "") {
        WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", "Failed");
        return;
      }
      else {
        // networkfee
        let eventService = this.m_frameworkService.getService("EventService");
        let obj = {
          "ccTaskId": params.ccTaskId,
          "apiServerNetworkFee": p2sh.apiServerNetworkFee
        };
        await eventService.emitEvent("networkFee", obj);
        WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", p2sh.address);// networkfee
      }
      return;
    }
    catch (err) {
      console.error("ProcessCoinUserFastMint process err:", err);
      WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, err.message, "Failed");
    }
  }

  // BTC->WAN/ETH
  async generateOnetimeAddress(paramsJson, chainType, chainAddr, storemanGroupId, storemanGroupPublicKey) {
    let params = paramsJson.params;
    try {
      let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
      let configService = this.m_frameworkService.getService("ConfigService");
      let apiServerConfig = await configService.getGlobalConfig("apiServer");

      let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
      let btcInfo = await chainInfoService.getChainInfoByType("BTC");
      let network = bitcoin.networks[btcInfo.NETWORK];

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
      let url = apiServerConfig.url + "/api/btc/addAddrInfo";
      // save p2sh 和id 到apiServer
      let data = {
        "oneTimeAddr": p2sh,
        "randomId": id,
        "chainType": chainType,
        "chainAddr": chainAddr,
        "smgPublicKey": storemanGroupPublicKey,
        "smgId": storemanGroupId,
        "tokenPairId": params.tokenPairID,
        "networkFee": params.networkFee,
        "value": params.value.toString()
      };

      let ret = await axios.post(url, data);
      if (ret.data.success === true) {
        let blockNumber = await iwanBCConnector.getBlockNumber(chainType);
        let checkBtcTxService = this.m_frameworkService.getService("CheckBtcTxService");
        data.fromBlockNumber = blockNumber;
        data.ccTaskId = params.ccTaskId;
        await checkBtcTxService.addOTAInfo(data);
        return {
          address: p2sh,
          apiServerNetworkFee: ret.data.apiServerNetworkFee
        };
      }
      else {
        return {
          address: ""
        };
      }
    } catch (error) {
      console.log('generateOnetimeAddress error', error);
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


// { "name": "userFastMint", "stepIndex": retAry.length + 1, "title": "userFastMint title", "desc": "userFastMint desc", "params": userFastMintParaJson }
//let userFastMintParaJson = {
//    "fromAddr": convertJson.fromAddr,
//    "scChainType": mintChainInfo.chaintype,
//    "crossScAddr": mintChainScInfo.crossScAddr,
//    "crossScAbi": mintChainScInfo.crossScAbiJson,
//    "storemanGroupId": convertJson.storemanGroupId,
//    "tokenPairID": convertJson.tokenPairId,
//    "value": convertJson.value,
//    "userAccount": convertJson.toAddr,
//    "processHandler": new ProcessUserFastMint(this.m_frameworkService)
//};

