import axios from "axios";

class CheckBtcTx {
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
    let taskService = this.frameworkService.getService("TaskService");
    taskService.addTask(this, chainInfo.txScanInterval);
  }

  async add(task) {
    try {
      console.log("%s add task: %O", this.serviceName, task);
      let url = this.apiServerConfig.url + "/api/" + this.chainType.toLowerCase() + "/addTxInfo";
      let data = {
        chainType: task.fromChain,
        chainAddr: task.fromAddr,
        chainHash: task.chainHash || task.txHash
      };
      let addrField = this.chainType.toLowerCase() + "Addr";
      data[addrField] = task.toAddr;
      let ret = await axios.post(url, data);
      if (ret.data.success === true) {
        console.log("%s save to apiServer success", this.serviceName);
        this.checkAry.unshift(task);
      } else {
        console.error("%s save to apiServer fail: %O", this.serviceName, data);
      }
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
      let url = this.apiServerConfig.url + "/api/" + this.chainType.toLowerCase() + "/queryTxAckInfo/";
      let count = this.checkAry.length;
      for (let i = 0; i < count; i++) {
        let index = count - i - 1;
        let task = this.checkAry[index];
        if (this.webStores.crossChainTaskRecords.getTaskById(task.ccTaskId)) {
          let txUrl = url + task.uniqueID;
          let ret = await axios.get(txUrl);
          console.debug("%s %s ret.data: %O", this.serviceName, txUrl, ret.data);
          if (ret.data.success && ret.data.data) {
            let eventService = this.frameworkService.getService("EventService");
            let txHashField = this.chainType.toLowerCase() + "Hash";
            let addrField = this.chainType.toLowerCase() + "Addr";
            let data = ret.data.data;
            await eventService.emitEvent("RedeemTxHash", { ccTaskId: task.ccTaskId, txHash: data[txHashField], toAccount: data[addrField], value: data.value });
            storageService.delete("ScEventScanService", task.uniqueID);
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

export default CheckBtcTx;
