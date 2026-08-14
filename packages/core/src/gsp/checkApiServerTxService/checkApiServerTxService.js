import axios from "axios";

class CheckApiServerTxService {
  constructor(chainType) {
    this.chainType = chainType;
    this.serviceName = "Check" + chainType.charAt(0).toUpperCase() + chainType.substr(1).toLowerCase() + "TxService";
    this.checkArray = [];
  }

  async init(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = frameworkService.getService("WebStores");
    this.eventService = frameworkService.getService("EventService");
    let configService = frameworkService.getService("ConfigService");
    this.apiServerConfig = configService.getGlobalConfig("apiServer");
    let chainInfoService = frameworkService.getService("ChainInfoService");
    let chainInfo = chainInfoService.getChainInfoByType(this.chainType);
    if (chainInfo) { // maybe not configured on mainnet
      let taskService = frameworkService.getService("TaskService");
      taskService.addTask(this, chainInfo.txScanInterval);
    }
  }

  async loadTradeTask(tasks) {
    tasks.forEach(task => this.checkArray.push(task));
  }

  async addTask(task) {
    let storageService = this.frameworkService.getService("StorageService");
    await storageService.save(this.serviceName, task.ccTaskId, task);
    this.checkArray.unshift(task);
    //console.debug("addTask:", task, "checkArray:", this.checkArray);
  }

  async runTask(taskPara) {
    try {
      // console.log("this.checkArray:", this.checkArray);
      let storageService = this.frameworkService.getService("StorageService");
      let count = this.checkArray.length;
      let url = this.apiServerConfig.url + "/api/" + this.chainType.toLowerCase() + "/queryTxInfoBySmgPbkHash/";
      for (let i = 0; i < count; i++) {
        let index = count - i - 1;
        let task = this.checkArray[index];
        try {
          if (this.webStores.crossChainTaskRecords.getTaskById(task.ccTaskId)) {
            let queryUrl = url + task.smgPublicKey + "/" + task.txHash.toLowerCase();
            let ret = await axios.get(queryUrl, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': this.apiServerConfig.auth
              }
            });
            console.debug("%s %s: %O", this.serviceName, queryUrl, ret.data);
            if (ret.data.success && ret.data.data) {
              task.uniqueID = ret.data.data.hashX;
              task.fromChain = this.chainType;
              await this.eventService.emitEvent("TaskStepResult", {
                ccTaskId: task.ccTaskId,
                stepIndex: task.stepIndex,
                txHash: task.txHash,
                result: "Succeeded"
              });
              let scEventScanService = this.frameworkService.getService("ScEventScanService");
              await scEventScanService.add(task);
              await storageService.delete(this.serviceName, task.ccTaskId);
              this.checkArray.splice(index, 1);
            }
          } else {
            console.log("%s remove deleted task %s", this.serviceName, task.ccTaskId);
            await storageService.delete(this.serviceName, task.ccTaskId);
            this.checkArray.splice(index, 1);
          }
        } catch (err) {
          console.error("%s runTask error: %O", this.serviceName, err);
        }
      }
    } catch (err) {
      console.error("%s error: %O", this.serviceName, err);
    }
  }
}

export default CheckApiServerTxService;
