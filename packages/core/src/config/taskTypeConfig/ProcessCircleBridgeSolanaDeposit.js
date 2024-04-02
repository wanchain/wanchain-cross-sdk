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
      let destChain = 0x80001000; // Number(toChainInfo.chainId); // TODO: AVAX test
      let amount = this.tool.toBigNumber(params.value);
      let mintRecipient = this.tool.getPublicKey(this.tool.hex2bytes(params.userAccount.replace(/^0x/, '').padStart(64, '0')));
      let messageSentEventAccountKeypair = this.tool.getKeypair();
      let usdcAddress = this.tool.getPublicKey(tool.ascii2letter(direction? tokenPair.fromAccount : tokenPair.toAccount));
      let userTokenAccount = await wallet.getOrCreateAssociatedTokenAccount(usdcAddress);
      let messageTransmitterProgramId = this.tool.getPublicKey(fromChainInfo.CircleBridge.messageTransmitter);
      let tokenMessengerMinterProgramId = this.tool.getPublicKey(fromChainInfo.CircleBridge.tokenMessengerMinter);
      let crossProxyProgram = wallet.getProgram("cctp", fromChainInfo.CircleBridge.crossScAddr);
      let messageTransmitterAccount = this.tool.findProgramAddress("message_transmitter", messageTransmitterProgramId);
      let tokenMessenger = this.tool.findProgramAddress("token_messenger", tokenMessengerMinterProgramId);
      let tokenMinter = this.tool.findProgramAddress("token_minter", tokenMessengerMinterProgramId);
      let localToken = this.tool.findProgramAddress("local_token", tokenMessengerMinterProgramId, [usdcAddress]);
      let remoteTokenMessengerKey = this.tool.findProgramAddress("remote_token_messenger", tokenMessengerMinterProgramId, [destinationDomain.toString()]);
      let authorityPda = this.tool.findProgramAddress("sender_authority", tokenMessengerMinterProgramId);
      let tokenMessengerEventAuthority = this.tool.findProgramAddress("__event_authority", tokenMessengerMinterProgramId);
      let adminProgramId = this.tool.getPublicKey(fromChainInfo.adminProgram);
      let domainPda = this.tool.getPda("DomainData", destinationDomain, adminProgramId, 4);
      let feePda = this.tool.getPda("FeeData", destChain, adminProgramId, 4);
      let cfgAdminPda = this.tool.findProgramAddress("admin_roles", adminProgramId);
      let cfgDataPda = this.tool.findProgramAddress("ConfigData", crossProxyProgram.programId);

      let walletPublicKey = wallet.getPublicKey();
      let accounts = {
        owner: walletPublicKey,
        eventRentPayer: walletPublicKey,
        senderAuthorityPda: authorityPda.publicKey,
        burnTokenAccount: userTokenAccount.address,
        messageTransmitter: messageTransmitterAccount.publicKey,
        tokenMessenger: tokenMessenger.publicKey,
        remoteTokenMessenger: remoteTokenMessengerKey.publicKey,
        tokenMinter: tokenMinter.publicKey,
        localToken: localToken.publicKey,
        burnTokenMint: usdcAddress,
        messageSentEventData: messageSentEventAccountKeypair.publicKey,
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
        configProgram: adminProgramId,
        // cctp program:
        circleCctpProgram: tokenMessengerMinterProgramId
      };

      let instruction = await crossProxyProgram.methods.relayCircleCctp(amount, destinationDomain, mintRecipient).accounts(accounts).instruction();
      let unitLimit = this.tool.setComputeUnitLimit(800_000);

      let tx = await wallet.buildTransaction([unitLimit, instruction]);
      let txHash = await wallet.sendTransaction(tx, messageSentEventAccountKeypair);
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
      console.error("error: %s", err.message)
      if (["User rejected the request."].includes(err.message)) {
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessCircleBridgeSolanaDeposit error: %O", err);
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }
};