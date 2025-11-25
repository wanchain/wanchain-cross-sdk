import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import tool from "../../utils/tool.js";

bitcoin.initEccLib(ecc);

const networks = {
  BTC: bitcoin.networks
};

export default (class ProcessMintFromBitcoinWallet {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = frameworkService.getService("WebStores");
    this.storemanService = frameworkService.getService("StoremanService");
  }

  async process(stepData, wallet) {
    let params = stepData.params;
    try {
      let tokenPairHex = parseInt(params.tokenPairID).toString(16);
      tokenPairHex = ('000' + tokenPairHex).slice(-4);
      let memo = '07' + tokenPairHex + '0000000000000000' + tool.hexStrip0x(params.userAccount.toLowerCase()); // 07 is userLock with compact format address
      let smgAddr = this.gpk2Addr(params.fromChainType, params.gpkInfo);
      console.debug("ProcessMintFromBitcoinWallet %s smgAddr: %s", params.fromChainType, smgAddr);
      let txHash = await wallet.sendTransaction(smgAddr, params.value, { memo, fromAddr: params.fromAddr, decimals: params.decimals });
      this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
      let direction = (params.fromChainType === tokenPair.fromChainType) ? "MINT" : "BURN";
      let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType);
      let checker = {
        chain: params.fromChainType,
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        txHash,
        interval: 60, // seconds
        txCheckInfo: null, // only check transaction receipt, no event
        convertCheckInfo: {
          ccTaskId: params.ccTaskId,
          stepIndex: stepData.stepIndex,
          uniqueID: "0x" + tool.hexStrip0x(txHash),
          fromBlockNumber: blockNumber,
          chain: params.toChainType,
          taskType: tokenPairService.getTokenEventType(params.tokenPairID, direction),
          fromChain: params.fromChainType,
          // for api server
          fromAddr: params.fromAddr,
          txHash,
          toAddr: params.toAddr
        }
      };
      let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    } catch (err) {
      if (err.code === 4001) {
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected", "");
      } else {
        console.error("ProcessMintFromBitcoinWallet error: %O", ProcessMintFromBitcoinWallet, err);
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }

  gpk2Addr(fromChainType, gpkInfo) {
    let chainInfoService = this.frameworkService.getService("ChainInfoService");
    let chainInfo = chainInfoService.getChainInfoByType(fromChainType);
    if (gpkInfo.algo == 2) { // schnorr340
      return this.pk2p2tr(gpkInfo.gpk, networks[fromChainType][chainInfo.network]);
    } else { // only support p2tr now
      return "";
    }
  }

  pk2p2tr(gpk, network) {
    let xOnlyMpcPk = Buffer.from(gpk.slice(2, 66), 'hex'); // gpk is 0x...
    let redeemScript = this.getP2trRedeemScript(xOnlyMpcPk);
    let scriptTree = {
      output: redeemScript,
      version: 0xc0
    };
    let p2tr = bitcoin.payments.p2tr({
      internalPubkey: xOnlyMpcPk,
      scriptTree: scriptTree,
      redeem: scriptTree,
      network
    });
    return p2tr.address;
  }

  getP2trRedeemScript(xOnlyMpcPk) {
    let redeemScript = bitcoin.script.fromASM(`
      OP_DUP
      OP_HASH160
      ${bitcoin.crypto.hash160(xOnlyMpcPk).toString('hex')}
      OP_EQUALVERIFY
      OP_CHECKSIG
      `.trim().replace(/\s+/g, ' '));
    return redeemScript;
  }
});
