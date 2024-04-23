'use strict';

const tool = require("../../utils/tool.js");

module.exports = class ProcessCircleBridgeSolanaDeposit {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = this.frameworkService.getService("WebStores");
    this.configService  = frameworkService.getService("ConfigService");
    let extension = this.configService.getExtension("SOL");
    this.tool = extension.tool;
    this.storemanService = frameworkService.getService("StoremanService");
    this.tokenPairService = frameworkService.getService("TokenPairService");
  }

  async process(stepData, wallet) {
    let params = stepData.params;
    try {
      let tokenPair = this.tokenPairService.getTokenPair(params.tokenPairID);
      let direction = (tokenPair.fromChainType === "SOL");
      let fromChainInfo = direction? tokenPair.fromScInfo : tokenPair.toScInfo;
      let toChainInfo = direction? tokenPair.toScInfo : tokenPair.fromScInfo;
      let destinationDomain = Number(toChainInfo.CircleBridge.domain);
      let destChain = Number(toChainInfo.chainId);
      let amount = this.tool.toBigNumber(params.value);
      let mintRecipient = this.tool.getPublicKey(this.tool.hex2bytes(params.userAccount.replace(/^0x/, '').padStart(64, '0')));
      let messageSentKeypair = this.tool.getKeypair();
      let walletPublicKey = wallet.getPublicKey();
      let usdcAddress = this.tool.getPublicKey(tool.ascii2letter(direction? tokenPair.fromAccount : tokenPair.toAccount));
      let userTokenAccount = this.tool.getAssociatedTokenAddressSync(usdcAddress, walletPublicKey);
      let messageTransmitterProgramId = this.tool.getPublicKey(fromChainInfo.CircleBridge.messageTransmitter);
      let tokenMessengerMinterProgramId = this.tool.getPublicKey(fromChainInfo.CircleBridge.tokenMessengerMinter);
      let crossProxyProgram = wallet.getProgram("cctpProxy", fromChainInfo.CircleBridge.crossScAddr);
      let messageTransmitterAccount = this.tool.findProgramAddress("message_transmitter", messageTransmitterProgramId);
      let tokenMessenger = this.tool.findProgramAddress("token_messenger", tokenMessengerMinterProgramId);
      let tokenMinter = this.tool.findProgramAddress("token_minter", tokenMessengerMinterProgramId);
      let localToken = this.tool.findProgramAddress("local_token", tokenMessengerMinterProgramId, [usdcAddress]);
      let remoteTokenMessengerKey = this.tool.findProgramAddress("remote_token_messenger", tokenMessengerMinterProgramId, [destinationDomain.toString()]);
      let authorityPda = this.tool.findProgramAddress("sender_authority", tokenMessengerMinterProgramId);
      let tokenMessengerEventAuthority = this.tool.findProgramAddress("__event_authority", tokenMessengerMinterProgramId);
      let configProgramId = this.tool.getPublicKey(fromChainInfo.configProgram);
      let domainPda = this.tool.getPda("DomainData", destinationDomain, configProgramId, 4);
      let feePda = this.tool.getPda("FeeData", destChain, configProgramId, 4);
      let cfgAdminPda = this.tool.findProgramAddress("admin_roles", configProgramId);
      let cfgDataPda = this.tool.findProgramAddress("ConfigData", crossProxyProgram.programId);
      let accounts = {
        owner: walletPublicKey,
        eventRentPayer: walletPublicKey,
        senderAuthorityPda: authorityPda.publicKey,
        burnTokenAccount: userTokenAccount,
        messageTransmitter: messageTransmitterAccount.publicKey,
        tokenMessenger: tokenMessenger.publicKey,
        remoteTokenMessenger: remoteTokenMessengerKey.publicKey,
        tokenMinter: tokenMinter.publicKey,
        localToken: localToken.publicKey,
        burnTokenMint: usdcAddress,
        messageSentEventData: messageSentKeypair.publicKey,
        messageTransmitterProgram: messageTransmitterProgramId,
        tokenMessengerMinterProgram: tokenMessengerMinterProgramId,
        tokenProgram: this.tool.getTokenProgramId(),
        systemProgram: this.tool.getSystemProgramId(),
        // additional: 
        eventAuthority: tokenMessengerEventAuthority.publicKey,
        program: tokenMessengerMinterProgramId, // the same as "tokenMessengerMinterProgram"
        // proxy
        configAccount: cfgDataPda.publicKey,
        feeReceiver: this.tool.getPublicKey(fromChainInfo.feeHolder),
        // accounts for configure program:
        configProgramAdminRolesAccount: cfgAdminPda.publicKey,
        configProgramDomainDataAccount: domainPda.publicKey,
        configProgramFeeDataAccount: feePda.publicKey,
        configProgram: configProgramId,
        // cctp program:
        circleCctpProgram: tokenMessengerMinterProgramId
      };

      let unitLimit = this.tool.setComputeUnitLimit(200_000);
      let unitPrice = this.tool.setComputeUnitPrice(100_000);
      let instruction = await crossProxyProgram.methods.relayCircleCctp(amount, destinationDomain, mintRecipient).accounts(accounts).instruction();
      let tx = await wallet.buildTransaction([unitLimit, unitPrice, instruction]);
      let txHash = await wallet.sendTransaction(tx, messageSentKeypair);
      this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType);
      let checker = {
        chain: "SOL",
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        txHash,
        txCheckInfo: null, // only check tx receipt, no event
        convertCheckInfo: {
          ccTaskId: params.ccTaskId,
          txHash,
          uniqueID: tool.sha256(txHash),
          chain: params.toChainType,
          fromBlockNumber: blockNumber,
          taskType: "circleMINT",
          fromChain: fromChainInfo.chainType,
          depositDomain: fromChainInfo.CircleBridge.domain,
          depositNonce: undefined, // deposit nonce is really uniqueID
          depositAmount: 0,
          ota: messageSentKeypair.publicKey.toString()
        }
      };
      let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    } catch (err) {
      console.error("error: %s", err.message)
      if (["User rejected the request."].includes(err.message)) {
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessCircleBridgeSolanaDeposit error: %O", err);
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }

  async getComputeUnitPrice(wallet) {
    try {
      let recentFees = await wallet.getRecentPrioritizationFees();
      let sum = 0, cnt = 0, fee;
      recentFees.forEach(v => {
        fee = v.prioritizationFee;
        if (fee > 0) {
          sum = sum + fee;
          cnt++;
        }
      });
      let average = cnt? Math.ceil(sum / cnt) : 0;
      return average;
    } catch (err) {
      console.error("getRecentPrioritizationFees error: %O", err);
      return 0;
    }
  }
};