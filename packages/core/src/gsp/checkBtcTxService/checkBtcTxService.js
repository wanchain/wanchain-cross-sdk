import axios from "axios";
import tool from "../../utils/tool.js";
import * as bitcoin from "bitcoinjs-lib";

class CheckBtcTxService {
  constructor(chainType = "BTC") {
    this.chainType = chainType;
    this.serviceName = "Check" + chainType.charAt(0).toUpperCase() + chainType.substr(1).toLowerCase() + "TxService";
    this.checkOtas = [];
  }

  async init(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = frameworkService.getService("WebStores");
    this.eventService = frameworkService.getService("EventService");
    let configService = frameworkService.getService("ConfigService");
    this.apiServerConfig = configService.getGlobalConfig("apiServer");
    this.stormanService = frameworkService.getService("StoremanService");
    this.lockTxTimeout = configService.getGlobalConfig("LockTxTimeout");
    let chainInfoService = frameworkService.getService("ChainInfoService");
    let chainInfo = chainInfoService.getChainInfoByType(this.chainType);
    let taskService = frameworkService.getService("TaskService");
    taskService.addTask(this, chainInfo.txScanInterval);
  }

  async loadTradeTask(otas) {
    otas.forEach(ota => this.checkOtas.push(ota));
  }

  async addOTAInfo(info) {
    let task = {
      ccTaskId: info.ccTaskId,
      fromChain: info.fromChain,
      oneTimeAddr: info.oneTimeAddr,
      chain: info.chainType,
      fromBlockNumber: info.fromBlockNumber,
      taskType: info.taskType
    };
    let storageService = this.frameworkService.getService("StorageService");
    await storageService.save(this.serviceName, task.ccTaskId, task);
    this.checkOtas.unshift(task);
  }

  addressToLockHash(address) {
    if (this.chainType === 'BTC' && address.length > 40) {
      const lock = bitcoin.address.fromBech32(address);
      return "0x" + lock.data.toString('hex');
    } else {
      const lock = bitcoin.address.fromBase58Check(address);
      return "0x" + lock.hash.toString('hex');
    }
  }

  getOtaTxUniqueId(txHash, address) {
    txHash = "0x" + tool.hexStrip0x(txHash);
    let hash160 = this.addressToLockHash(address);
    let uniqueId = tool.sha256(txHash + hash160);
    // console.log({txHash, hash160, uniqueId});
    return uniqueId;
  }

  async runTask(taskPara) {
    let storageService = this.frameworkService.getService("StorageService");
    let url = this.apiServerConfig.url + "/api/" + this.chainType.toLowerCase() + "/queryActionInfo/";
    let count = this.checkOtas.length;
    for (let i = 0; i < count; i++) {
      let index = count - i - 1;
      let task = this.checkOtas[index];
      try {
        if (this.webStores.crossChainTaskRecords.getTaskById(task.ccTaskId)) {
          let queryUrl = url + task.oneTimeAddr;
          console.debug("%s queryUrl: %s", this.serviceName, queryUrl);
          let ret = await axios.get(queryUrl);
          if (ret.data.success === true && ret.data.data !== null) {
            let txHashField = this.chainType.toLowerCase() + "Hash";
            let txHash = ret.data.data[txHashField];
            let sender = await this.stormanService.getBtcTxSender(this.chainType, txHash);
            task.uniqueID = this.getOtaTxUniqueId(txHash, task.oneTimeAddr);
            await this.eventService.emitEvent("LockTxHash", {
              ccTaskId: task.ccTaskId,
              txHash,
              sentAmount: ret.data.data.value,
              sender,
              uniqueId: task.uniqueID
            });
            let scEventScanService = this.frameworkService.getService("ScEventScanService");
            await scEventScanService.add(task);
            await storageService.delete(this.serviceName, task.ccTaskId);
            this.checkOtas.splice(index, 1);
          } else if (tool.checkTimeout(task.ccTaskId, this.lockTxTimeout)) {
            console.debug("task %s wait lock tx timeout", task.ccTaskId);
            await this.eventService.emitEvent("LockTxTimeout", {
              ccTaskId: task.ccTaskId
            });
            // DO NOT delete from storage, can be resumed by refreshing page
            this.checkOtas.splice(index, 1);
          }
        } else {
          console.log("%s remove deleted task %s", this.serviceName, task.ccTaskId);
          await storageService.delete(this.serviceName, task.ccTaskId);
          this.checkOtas.splice(index, 1);
        }
      } catch (err) {
        console.error("%s runTask err: %O", this.serviceName, err);
      }
    }
  }
}

export default CheckBtcTxService;
