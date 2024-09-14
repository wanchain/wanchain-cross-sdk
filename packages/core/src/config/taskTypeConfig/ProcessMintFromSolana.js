'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

module.exports = class ProcessMintFromSolana {
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
      let walletPublicKey = wallet.getPublicKey();
      let wanBridgeProgram = wallet.getProgram("wanBridge", fromChainInfo.crossScAddr);
      let solVault = this.tool.findProgramAddress("vault", wanBridgeProgram.programId);
      let adminBoardProgramId = this.tool.getPublicKey(fromChainInfo.adminBoardProgram);
      let tokenpairPda = this.tool.findProgramAddress("TokenPairMap", adminBoardProgramId);
      let configAccountPda = this.tool.findProgramAddress("ConfigData", adminBoardProgramId)
      let configProgramId = this.tool.getPublicKey(fromChainInfo.CircleBridge.configProgram);
      let destChain = Number(toChainInfo.chainId);
      let feePda = this.tool.getPda("FeeData", destChain, configProgramId, 4);
      let smgId = Buffer.from(tool.hexStrip0x(params.storemanGroupId), 'hex');
      let tokenAccount = direction? tokenPair.fromAccount : tokenPair.toAccount;
      let isCoin = (tokenAccount === "0x0000000000000000000000000000000000000000");
      let crossValue = isCoin? new BigNumber(params.value).minus(params.networkFee).toFixed(0) : params.value;
      let amount = this.tool.toBigNumber(crossValue);
      let accounts = {
        user: walletPublicKey,
        solVault: solVault.publicKey,
        feeReceiver: this.tool.getPublicKey(fromChainInfo.feeHolder),
        adminBoardProgram: adminBoardProgramId,
        configAccount: configAccountPda.publicKey,
        tokenPairAccount: tokenpairPda.publicKey,
        cctpAdminBoardFeeAccount: feePda.publicKey,
        mappingTokenMint: null,
        tokenVault: null,
        userAta: null
      };
      if (!isCoin) {
        let tokenAddress = this.tool.getPublicKey(tool.ascii2letter(tokenAccount));
        accounts.mappingTokenMint = tokenAddress;
        accounts.tokenVault = this.tool.getAssociatedTokenAddressSync(tokenAddress, solVault.publicKey, true);
        accounts.userAta = this.tool.getAssociatedTokenAddressSync(tokenAddress, walletPublicKey);
      }
      let unitLimit = this.tool.setComputeUnitLimit(300_000);
      let unitPrice = this.tool.setComputeUnitPrice(100_000);
      let instruction = await wanBridgeProgram.methods.userLock(smgId, params.tokenPairID, amount, Buffer.from(params.userAccount)).accounts(accounts).instruction();
      let tx = await wallet.buildTransaction([unitLimit, unitPrice, instruction]);
      let txHash = await wallet.sendTransaction(tx);
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
          stepIndex: stepData.stepIndex,
          uniqueID: tool.sha256(txHash),
          chain: params.toChainType,
          fromBlockNumber: blockNumber,
          taskType: this.tokenPairService.getTokenEventType(params.tokenPairID, (direction? "MINT" : "BURN")),
        }
      };
      let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    } catch (err) {
      console.error("error: %s", err.message)
      if (["User rejected the request."].includes(err.message)) {
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessMintFromSolana error: %O", err);
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }
};