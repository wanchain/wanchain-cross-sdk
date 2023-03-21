'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");
const configAbi = require("../abi/crossConfig.json");

module.exports = class ProcessPhaMintFromPhala {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
  }

  async process(stepData, wallet) {
    // console.debug("ProcessPhaMintFromPhala stepData:", stepData);
    let webStores = this.m_frameworkService.getService("WebStores");
    let configService = this.m_frameworkService.getService("ConfigService");
    let configScAddr = configService.getGlobalConfig("crossConfigAddress");
    let iwan = this.m_frameworkService.getService("iWanConnectorService");
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
      let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
      let chainInfo = chainInfoService.getChainInfoByType("PHA");
      let minReserved = new BigNumber(chainInfo.minReserved || 0);
      minReserved = minReserved.multipliedBy(Math.pow(10, chainInfo.chainDecimals));
      let totalNeed = new BigNumber(params.value).plus(gasFee).plus(minReserved);
      if (new BigNumber(balance).lte(totalNeed)) {
        console.error("ProcessPhaMintFromPhala insufficient balance, fee: %s", gasFee.div(Math.pow(10, chainInfo.chainDecimals)).toFixed());
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Insufficient balance");
        return;
      }

      // 5 签名并发送
      let txHash;
      try {
        txHash = await wallet.sendTransaction(txs, params.fromAddr);
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      } catch (err) {
        if (err.message === "Cancelled") {
          webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
        } else {
          console.error("polkadot sendTransaction error: %O", err);
          webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
        }
        return;
      }

      // 查询目的链当前blockNumber
      let blockNumber = await iwan.getBlockNumber(params.toChainType);
      let tokenPairService = this.m_frameworkService.getService("TokenPairService");
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

      let checkPhaTxService = this.m_frameworkService.getService("CheckPhaTxService");
      await checkPhaTxService.addTask(checkPara);
    } catch (err) {
      console.error("ProcessPhaMintFromPhala error: %O", err);
      webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
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