import axios from "axios";

class CheckXrpTx {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.checkAry = [];
  }

  async init(chainType) {
    this.webStores = this.frameworkService.getService("WebStores");
    this.eventService = this.frameworkService.getService("EventService");
    let configService = this.frameworkService.getService("ConfigService");
    this.apiServerConfig = configService.getGlobalConfig("apiServer");
    let chainInfoService = this.frameworkService.getService("ChainInfoService");
    let chainInfo = chainInfoService.getChainInfoByType(chainType);
    let taskService = this.frameworkService.getService("TaskService");
    taskService.addTask(this, chainInfo.txScanInterval);
  }

  async add(task) {
    try {
      let url = this.apiServerConfig.url + "/api/xrp/addTxInfo";
      let data = {
        xrpAddr: task.toAddr,
        chainType: task.fromChain,
        chainAddr: task.fromAddr,
        chainHash: task.chainHash || task.txHash
      };
      let ret = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.apiServerConfig.auth
        }
      });
      if (ret.data.success === true) {
        console.log("CheckXrpTx save to apiServer success");
        this.checkAry.unshift(task);
      } else {
        console.error("CheckXrpTx save to apiServer fail: %O", data);
      }
    } catch (err) {
      console.log("CheckXrpTx err:", err);
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
      let url = this.apiServerConfig.url + "/api/xrp/queryTxAckInfo/";
      let count = this.checkAry.length;
      for (let i = 0; i < count; i++) {
        let index = count - i - 1;
        let task = this.checkAry[index];
        if (this.webStores.crossChainTaskRecords.getTaskById(task.ccTaskId)) {
          let txUrl = url + task.uniqueID;
          let ret = await axios.get(txUrl, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': this.apiServerConfig.auth
            }
          });
          console.debug("checkXrpTx %s ret.data: %O", txUrl, ret.data);
          if (ret.data.success && ret.data.data) {
            let eventService = this.frameworkService.getService("EventService");
            let data = ret.data.data;
            await eventService.emitEvent("RedeemTxHash", { ccTaskId: task.ccTaskId, txHash: data.xrpHash, toAccount: data.xrpAddr, value: data.value });
            await storageService.delete("ScEventScanService", task.uniqueID);
            this.checkAry.splice(index, 1);
          }
        } else {
          console.log("CheckXrpTx remove deleted task %s", task.ccTaskId);
          await storageService.delete("ScEventScanService", task.uniqueID);
          this.checkAry.splice(index, 1);
        }
      }
    } catch (err) {
      console.error("CheckXrpTx error: %O", err);
    }
  }
}

export default CheckXrpTx;
