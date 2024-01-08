'use strict';

const tool = require("../../utils/tool.js");

/* metadata format:
  userLock:
  {
    type: 1,             // number
    tokenPairID: 1,      // number
    toAccount: 0x...,    // string
    smgID: 0x...         // string
  }
  smgRelease:
  {
    type: 2,             // number
    tokenPairID: 1,      // number
    uniqueId: 0x...      // string
  }
*/

const TX_TYPE = {
  userLock:   1,
  smgRelease: 2,
  smgDebt:    5,
  smgProxy:   6,
  smgPhaDebt: 7,
  userBurn:   8,
  smgMint:    9,
  invalid:   -1
};

module.exports = class ProcessMintFromCosmos {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService  = frameworkService.getService("ConfigService");
    this.extension = this.configService.getExtension("ATOM");
    this.storemanService = frameworkService.getService("StoremanService");
  }

  async process(stepData, wallet) {
    let webStores = this.frameworkService.getService("WebStores");
    let params = stepData.params;
    try {
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
      let isCoin = (tokenPair.fromAccount === "0x0000000000000000000000000000000000000000");
      if (!isCoin) {
        throw new Error("Not support token");
      }
      let smgAddr = this.extension.tool.gpk2Address(params.storemanGroupGpk, "Cosmos");
      console.log({smgAddr});

      let txs = [{
        typeUrl: "/cosmos.bank.v1beta1.MsgSend",
        value: {
          fromAddress: params.fromAddr,
          toAddress: smgAddr,
          amount: [
            {
              denom: "uatom",
              amount: params.value
            }
          ],
        },
      }];
      let memo = await this.buildUserLockData(params.tokenPairID, params.userAccount);
      // console.debug({txs, memo});
      let txHash = await wallet.sendTransaction(txs, {memo, timeoutHeight: 100});
      webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result

      let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType);
      let checker = {
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        fromBlockNumber: blockNumber,
        txHash,
        chain: params.toChainType,
        smgPublicKey: params.storemanGroupGpk,
        taskType: "MINT"
      };
      let checkAtomTxService = this.frameworkService.getService("CheckAtomTxService");
      await checkAtomTxService.addTask(checker);
    } catch (err) {
      if (err.message === "Request rejected") {
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessMintFromCosmos error: %O", err);
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }

  buildUserLockData(tokenPair, userAccount) {
    let data = {
      tokenPairID: Number(tokenPair),
      toAccount : userAccount,
      type: TX_TYPE.userLock
    };
    console.debug("ProcessMintFromCosmos buildUserLockData: %O", data);
    return JSON.stringify(data);
  }
};