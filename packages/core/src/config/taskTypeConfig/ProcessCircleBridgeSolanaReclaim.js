'use strict';

const axios = require('axios');

const DepositMsg = "Program log:  relay_circle_cctp() circle message_sent_event_data: ";

module.exports = class ProcessCircleBridgeSolanaReclaim {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = this.frameworkService.getService("WebStores");
    this.configService  = frameworkService.getService("ConfigService");
    let extension = this.configService.getExtension("SOL");
    this.tool = extension.tool;
    this.storemanService = frameworkService.getService("StoremanService");
    this.apiServer = this.configService.getGlobalConfig("apiServer");
    this.chainInfoService = this.frameworkService.getService("ChainInfoService");
    this.iwan = frameworkService.getService("iWanConnectorService");
  }

  async process(stepData, wallet) {
    let params = stepData.params;
    try {
      let queryUrl = this.apiServer + "/api/sol/queryTxInfoBySmgPbkHash/cctp/" + params.lockHash;
      let ret = await axios.get(queryUrl);
      console.debug("ProcessCircleBridgeSolanaReclaim %s: %O", queryUrl, ret.data);
      if (ret.data.success && ret.data.data && ret.data.data.attestation) {
        let attestation = Buffer.from(ret.data.data.attestation, 'hex');
        let chainInfo = this.chainInfoService.getChainInfoByType("SOL");
        let messageTransmitterProgram = wallet.getProgram("messageTransmitter", chainInfo.CircleBridge.messageTransmitter);
        let messageTransmitterProgramId = this.tool.getPublicKey(chainInfo.CircleBridge.messageTransmitter);
        let messageTransmitterAccount = this.tool.findProgramAddress("message_transmitter", messageTransmitterProgramId);
        let txInfo = await this.iwan.getTransactionReceipt('SOL', params.lockHash); // "no receipt was found"
        if (txInfo && txInfo.meta) {
          let depositMsg = txInfo.meta.logMessages.find(v => v.indexOf(DepositMsg) >= 0);
          if (depositMsg) {
            let dataAddr = depositMsg.slice(DepositMsg.length);
            let messageSentEventData = this.tool.getPublicKey(dataAddr);
            let accounts = {
              payee: wallet.getPublicKey(),
              messageTransmitter: messageTransmitterAccount.publicKey,
              messageSentEventData
            };
            let instruction = await messageTransmitterProgram.methods.reclaimEventAccount({attestation}).accounts(accounts).instruction();
            let tx = await wallet.buildTransaction([instruction]);
            let txHash = await wallet.sendTransaction(tx);
            console.log("ProcessCircleBridgeSolanaReclaim txHash: %s", txHash);
            let checker = {
              chain: "SOL",
              ccTaskId: params.ccTaskId,
              stepIndex: 0,
              txHash,
              event: "ReclaimTxHash"
            };
            let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
            await checkTxReceiptService.add(checker);
            return;
          }
        }
      }
      throw new Error("Not ready");
    } catch (err) {
      console.error("ProcessCircleBridgeSolanaReclaim error: %O", err);
    }
  }
}