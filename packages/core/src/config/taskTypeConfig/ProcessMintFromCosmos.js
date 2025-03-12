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
    this.storemanService = frameworkService.getService("StoremanService");
  }

  async process(stepData, wallet) {
    let webStores = this.frameworkService.getService("WebStores");
    let params = stepData.params;
    try {
      let chainType = params.fromChainType;
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
      let direction = (tokenPair.fromChainType === chainType);
      let chainInfo = direction? tokenPair.fromScInfo : tokenPair.toScInfo;
      let coinDenom = "u" + (chainInfo.symbol || chainType).toLowerCase();
      let tokenAccount = direction? tokenPair.fromAccount : tokenPair.toAccount;
      let assetDenom = (tokenAccount === "0x0000000000000000000000000000000000000000")? coinDenom : tool.ascii2letter(tool.hexStrip0x(tokenAccount));
      let extension = this.configService.getExtension(chainType);
      let smgAddr = extension.tool.gpk2Address(params.storemanGroupGpk, chainType);
      console.log("%s smgAddr: %s", chainType, smgAddr);

      let txs = [{
        typeUrl: "/cosmos.bank.v1beta1.MsgSend",
        value: {
          fromAddress: params.fromAddr,
          toAddress: smgAddr,
          amount: [
            {
              denom: assetDenom,
              amount: params.value
            }
          ],
        },
      }];
      if ((params.networkFee !== "0") && params.feeHolder) {
        txs.push({
          typeUrl: "/cosmos.bank.v1beta1.MsgSend",
          value: {
            fromAddress: params.fromAddr,
            toAddress: params.feeHolder,
            amount: [
              {
                denom: coinDenom,
                amount: params.networkFee
              }
            ],
          },
        })
      }
      let memo = await this.buildUserLockData(chainType, params.tokenPairID, params.userAccount);
      // console.debug({txs, memo});
      let txHash = await wallet.sendTransaction(txs, {memo, timeoutHeight: 100});
      webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result

      let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType);
      let checker = {
        chain: chainType,
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        txHash,
        txCheckInfo: null, // only check transaction receipt, no event
        convertCheckInfo: {
          ccTaskId: params.ccTaskId,
          stepIndex: stepData.stepIndex,
          uniqueID: '0x' + txHash.toLowerCase(),
          fromBlockNumber: blockNumber,
          chain: params.toChainType,
          taskType: tokenPairService.getTokenEventType(params.tokenPairID, direction? "MINT" : "BURN")
        }
      };
      let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    } catch (err) {
      if (err.message === "Request rejected") {
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessMintFromCosmos error: %O", err);
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }

  buildUserLockData(fromChainType, tokenPair, userAccount) {
    let data = {
      tokenPairID: Number(tokenPair),
      toAccount : userAccount,
      type: TX_TYPE.userLock
    };
    console.debug("%s ProcessMint buildUserLockData: %O", fromChainType, data);
    return JSON.stringify(data);
  }
};