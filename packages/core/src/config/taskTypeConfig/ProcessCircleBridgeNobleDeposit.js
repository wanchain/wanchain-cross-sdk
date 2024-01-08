'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

module.exports = class ProcessCircleBridgeNobleDeposit {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.storemanService = frameworkService.getService("StoremanService");
  }

  async process(stepData, wallet) {
    let webStores = this.frameworkService.getService("WebStores");
    let params = stepData.params;
    try {
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
      let toChainInfo = (tokenPair.fromChainType === "NOBLE")? tokenPair.toScInfo : tokenPair.fromScInfo;
      let crossValue = new BigNumber(params.value).minus(params.networkFee).toFixed(0);
      let recipient = params.userAccount.replace(/^0x/, '').padStart(64, '0'); // left padded with 0's to 32 bytes
      let cctpMsg = {
        typeUrl: "/circle.cctp.v1.MsgDepositForBurn",
        value: {
          from: params.fromAddr,
          amount: crossValue,
          destinationDomain: toChainInfo.CircleBridge.domain,
          mintRecipient: new Uint8Array(Buffer.from(recipient, "hex")),
          burnToken: "uusdc"
        }
      };
      let fromChainInfo = (tokenPair.fromChainType === "NOBLE")? tokenPair.fromScInfo : tokenPair.toScInfo;
      let feeMsg = {
        typeUrl: "/cosmos.bank.v1beta1.MsgSend",
        value: {
          fromAddress: params.fromAddr,
          toAddress: fromChainInfo.feeHolder,
          amount: [
            {
              denom: "uusdc",
              amount: params.networkFee,
            }
          ],
        }
      }
      console.debug({cctpMsg, feeMsg});
      let txHash = "7197E807968543FBB5D0652FD644C9EE23655C78F325CD7E7A51D98BD2EC469C"; // await wallet.sendTransaction([cctpMsg, feeMsg], {timeoutHeight: 100});
      webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result

      let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType);
      let checker = {
        chain: "NOBLE",
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        txHash,
        txCheckInfo: null, // only check transaction receipt, no event
        convertCheckInfo: {
          ccTaskId: params.ccTaskId,
          txHash,
          uniqueID: '0x' + txHash.toLowerCase(),
          chain: params.toChainType,
          fromBlockNumber: blockNumber,
          taskType: "circleMINT",
          depositChain: fromChainInfo.chainType,
          depositDomain: fromChainInfo.CircleBridge.domain,
          depositNonce: undefined, // deposit nonce is really uniqueID
          depositAmount: 0
        }
      };
      let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    } catch (err) {
      if (err.message === "Request rejected") {
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessCircleBridgeNobleDeposit error: %O", err);
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }
};