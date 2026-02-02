const WalletRejects = [
  "Error: Returned error: Error: XDCPay Tx Signature: User denied transaction signature.", // XDCPay 1
  "Error: XDCPay Tx Signature: User denied transaction signature.", // XDCPay 2
  "Confirmation declined by user", // TronLink
];

class ProcessBaseSync {
  constructor(frameworkService) {
    this.chainInfoService = frameworkService.getService("ChainInfoService");
    this.storemanService = frameworkService.getService("StoremanService");
    this.txGeneratorService = frameworkService.getService("TxGeneratorService");
  }

  // virtual function
  async process(stepData, wallet) {
  }

  async sendTx(stepData, txData, wallet) {
    try {
      let params = stepData.params;
      let checkWalletId = await this.storemanService.checkWalletId(params.chainType, wallet);
      if (!checkWalletId) {
        throw new Error("Wallet chain mismatch");
      }
      let accounts = await wallet.getAccounts();
      let curAccount = accounts && accounts[0] || "";
      if (curAccount.toLowerCase() !== params.fromAddr.toLowerCase()) {
        throw new Error("Wallet account mismatch");
      }
      let txHash = await wallet.sendTransaction(txData);
      let txReceipt = await this.storemanService.waitTxReceipt(params.chainType, txHash, 30000, 3000);
      if (txReceipt && (txReceipt.status == 1)) {
        console.log("%s txHash: %s", stepData.name || params.taskType, txHash);
      } else {
        throw new Error("Send transaction failed");
      }
    } catch (err) {
      if ((err.code === 4001) || WalletRejects.includes(err.toString())) {
        throw new Error("Rejected");
      } else {
        throw err;
      }
    }
  }
}

export default ProcessBaseSync;
