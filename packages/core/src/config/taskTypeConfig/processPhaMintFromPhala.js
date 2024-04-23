'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");
const configAbi = require("../abi/crossConfig.json");

module.exports = class ProcessPhaMintFromPhala {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
  }

  async process(stepData, wallet) {
    // console.debug("ProcessPhaMintFromPhala stepData:", stepData);
    let webStores = this.frameworkService.getService("WebStores");
    let configService = this.frameworkService.getService("ConfigService");
    let configScAddr = configService.getGlobalConfig("crossConfigAddress");
    let iwan = this.frameworkService.getService("iWanConnectorService");
    let params = stepData.params;

    try {
      let api = await wallet.getApi();

      // 2 生成交易串
      let args = [params.toChainID, params.fromChainID, Number(params.tokenPairID)];
      let tpInfo = await iwan.callScFunc("WAN", configScAddr, "parseDestProjectChainInfo", args, configAbi);
      if ((!tpInfo.projectSrcChainID) || (!tpInfo.projectTokenPairID)) {
        throw new Error("Invalid token pair");
      }

      let txValue = '0x' + new BigNumber(params.value).toString(16);
      let txs = [
        api.tx.xTransfer.transfer(
          api.createType('XcmV1MultiAsset', {
            id: this.getPhalaAssetId(api, Number(tpInfo.projectTokenPairID)),
            fun: api.createType('XcmV1MultiassetFungibility', {
              Fungible: api.createType('Compact<U128>', txValue)
            })
          }),
          api.createType('XcmV1MultiLocation', {
            parents: 0,
            interior: api.createType('Junctions', {
              X3: [
                api.createType('XcmV1Junction', {
                    GeneralKey: '0x7762' // "wb": WanBridge
                }),
                api.createType('XcmV1Junction', {
                    GeneralIndex: Number(tpInfo.projectSrcChainID)
                }),
                api.createType('XcmV1Junction', {
                    GeneralKey: params.userAccount
                })
              ]
            })
          }),
          null, // No need to specify a certain weight if transfer will not through XCM
        )
      ];
      // console.debug("txs:", txs);

      // 3 check balance >= (value + gasFee + minReserved)
      let balance = await wallet.getBalance(params.fromAddr);
      let gasFee = await wallet.estimateFee(params.fromAddr, txs);
      let chainInfoService = this.frameworkService.getService("ChainInfoService");
      let chainInfo = chainInfoService.getChainInfoByType("PHA");
      let minReserved = new BigNumber(chainInfo.minReserved || 0);
      minReserved = minReserved.multipliedBy(Math.pow(10, chainInfo.chainDecimals));
      let totalNeed = new BigNumber(params.value).plus(gasFee).plus(minReserved);
      if (new BigNumber(balance).lte(totalNeed)) {
        console.error("ProcessPhaMintFromPhala insufficient balance, fee: %s", gasFee.div(Math.pow(10, chainInfo.chainDecimals)).toFixed());
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Insufficient balance");
        return;
      }

      // 5 签名并发送
      let txHash = await wallet.sendTransaction(txs, params.fromAddr);
      webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result

      // 查询目的链当前blockNumber
      let storemanService = this.frameworkService.getService("StoremanService");
      let blockNumber = await storemanService.getChainBlockNumber(params.toChainType);
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let taskType = tokenPairService.getTokenEventType(params.tokenPairID, "MINT");
      let checkPara = {
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        fromBlockNumber: blockNumber,
        txHash,
        chain: params.toChainType,
        smgPublicKey: params.storemanGroupGpk,
        taskType
      };

      let checkPhaTxService = this.frameworkService.getService("CheckPhaTxService");
      await checkPhaTxService.addTask(checkPara);
    } catch (err) {
      if (err.message === "Cancelled") {
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessPhaMintFromPhala error: %O", err);
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }

  getPhalaAssetId(api, id) {
    return api.createType('XcmV1MultiassetAssetId', {
        Concrete: api.createType('XcmV1MultiLocation', {
            parents: id,
            interior: api.createType('Junctions', 'Here')
        })
    })
  }
};