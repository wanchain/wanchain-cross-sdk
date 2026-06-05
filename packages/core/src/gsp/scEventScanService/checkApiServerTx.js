import axios from "axios";
import BigNumber from "bignumber.js";

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
    this.storemanService = this.frameworkService.getService("StoremanService");
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
      let count = this.checkAry.length;
      for (let i = 0; i < count; i++) {
        let index = count - i - 1;
        let task = this.checkAry[index];
        let ccTask = this.webStores.crossChainTaskRecords.getTaskById(task.ccTaskId);
        if (ccTask) {
          let data = null;
          if ((task.taskType === "cctpV2MINT") && task.isForward) { // apiServer do not process these txs, query from circle api
            data = await this.queryCctpFowward(task, ccTask);
          } else { // query from apiServer
            data = await this.queryApiServer(task);
          }
          if (data) {
            await this.eventService.emitEvent("RedeemTxHash", { ccTaskId: task.ccTaskId, txHash: data.txHash, toAccount: data.toAccount, value: data.value });
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

  async queryApiServer(task) {
    let txUrl = this.apiServerConfig.url + "/api/" + this.chainType.toLowerCase() + "/queryTxInfoByChainHash/" + task.fromChain + "/" + task.uniqueID;
    let res = await axios.get(txUrl);
    console.debug("%s apiServer %s: %O", this.serviceName, txUrl, res.data);
    if (res.data.success && res.data.data) {
      let data = res.data.data;
      // when noble cctp claim tx is sent by other provider, txHash is empty, toAddr and value are invalid
      return {
        txHash: data.txHash,
        toAccount: data.txHash ? data.toAddr : "", // // solana cctp is encoded format
        value: data.txHash ? data.value : ""
      }
    } else {
      return null;
    }
  }

  async queryCctpFowward(task, ccTask) {
    let data = await this.storemanService.getCctpV2Message(task.fromChain, task.txHash);
    console.debug("%s %s %s cctpForward: %O", this.serviceName, task.fromChain, task.txHash, data);
    if (data) {
      if (data.forwardState === "COMPLETE") {
        let msg = data.decodedMessage.decodedMessageBody;
        return {
          txHash: data.forwardTxHash,
          toAccount: "", // solana cctpv2 forward is ata
          value: new BigNumber(msg.amount).minus(msg.feeExecuted).toFixed(0)
        }
      } else if (data.forwardState === "FAILED") {
        if (!ccTask.claimStatus) {
          this.eventService.emitEvent("Claimable", { ccTaskId: task.ccTaskId });
        }
        return null;
      }
    } else {
      return null;
    }
  }
}

export default CheckApiServerTx;
