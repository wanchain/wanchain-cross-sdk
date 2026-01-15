import axios from "axios";

class CheckApiServerTx {
  constructor(frameworkService, chainType) {
    this.frameworkService = frameworkService;
    this.chainType = chainType;
    this.serviceName = "Check" + chainType.charAt(0).toUpperCase() + chainType.substr(1).toLowerCase() + "Tx";
    this.checkAry = [];
  }

  async init() {
    this.webStores = this.frameworkService.getService("WebStores");
    this.eventService = this.frameworkService.getService("EventService");
    let configService = this.frameworkService.getService("ConfigService");
    this.apiServerConfig = configService.getGlobalConfig("apiServer");
    let chainInfoService = this.frameworkService.getService("ChainInfoService");
    let chainInfo = chainInfoService.getChainInfoByType(this.chainType);
    if (chainInfo) { // maybe not configured on mainnet
      let taskService = this.frameworkService.getService("TaskService");
      taskService.addTask(this, chainInfo.txScanInterval);
    }
  }

  async add(task) {
    try {
      console.debug("%s add task:", this.serviceName, task);
      this.checkAry.unshift(task);
    } catch (err) {
      console.error("%s add error: %O", this.serviceName, err);
    }
  }

  async load(task) {
    this.checkAry.unshift(task);
  }

  async runTask(taskPara) {
    try {
      if (this.checkAry.length <= 0) {
        return;
      }
      let storageService = this.frameworkService.getService("StorageService");
      let url = this.apiServerConfig.url + "/api/" + this.chainType.toLowerCase() + "/queryTxInfoByChainHash/";
      let count = this.checkAry.length;
      for (let i = 0; i < count; i++) {
        let index = count - i - 1;
        let task = this.checkAry[index];
        if (this.webStores.crossChainTaskRecords.getTaskById(task.ccTaskId)) {
          let txUrl = url + task.fromChain + "/" + task.uniqueID;
          let ret = await axios.get(txUrl);
          console.debug("%s %s ret.data: %O", this.serviceName, txUrl, ret.data);
          if (ret.data.success && ret.data.data) {
            let data = ret.data.data;
            // when noble cctp claim tx is sent by other provider, txHash is empty, toAddr and value are invalid
            let toAccount = data.txHash ? data.toAddr : ""; // solana cctp is encoded format
            let value = data.txHash ? data.value : "";
            await this.eventService.emitEvent("RedeemTxHash", { ccTaskId: task.ccTaskId, txHash: data.txHash, toAccount, value });
            await storageService.delete("ScEventScanService", task.uniqueID);
            this.checkAry.splice(index, 1);
          }
        } else {
          console.log("%s remove deleted task %s", this.serviceName, task.ccTaskId);
          await storageService.delete("ScEventScanService", task.uniqueID);
          this.checkAry.splice(index, 1);
        }
      }
    } catch (err) {
      console.error("%s runTask err: %O", this.serviceName, err);
    }
  }
}

export default CheckApiServerTx;
