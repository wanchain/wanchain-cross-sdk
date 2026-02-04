import axios from "axios";
import tool from "../../utils/tool.js";

const DepositMsg = "Program log:  relay_circle_cctp() circle message_sent_event_data: ";

class ProcessCircleBridgeSolanaReclaim {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    let configService = frameworkService.getService("ConfigService");
    let extension = configService.getExtension("SOL");
    this.tool = extension.tool;
    this.cctpApiUrl = configService.getGlobalConfig("cctpApiUrl");
    this.chainInfoService = frameworkService.getService("ChainInfoService");
    this.iwan = frameworkService.getService("iWanConnectorService");
  }

  async process(stepData, wallet) {
    let params = stepData.params;
    let queryUrl = this.cctpApiUrl + (params.isV2? "/v2/messages/5?transactionHash=" : "/v1/messages/5/") + params.lockHash;
    let ret = await axios.get(queryUrl);
    console.debug("ProcessCircleBridgeSolanaReclaim %s: %O", queryUrl, ret.data.messages[0]);
    let msg = ret.data.messages && ret.data.messages[0] || {};
    if (msg.attestation && (msg.attestation !== "PENDING") && (msg.message)) { // v2 require attestation and message, v1 only attestation
      let chainInfo = this.chainInfoService.getChainInfoByType("SOL");
      let programName, programAddr;
      if (params.isV2) {
        programName = "messageTransmitterV2";
        programAddr = chainInfo.CircleBridge.messageTransmitterV2;
      } else {
        programName = "messageTransmitter";
        programAddr = chainInfo.CircleBridge.messageTransmitter;
      }
      let messageTransmitterProgram = wallet.getProgram(programName, programAddr);
      let messageTransmitterProgramId = this.tool.getPublicKey(programAddr);
      let messageTransmitterAccount = this.tool.findProgramAddress("message_transmitter", messageTransmitterProgramId); // same for v1 and v2
      let txInfo = await this.iwan.getTransactionReceipt('SOL', params.lockHash); // "no receipt was found"
      if (txInfo && txInfo.meta) {
        let depositMsg = txInfo.meta.logMessages.find(v => v.indexOf(DepositMsg) >= 0);
        if (depositMsg) {
          let dataAddr = depositMsg.slice(DepositMsg.length);
          let messageSentEventData = this.tool.getPublicKey(dataAddr);
          let accounts = {
            payee: this.tool.getPublicKey(params.fromAddr),
            messageTransmitter: messageTransmitterAccount.publicKey,
            messageSentEventData
          };
          let instruction;
          let attestation = Buffer.from(tool.hexStrip0x(msg.attestation), 'hex');
          if (params.isV2) {
            let destinationMessage = Buffer.from(tool.hexStrip0x(msg.message), 'hex');
            instruction = await messageTransmitterProgram.methods.reclaimEventAccount({ attestation, destinationMessage }).accounts(accounts).instruction();
          } else {
            instruction = await messageTransmitterProgram.methods.reclaimEventAccount({ attestation }).accounts(accounts).instruction();
          }
          let tx = await wallet.buildTransaction([instruction]);
          let txHash = await wallet.sendTransaction(tx);
          let checker = {
            chain: "SOL",
            ccTaskId: params.ccTaskId,
            stepIndex: 0,
            txHash,
            event: "ClaimTxHash"
          };
          let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
          await checkTxReceiptService.add(checker);
          return;
        }
      }
    }
    throw new Error("Not ready");
  }
}

export default ProcessCircleBridgeSolanaReclaim;
