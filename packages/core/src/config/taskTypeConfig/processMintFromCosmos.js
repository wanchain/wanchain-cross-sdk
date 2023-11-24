'use strict';

const tool = require("../../utils/tool.js");
const Amino = require("@cosmjs/amino");
const Strgate = require("@cosmjs/stargate");
const Math = require("@cosmjs/math");
const ProtoSigning = require("@cosmjs/proto-signing");

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
  }

  async process(stepData, wallet) {
    let webStores = this.frameworkService.getService("WebStores");
    // console.debug("ProcessMintFromCosmos stepData:", stepData);
    let params = stepData.params;
    try {
      let memo = await this.buildUserLockData(params.tokenPairID, params.userAccount);
      console.debug("ProcessMintFromCosmos memo: %s", memo);

      let api = await wallet.getApi();

      // 1 根据storemanGroupPublicKey 生成storemanGroup的DOT地址
      let smgAddr = this.extension.tool.gpk2Address(params.storemanGroupGpk, "Cosmos");
      //console.log({smgAddr});

      // 2 生成交易串
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
      // console.debug("txs:", txs);

      let client = await wallet.getClient();
      let key = await wallet.getKey();
      let base64Pk = Amino.encodeSecp256k1Pubkey(key.pubKey);
      let { accountNumber, sequence } = await client.getSequence(params.fromAddr);
      let gasPrice = Strgate.GasPrice.fromString('0.025uatom');
      let anyMsgs = txs.map(tx => client.registry.encodeAsAny(tx));

      let { gasInfo } = await client.forceGetQueryClient().tx.simulate(anyMsgs, memo, base64Pk, sequence);
      let gasUsed = Math.Uint53.fromString(gasInfo.gasUsed.toString()).toNumber();
      let fee = Strgate.calculateFee(Math.round(gasUsed * 1.35), gasPrice);

      let height = await client.getHeight();
      const txBodyEncodeObject = {
        typeUrl: "/cosmos.tx.v1beta1.TxBody",
        value: {
          messages: txs,
          memo: memo,
          timeoutHeight: new pkg_Long(height + 100)
        },
      };
      let txBodyBytes = client.registry.encode(txBodyEncodeObject);
      let gasLimit = Math.Int53.fromString(fee.gas).toNumber();
      let pubkey_for_authinfo = ProtoSigning.encodePubkey(base64Pk);
      let authInfoBytes = ProtoSigning.makeAuthInfoBytes([{ pubkey_for_authinfo, sequence }], fee.amount, gasLimit);
      let signDoc = ProtoSigning.makeSignDoc(txBodyBytes, authInfoBytes, chainId, accountNumber);
      let txHash = await wallet.sendTransaction(signDoc);
      webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result

      let iwan = this.frameworkService.getService("iWanConnectorService");
      let blockNumber = await iwan.getBlockNumber(params.toChainType);
      let checkPara = {
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        fromBlockNumber: blockNumber,
        txHash,
        chain: params.toChainType,
        smgPublicKey: params.storemanGroupGpk,
        taskType: "MINT"
      };
      let checkAtomTxService = this.frameworkService.getService("CheckAtomTxService");
      await checkAtomTxService.addTask(checkPara);
    } catch (err) {
      if (err.message === "Cancelled") {
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

  buildTx(paymentAddr, inputs, output, networkFeeOutput, epochParameters, metaData) {
 
  }
};