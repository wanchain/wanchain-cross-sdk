const tool = require("../utils/commonTool.js");
const keypairs = require('ripple-keypairs');
const elliptic = require('elliptic');
const Secp256k1 = elliptic.ec('secp256k1');
const xrpAddrCodec = require('ripple-address-codec');
const dotTxWrapper = require('@substrate/txwrapper');
const polkaUtil = require("@polkadot/util");
const polkaUtilCrypto = require("@polkadot/util-crypto");
const { Keyring } = require('@polkadot/api');
const CrossChainTask = require('./stores/CrossChainTask');

class BridgeTask {
  constructor(bridge, assetPair, direction, fromAccount, toAccount, amount) {
    this.id = Date.now();
    this.bridge = bridge;
    this.assetPair = assetPair;
    this.direction = direction;
    this.fromAccount = fromAccount;
    this.toAccount = toAccount;
    this.amount = parseFloat(amount);
    this.smg = assetPair.smgs[this.bridge.smgIndex % assetPair.smgs.length];
    this.secp256k1Gpk = (0 == this.smg.curve1)? this.smg.gpk1 : this.smg.gpk2;
    let fromChainInfo = {
      symbol: assetPair.fromSymbol,
      chainType: assetPair.fromChainType,
      chainName: assetPair.fromChainName
    };
    let toChainInfo = {
      symbol: assetPair.toSymbol,
      chainType: assetPair.toChainType,
      chainName: assetPair.toChainName
    };
    if (this.direction == 'MINT') {
      this.fromChainInfo = fromChainInfo;
      this.toChainInfo = toChainInfo;
    } else {
      this.fromChainInfo = toChainInfo;
      this.toChainInfo = fromChainInfo;
    }
    // server side para
    this.quota = null;
    this.fee = null;
    // storage
    this.task = new CrossChainTask();
    // runtime context
    this.curStep = 0;
    this.executedStep = -1;
    this.isOtaTx = ["BTC", "XRP", "LTC"].includes(this.fromChainInfo.chainType);
    this.ota = '';
  }

  async init() {
    if (!this.bridge.checkWallet(this.assetPair, this.direction)) {
      throw "Invalid wallet";
    }
    let feeErr = await this.checkFee();
    if (feeErr) {
      throw feeErr;
    }
    let smgErr = await this.checkSmg();
    if (smgErr) {
      throw smgErr;
    }
    if (this.fromAccount) {
      let fromAccountErr = await this.checkFromAccount();
      if (fromAccountErr) {
        throw fromAccountErr;
      }
    }
    let toAccountErr = await this.checkToAccount();
    if (toAccountErr) {
      throw toAccountErr;
    }    
  }

  async checkFee() {
    this.fee = await this.bridge.estimateFee(this.assetPair, this.direction);
    if (this.amount <= this.fee.networkFee.value) {
      return ("Amount is too small, must greater than " + this.fee.networkFee.value + " " + this.fromChainInfo.symbol);
    }
    return "";
  }

  async checkSmg() {
    // check timeout
    let curTime = tool.getCurTimeSec();
    if (curTime >= this.smg.endTime) {
      return "Smg timeout";
    }
    // check quota
    let fromChainType = this.fromChainInfo.chainType;
    this.quota = await this.bridge.storemanService.getStroremanGroupQuotaInfo(fromChainType, this.assetPair.assetPairId, this.smg.id);
    console.log("%s quota: %O", this.direction, this.quota);
    if (this.amount < this.quota.minQuota) {
      return "Less than minQuota";
    } else if (this.amount > this.quota.maxQuota) {
      return "Exceed maxQuota";
    }
    // check activating balance
    let smgAddr = "";
    let minValue = 0;
    if ("XRP" == fromChainType) {
      smgAddr = this.getSmgXrpClassicAddress();
      minValue = this.bridge.configService.getGlobalConfig("MinXrpValue");
    } else if ("DOT" == fromChainType) {
      smgAddr = this.genSmgPolkaAddress();
      minValue = this.bridge.configService.getGlobalConfig("MinDotValue");
    } else {
      return "";
    }
    let smgBalance = await this.bridge.storemanService.getAccountBalance(this.assetPair.assetPairId, "MINT", smgAddr, true);
    console.log("smgAddr %s balance: %s", smgAddr, smgBalance);
    let estimateBalance = parseFloat(smgBalance) + this.amount;
    if (estimateBalance < minValue) {
      let diff = parseFloat(minValue) - parseFloat(smgBalance);
      return ("The amount is too small, at least " + diff + " " + this.fromChainInfo.symbol);
    }
  }

  async checkFromAccount() {
    let coinBalance  = await this.bridge.storemanService.getAccountBalance(this.assetPair.assetPairId, this.direction, this.fromAccount, true);
    let assetBalance = await this.bridge.storemanService.getAccountBalance(this.assetPair.assetPairId, this.direction, this.fromAccount, false);
    let requiredCoin = this.fee.operateFee.value;
    let requiredAsset = this.amount;
    if ((this.assetPair.fromAccount == 0) && (this.direction == "MINT")) { // asset is coin
      requiredCoin = requiredCoin + requiredAsset;
      requiredAsset = 0;
      this.task.setFromAccountBalance(coinBalance);
    } else {
      this.task.setFromAccountBalance(assetBalance);
    }
    if (coinBalance < requiredCoin) {
      return ("Insufficient " + this.fromChainInfo.chainType + " balance");
    }
    if (assetBalance < requiredAsset) {
      return ("Insufficient " + this.fromChainInfo.symbol + " balance");
    }
  }

  async checkToAccount() {
    // check activating balance
    let toChainType = this.toChainInfo.chainType;
    let minValue = 0;
    if ("XRP" == toChainType) {
      minValue = this.bridge.configService.getGlobalConfig("MinXrpValue");
    } else if ("DOT" == toChainType) {
      minValue = this.bridge.configService.getGlobalConfig("MinDotValue");
    } else {
      return "";
    }
    let balance = await this.bridge.storemanService.getAccountBalance(this.assetPair.assetPairId, "MINT", this.toAccount, true);
    console.log("toAccount %s balance: %s", this.toAccount, balance);
    let estimateBalance = parseFloat(balance) + this.amount;
    if (estimateBalance < minValue) {
      let diff = parseFloat(minValue) - parseFloat(balance);
      return ("Amount is too small, at least " + diff + " " + this.toChainInfo.symbol);
    }
  }

  async start() {
    let bridge = this.bridge;
    let assetPair = this.assetPair;
    let ccTaskData = this.task.ccTaskData;    

    // task
    let jsonTaskAssetPair = {
      assetPairId: assetPair.assetPairId,
      assetType: assetPair.assetType,
      direction: this.direction,
      fromSymbol: this.fromChainInfo.symbol,
      toSymbol: this.toChainInfo.symbol,
      fromChainType: this.fromChainInfo.chainType,
      toChainType: this.toChainInfo.chainType,
      fromChainName: this.fromChainInfo.chainName,
      toChainName: this.toChainInfo.chainName,
      smg: this.smg,
    };
    console.log("jsonTaskAssetPair: %O", jsonTaskAssetPair);

    this.task.setCCTaskID(this.id);
    this.task.setTaskAssetPair(jsonTaskAssetPair);
    this.task.setFee(this.fee);
    this.task.setOtaTx(this.isOtaTx);
    this.task.setTaskAccountAddress('From', this.fromAccount);
    this.task.setTaskAccountAddress('To', this.toAccount);
    this.task.setTaskAmount(this.amount);

    // build steps
    let bValidSteps = await this.checkTaskSteps();
    if (false === bValidSteps) {
      bridge.emit("error", {taskId: this.id, reason: "Can not convert"});
      return;
    }

    // save context
    ccTaskData.status = "Performing";
    let taskSteps = bridge.stores.crossChainTaskSteps.mapCCTaskStepsArray.get(this.id);
    ccTaskData.stepData = taskSteps;
    // console.log("ccTaskData: %O", ccTaskData);
    bridge.stores.crossChainTaskRecords.addNewTradeTask(ccTaskData);
    bridge.storageService.save("crossChainTaskRecords", ccTaskData.ccTaskId, ccTaskData);

    //excute
    this.parseTaskStatus(taskSteps);
  }

  async checkTaskSteps() {
    let ccTaskData = this.task.ccTaskData;
    // to get the stepsFunc from server api
    let convertJson = {
      ccTaskId: ccTaskData.ccTaskId,
      tokenPairId: ccTaskData.assetPairId,
      convertType: ccTaskData.convertType,
      fromSymbol: ccTaskData.fromSymbol,
      fromAddr: ccTaskData.fromAccount,
      toSymbol: ccTaskData.toSymbol,
      toAddr: ccTaskData.toAccount,
      storemanGroupId: ccTaskData.smg.id,
      storemanGroupGpk: this.secp256k1Gpk,
      value: ccTaskData.amount
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
      if (this.isOtaTx) {
        this.procOtaAddr(taskStep);
      }
      this.updateTaskStepData(taskStep.stepNo, taskStep.txHash, stepResult);
      this.curStep++;
    }
  }

  procOtaAddr(taskStep) {
    if (this.ota) {
      return;
    }
    let records = this.bridge.stores.crossChainTaskRecords;
    let chainType = this.fromChainInfo.chainType;
    let ota = {taskId: this.id};
    if (['BTC', 'LTC'].includes(chainType)) {
      records.attachTagIdByTaskId(this.id, taskStep.stepResult);
      this.ota = taskStep.stepResult;
      ota.address = this.ota;
    } else if (chainType == 'XRP') {
      let xrpAddr = this.getXAddressByTagId(taskStep.stepResult);
      records.attachTagIdByTaskId(this.id, xrpAddr.xAddr, xrpAddr.tagId, xrpAddr.rAddr);
      this.ota = xrpAddr.xAddr;
      ota.address = this.ota;
      ota.rAddress = xrpAddr.rAddr;
      ota.tagId = xrpAddr.tagId;
    } else {
      throw ("Invalid ota chain type " + chainType);
    }
    this.bridge.emit('ota', ota);
    console.log("procOtaAddr: %O", ota);
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

  getSmgXrpClassicAddress() {
    let pubKey = Secp256k1.keyFromPublic("04" + this.secp256k1Gpk.slice(2), 'hex');
    let compressed = pubKey.getPublic(true, 'hex');
    let deriveAddress = keypairs.deriveAddress(compressed.toUpperCase());
    return deriveAddress;
  }

  getXAddressByTagId(tagId) {
    let deriveAddress = this.getSmgXrpClassicAddress();
    let xrpXAddr = xrpAddrCodec.classicAddressToXAddress(deriveAddress, tagId);
    let xrpAddr = {
      xAddr: xrpXAddr,
      rAddr: deriveAddress,
      tagId
    }
    return xrpAddr;
  }

  genSmgPolkaAddress() {
    let format = ("testnet" === this.bridge.network)? dotTxWrapper.WESTEND_SS58_FORMAT : dotTxWrapper.POLKADOT_SS58_FORMAT;
    let pubKey = '0x04' + this.secp256k1Gpk.slice(2);
    const compressed = polkaUtilCrypto.secp256k1Compress(polkaUtil.hexToU8a(pubKey));
    const hash = polkaUtilCrypto.blake2AsU8a(compressed);
    const keyring = new Keyring({type: 'ecdsa', ss58Format: format});
    const smgAddr = keyring.encodeAddress(hash);
    console.log("DOT smgAddr: %s", smgAddr);
    return smgAddr;
  }
}

module.exports = BridgeTask;