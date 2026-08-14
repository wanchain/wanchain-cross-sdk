import axios from "axios";
import tool from "../../utils/tool.js";

class CheckXrpTxService {
  constructor() {
    this.xrpCheckTagAry = [];
  }

  async init(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = frameworkService.getService("WebStores");
    this.eventService = frameworkService.getService("EventService");
    let configService = frameworkService.getService("ConfigService");
    this.apiServerConfig = configService.getGlobalConfig("apiServer");
    this.lockTxTimeout = configService.getGlobalConfig("LockTxTimeout");
    let chainInfoService = frameworkService.getService("ChainInfoService");
    let chainInfo = chainInfoService.getChainInfoByType("XRP");
    let taskService = frameworkService.getService("TaskService");
    taskService.addTask(this, chainInfo.txScanInterval);
  }

  async loadTradeTask(xrpAry) {
    xrpAry.forEach(task => this.xrpCheckTagAry.push(task));
  }

  async addTagInfo(info) {
    let tmpObj = {
      ccTaskId: info.ccTaskId,
      tagId: info.tagId,
      chain: info.chainType, // toChainType
      fromBlockNumber: info.fromBlockNumber,
      taskType: info.taskType
    };
    let storageService = this.frameworkService.getService("StorageService");
    await storageService.save("CheckXrpTxService", tmpObj.ccTaskId, tmpObj);
    this.xrpCheckTagAry.push(tmpObj);
  }

  async runTask(taskPara) {
    let storageService = this.frameworkService.getService("StorageService");
    let url = this.apiServerConfig.url + "/api/xrp/queryActionInfo/";
    let count = this.xrpCheckTagAry.length;
    for (let i = 0; i < count; i++) {
      let index = count - i - 1;
      let task = this.xrpCheckTagAry[index];
      try {
        if (this.webStores.crossChainTaskRecords.getTaskById(task.ccTaskId)) {
          let queryUrl = url + task.tagId;
          console.debug("CheckXrpTxService queryUrl:", queryUrl);
          let ret = await axios.get(queryUrl, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': this.apiServerConfig.auth
            }
          });
          if (ret.data.success === true && ret.data.data !== null) {
            task.fromChain = "XRP";
            task.uniqueID = "0x" + ret.data.data.xrpHash.toLowerCase();
            await this.eventService.emitEvent("LockTxHash", {
              ccTaskId: task.ccTaskId,
              txHash: ret.data.data.xrpHash,
              sentAmount: ret.data.data.sentValue,
              sender: ret.data.data.xrpAddr
            });
            let scEventScanService = this.frameworkService.getService("ScEventScanService");
            await scEventScanService.add(task);
            await storageService.delete("CheckXrpTxService", task.ccTaskId);
            this.xrpCheckTagAry.splice(index, 1);
          } else if (tool.checkTimeout(task.ccTaskId, this.lockTxTimeout)) {
            console.debug("task %s wait lock tx timeout", task.ccTaskId);
            await this.eventService.emitEvent("LockTxTimeout", {
              ccTaskId: task.ccTaskId
            });
            // DO NOT delete from storage, can be resumed by refreshing page
            this.xrpCheckTagAry.splice(index, 1);
          }
        } else {
          console.log("CheckXrpTxService remove deleted task %s", task.ccTaskId);
          await storageService.delete("CheckXrpTxService", task.ccTaskId);
          this.xrpCheckTagAry.splice(index, 1);
        }
      } catch (err) {
        console.error("CheckXrpTxService runTask err:", err);
      }
    }
  }
}

export default CheckXrpTxService;
