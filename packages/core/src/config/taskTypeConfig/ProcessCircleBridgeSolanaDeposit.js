'use strict';

const tool = require("../../utils/tool.js");
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount } = require("@solana/spl-token");
const spl = require("@solana/spl-token");

module.exports = class ProcessCircleBridgeSolanaDeposit {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService  = frameworkService.getService("ConfigService");
    this.extension = this.configService.getExtension("SOL");
    this.tool = this.extension.tool;
    this.storemanService = frameworkService.getService("StoremanService");
  }

  async process(stepData, wallet) {
    let webStores = this.frameworkService.getService("WebStores");
    let params = stepData.params;
    try {
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
      let usdcAccount = (tokenPair.fromChainType === "SOL")? tokenPair.fromAccount : tokenPair.toAccount;
      let fromChainInfo = (tokenPair.fromChainType === "SOL")? tokenPair.fromScInfo : tokenPair.toScInfo;
      let toChainInfo = (tokenPair.fromChainType === "SOL")? tokenPair.toScInfo : tokenPair.fromScInfo;
      let destinationDomain = Number(toChainInfo.CircleBridge.domain);
      let destChain = Number(toChainInfo.chainId);
      let amount = new anchor.BN(params.value);
      let mintRecipient = new PublicKey(this.tool.hex2bytes(params.userAccount.replace(/^0x/, '').padStart(64, '0')));
      let messageSentEventAccountKeypair = Keypair.generate();
      let usdcAddress = new PublicKey(tool.ascii2letter(usdcAccount));
      let walletProvider = wallet.getProvider();
      let walletConnection = wallet.getConnection();
      let userTokenAccount = await getOrCreateAssociatedTokenAccount(walletConnection, walletProvider, usdcAddress, walletProvider.publicKey);
      let messageTransmitterProgramId = new PublicKey(fromChainInfo.CircleBridge.messageTransmitter);
      let tokenMessengerMinterProgramId = new PublicKey(fromChainInfo.CircleBridge.tokenMessengerMinter);
      let crossProxyProgram = this.tool.getProgram("cctp", fromChainInfo.CircleBridge.crossScAddr, walletProvider);
      let messageTransmitterAccount = this.tool.findProgramAddress("message_transmitter", messageTransmitterProgramId);
      let tokenMessenger = this.tool.findProgramAddress("token_messenger", tokenMessengerMinterProgramId);
      let tokenMinter = this.tool.findProgramAddress("token_minter", tokenMessengerMinterProgramId);
      let localToken = this.tool.findProgramAddress("local_token", tokenMessengerMinterProgramId, [usdcAddress]);
      let remoteTokenMessengerKey = this.tool.findProgramAddress("remote_token_messenger", tokenMessengerMinterProgramId, [destinationDomain.toString()]);
      let authorityPda = this.tool.findProgramAddress("sender_authority", tokenMessengerMinterProgramId);
      let tokenMessengerEventAuthority = this.tool.findProgramAddress("__event_authority", tokenMessengerMinterProgramId);
      let adminProgramId = new PublicKey(fromChainInfo.adminProgram);
      const domainPda = this.tool.getPda("DomainData", destinationDomain, adminProgramId, 4);
      const feePda = this.tool.getPda("FeeData", destChain, adminProgramId, 4);
      const config_program_admin_pda = this.tool.findProgramAddress("admin_roles", adminProgramId);
      const proxy_config_pda = this.tool.findProgramAddress("ConfigData", crossProxyProgram.programId);

      let walletPublicKey = wallet.getPublicKey();
      const accounts_arg = {
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
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        // additional: 
        eventAuthority: tokenMessengerEventAuthority.publicKey,
        program: tokenMessengerMinterProgramId, // the same as "tokenMessengerMinterProgram"
        // proxy
        configAccount: proxy_config_pda.publicKey,      
        feeReceiver: new PublicKey(fromChainInfo.feeHolder),
        // accounts for configure program:
        configProgramAdminRolesAccount: config_program_admin_pda.publicKey,
        configProgramDomainDataAccount: domainPda.publicKey,
        configProgramFeeDataAccount: feePda.publicKey,
        configProgram: adminProgramId,
        // cctp program:
        circleCctpProgram: tokenMessengerMinterProgramId
      };

      let instruction = await crossProxyProgram.methods.relayCircleCctp(amount, destinationDomain, mintRecipient).accounts(accounts_arg).instruction();
      let unitLimit = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({units: 800_000});

      let recentBlockHash = await walletConnection.getLatestBlockhash();

      let messageV0 = new TransactionMessage({payerKey: walletPublicKey, recentBlockhash: recentBlockHash.blockhash, instructions: [unitLimit, instruction]}).compileToV0Message();
      let tx = new VersionedTransaction(messageV0);
      tx.sign([messageSentEventAccountKeypair]);
      let txHash = await wallet.sendTransaction(tx, messageSentEventAccountKeypair.publicKey);
      webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result

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
      if (err.message === "Request rejected") {
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessCircleBridgeSolanaDeposit error: %O", err);
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }
};