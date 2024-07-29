'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");
const base32 = require('hi-base32');

module.exports = class ProcessMintFromAlgorand {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService  = frameworkService.getService("ConfigService");
    let extension = this.configService.getExtension("ALGO");
    this.tool = extension.tool;
    this.storemanService = frameworkService.getService("StoremanService");
    this.chainInfoService = frameworkService.getService("ChainInfoService");
    this.webStoresService = frameworkService.getService("WebStores");
  }

  async process(stepData, wallet) {
    let params = stepData.params;
    try {
      let algosdk = this.tool.getAlgoSdk();
      let chainInfo = this.chainInfoService.getChainInfoByType("ALGO");
      let client = new algosdk.Algodv2(chainInfo.rpc.key, chainInfo.rpc.url);
      let suggestedParams = await client.getTransactionParams().do();
      let crossScAddr = algosdk.getApplicationAddress(BigInt(params.crossScId));
      console.debug("ProcessMintFromAlgorand crossScAddr: %s", crossScAddr);

      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
      let tokenAccount = (tokenPair.fromChainType === "ALGO")? tokenPair.fromAccount : tokenPair.toAccount;
      let isCoin = (tokenAccount === "0x0000000000000000000000000000000000000000");
      let coinValue = isCoin? params.value : params.networkFee;
      let crossValue = isCoin? new BigNumber(params.value).minus(params.networkFee).toFixed(0) : params.value;

      let payTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: params.fromAddr,
        suggestedParams,
        to: crossScAddr,
        amount: BigInt(coinValue),
      });

      let assetTx = null;
      if (!isCoin) {
        assetTx = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          from: params.fromAddr,
          suggestedParams,
          to: crossScAddr,
          assetIndex: Number(tokenAccount),
          amount: BigInt(crossValue),
        });
      }

      let abi = this.configService.getAbi("algorandBridge");
      let contract = new algosdk.ABIContract(abi);
      let method = contract.getMethodByName('userLock');
      let tokenPairID = BigInt(params.tokenPairID);
      let args = [ // (byte[32],uint64,string,uint64)
        Buffer.from(tool.hexStrip0x(params.storemanGroupId), 'hex'),
        tokenPairID,
        params.userAccount,
        BigInt(crossValue)
      ];
      let appArgs = [method.getSelector()];
      method.args.map((arg, i) => appArgs.push(arg.type.encode(args[i])));
    
      let toChainInfo = this.chainInfoService.getChainInfoByType(params.toChainType);
      const options = {
        from: params.fromAddr,
        suggestedParams,
        appIndex: params.crossScId,
        appArgs,
        accounts: [chainInfo.feeHolder],
        boxes: [
          {appIndex: params.crossScId, name: this.tool.getPrefixKey("mapTokenPairContractFee", tokenPairID)},
          {appIndex: params.crossScId, name: this.tool.getPrefixKey("mapTokenPairInfo", tokenPairID)},
          {appIndex: params.crossScId, name: this.tool.getPrefixKey("mapContractFee", BigInt(chainInfo.chainId) * BigInt(2 ** 32) + BigInt(toChainInfo.chainId))},
          {appIndex: params.crossScId, name: this.tool.getPrefixKey("mapContractFee", BigInt(chainInfo.chainId) * BigInt(2 ** 32))},
        ]
      }
      let appTx = algosdk.makeApplicationCallTxnFromObject(options);
      let txs = algosdk.assignGroupID([payTx, assetTx, appTx].filter(v => v));
      let txGroups = txs.map(v => {return {txn: v, signers: [params.fromAddr]}});
      let signedTxs = await wallet.signTransaction([txGroups]);
      let txId = algosdk.decodeSignedTransaction(signedTxs[signedTxs.length - 1]).txn.txID();
      await client.sendRawTransaction(signedTxs).do();
      this.webStoresService["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txId, ""); // only update txHash, no result

      let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType);
      let direction = (tokenPair.fromChainType === "ALGO")? "MINT" : "BURN";
      let checker = {
        chain: "ALGO",
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        txHash: txId,
        txCheckInfo: null, // only check transaction receipt, no event
        convertCheckInfo: {
          ccTaskId: params.ccTaskId,
          stepIndex: stepData.stepIndex,
          uniqueID: '0x' + Buffer.from(base32.decode.asBytes(txId)).toString('hex'),
          fromBlockNumber: blockNumber,
          chain: params.toChainType,
          taskType: tokenPairService.getTokenEventType(params.tokenPairID, direction),
          fromChain: "ALGO",
          fromAddr: params.fromAddr,
          chainHash: txId,
          toAddr: params.toAddr
        }
      };
      let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    } catch (err) {
      if (err.message && (typeof(err.message) === "string") && err.message.includes("the user has rejected the transaction request")) {
        this.webStoresService["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessMintFromAlgorand error: %O", err);
        this.webStoresService["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }
};