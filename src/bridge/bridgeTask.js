const tool = require("../utils/commonTool.js")
const keypairs = require('ripple-keypairs');
const elliptic = require('elliptic');
const Secp256k1 = elliptic.ec('secp256k1');
const xrpAddrCodec = require('ripple-address-codec');
const CrossChainTask = require('./stores/CrossChainTask');

class BridgeTask {
  constructor(bridge, assetPair, direction, toAccount, amount) {
    this.bridge = bridge;
    this.assetPair = assetPair;
    this.direction = direction;
    this.toAccount = toAccount;
    this.amount = amount;
    this.fee = null;
    this.id = Date.now();
    this.task = new CrossChainTask();
    this.curStep = 0;
    this.executedStep = -1;
    this.ccTaskTag = '';
  }

  async init() {
    if (!this.bridge.checkWallet(this.assetPair, this.direction)) {
      throw "Invalid wallet";
    }
    if (!await this.getFee()) {
      throw "Unknown fee";
    }
    return true;
  }

  async getFee() {
    try {
      this.fee = await this.bridge.estimateFee(this.assetPair, this.direction);
      return true;
    } catch(err) {
      console.error("task %s getFee error: %O", this.id, err);
      return false;
    }
  }

  async start() {
    let bridge = this.bridge;
    let assetPair = this.assetPair;
    let ccTaskData = this.task.ccTaskData;
    
    // quota
    let tmpSmgQuota;
    if (assetPair.storemanGroup[0]) {
      tmpSmgQuota = await bridge.storemanService.getStroremanGroupQuotaInfo(assetPair.fromChainType, assetPair.assetPairId, assetPair.storemanGroup[0].id);
      console.log("tmpSmgQuota: %O", tmpSmgQuota);
      bridge.stores.assetPairs.setSmgQuotaById(assetPair.assetPairId, assetPair.storemanGroup[0].id, tmpSmgQuota.maxQuota);
    }

    // tag
    let bDestinationTag = ["BTC", "XRP", "LTC"].includes(assetPair.fromChainType) && (this.direction == "MINT");
    console.log("bDestinationTag: %O", bDestinationTag);

    // task
    let jsonTaskAssetPair = {
      assetPairId: assetPair.assetPairId,
      srcAsset: assetPair.srcAsset,
      dstAsset: assetPair.dstAsset,
      bMintType: this.direction == 'MINT',
      assetSMGs: assetPair.storemanGroup,
      storemanGroup: assetPair.storemanGroup[0].id,
      storemanQuota: tmpSmgQuota.maxQuota,
      assetType: assetPair.assetType,
      fromChainType: assetPair.fromChainType,
      toChainType: assetPair.toChainType
    };
    console.log("jsonTaskAssetPair: %O", jsonTaskAssetPair);

    this.task.setCCTaskID(this.id);
    this.task.setTaskAssetPair(jsonTaskAssetPair);
    this.task.setOperateFee(this.fee.operateFee.value);
    this.task.setNetworkFee(this.fee.networkFee.value);
    this.task.setDestinationTag(bDestinationTag);
    this.task.setTaskAccountAddress('To', this.toAccount);
    this.task.setTaskAmount(this.amount);

    // build steps
    let bValidSteps = await this.checkTaskSteps();
    if (false === bValidSteps) {
      this.bridge.emit("error", {taskId: this.id, reason: "Can not convert"});
      return;
    }

    // save context
    ccTaskData.status = "Performing";
    let taskSteps = bridge.stores.crossChainTaskSteps.mapCCTaskStepsArray.get(this.id);
    // if (!taskSteps) {
    //   bridge.getPausedTaskStepsAry();
    //   taskSteps = bridge.stores.crossChainTaskSteps.mapCCTaskStepsArray.get(this.id); 
    // }
    ccTaskData.stepData = taskSteps;
    console.log("ccTaskData: %O", ccTaskData);
    bridge.stores.crossChainTaskRecords.addNewTradeTask(ccTaskData);
    bridge.storageService.save("crossChainTaskRecords", ccTaskData.ccTaskId, ccTaskData);

    //excute
    this.parseTaskStatus(taskSteps);
  }

  async checkTaskSteps() {
    let ccTaskData = this.task.ccTaskData;
    let gpk = '';
    for (let i = 0; i < ccTaskData.assetSMGs.length; i++) {
      if (ccTaskData.assetSMGs[i].id === ccTaskData.storemanGroup) {
        if (0 == ccTaskData.assetSMGs[i].curve1) {
          gpk = ccTaskData.assetSMGs[i].gpk1;
        } else {
          gpk = ccTaskData.assetSMGs[i].gpk2;
        }
      }
    }
    // to get the stepsFunc from server api
    let convertJson = {
      "ccTaskId": ccTaskData.ccTaskId,
      "tokenPairId": ccTaskData.assetPairId,
      "convertType": ccTaskData.convertType,
      "fromChainType": ccTaskData.fromChainType,
      "fromSymbol": ccTaskData.srcAsset,
      "fromAddr": this.bridge.stores.accountRecords.getCurAccount(ccTaskData.fromChainType, ccTaskData.toChainType, this.direction),
      "toSymbol": ccTaskData.dstAsset,
      "toAddr": ccTaskData.destAccount,
      "storemanGroupId": ccTaskData.storemanGroup,
      "storemanGroupGpk": gpk,
      "value": ccTaskData.amount
    }; 
    // console.log("checkTaskSteps: %O", convertJson);
    let retRslt = await this.bridge.storemanService.getConvertInfo(convertJson);
    // console.log("getConvertInfo: %O", retRslt);
    if (retRslt.stepNum > 0) {
      this.task.setTaskStepNums(retRslt.stepNum);
      return true;
    } else {
      return false;
    }
  }

  updateStorageService(taskId) { // TODO: update status on exception
    let records = this.bridge.stores.crossChainTaskRecords;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (ccTask) { 
      this.bridge.storageService.save("crossChainTaskRecords", taskId, ccTask);
    }
  }

  async parseTaskStatus(ccTaskStepsArray) {
    const ccTaskData = this.task.ccTaskData;
    console.log("ccTaskStepsArray.length: %s, curStep: %s, executedStep: %s", ccTaskStepsArray.length, this.curStep, this.executedStep);
    for (; this.curStep < ccTaskStepsArray.length; ) {
      let taskStep = ccTaskStepsArray[this.curStep];
      console.log("task %d step %d result: %O", this.id, this.curStep, taskStep);
      let stepResult = taskStep.stepResult;
      if (!stepResult) {
        if (this.executedStep != this.curStep) {
          let jsonStepHandle = taskStep.jsonParams;
          // to call server to execute the api
          await this.bridge.storemanService.processTxTask(jsonStepHandle);
          this.executedStep = this.curStep;
        }
        await tool.sleep(5000);
        continue;
      }
      if (["Failed", "Rejected"].includes(stepResult)) { // ota stepResult is tag value or ota address
        this.updateTaskStepData(taskStep.stepNo, taskStep.txHash, stepResult);
        this.bridge.emit('error', {taskId: this.id, reason: stepResult});
        break;
      }
      if (ccTaskData.bDestinationTag) {
        this.procOtaAddr(ccTaskData, taskStep);
      }
      this.updateTaskStepData(taskStep.stepNo, taskStep.txHash, stepResult);
      this.curStep++;
    }
  }

  procOtaAddr(ccTaskData, taskStep) {
    if (this.ccTaskTag) {
      return;
    }
    let records = this.bridge.stores.crossChainTaskRecords;
    let chainType = ccTaskData.fromChainType;
    let smgAddress = undefined, tag = undefined;
    if (['BTC', 'LTC'].includes(chainType)) {
      records.attachTagIdByTaskId(this.id, taskStep.stepResult);
      this.ccTaskTag = taskStep.stepResult;
    } else { // XRP
      let xrpAddr = this.genXAddressByTagId(taskStep.stepResult);
      records.attachTagIdByTaskId(this.id, xrpAddr.xAddr, xrpAddr.tagId, xrpAddr.rAddr);
      this.ccTaskTag = xrpAddr.xAddr;
      smgAddress = xrpAddr.rAddr;
      tag = xrpAddr.tagId;
    }
    this.bridge.emit('ota', {taskId: this.id, address: this.ccTaskTag, smgAddress, tag});
    console.log("procOtaAddr: %O", this.ccTaskTag);
  }

  updateTaskStepData(stepNo, txHash, stepResult) {
    let records = this.bridge.stores.crossChainTaskRecords;
    const ccTaskRecords = records.ccTaskRecords;
    let ccTask = ccTaskRecords.get(this.id);    
    if (ccTask) {
      if (records.updateTaskStepResult(this.id, stepNo, txHash, stepResult)) {
        this.bridge.emit("lock", {taskId: this.id, txHash});
      }
      this.bridge.storageService.save("crossChainTaskRecords", this.id, ccTask);
    }
  }

  genXAddressByTagId(tagId) {
    let records = this.bridge.stores.crossChainTaskRecords;
    let ccTask = records.ccTaskRecords.get(this.id);
    let gpk = '';
    for (let i = 0; i < ccTask.assetSMGs.length; i++) {
      if (ccTask.assetSMGs[i].id === ccTask.storemanGroup) {
        if (0 == ccTask.assetSMGs[i].curve1) {
          gpk = ccTask.assetSMGs[i].gpk1;
        }else{
          gpk = ccTask.assetSMGs[i].gpk2;
        }
      }
    }
    let pubkey = Secp256k1.keyFromPublic("04"+ gpk.slice(2), 'hex');
    let compressed = pubkey.getPublic(true, 'hex');
    let deriveAddress = keypairs.deriveAddress(compressed.toUpperCase());
    let xrpXAddr = xrpAddrCodec.classicAddressToXAddress(deriveAddress, tagId);
    // let xrpRAddr = xrpAddrCodec.xAddressToClassicAddress(xrpXAddr);
    // console.log("storeman address: %s", deriveAddress);
    let xrpAddr = {
      xAddr: xrpXAddr,
      rAddr: deriveAddress,
      tagId
    }
    return xrpAddr;
  }  
}

module.exports = BridgeTask;