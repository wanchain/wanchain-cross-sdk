const tool = require("../utils/tool.js");
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
  constructor(bridge, assetPair, direction, fromAccount, toAccount, amount, wallet) {
    this.id = Date.now();
    this._bridge = bridge;
    this._assetPair = assetPair;
    this._direction = direction;
    this._fromAccount = fromAccount;
    this._toAccount = toAccount;
    this._amount = parseFloat(amount);
    this._wallet = wallet;
    this._smg = assetPair.smgs[this._bridge.smgIndex % assetPair.smgs.length];
    this._secp256k1Gpk = (0 == this._smg.curve1)? this._smg.gpk1 : this._smg.gpk2;
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
    if (this._direction == 'MINT') {
      this._fromChainInfo = fromChainInfo;
      this._toChainInfo = toChainInfo;
    } else {
      this._fromChainInfo = toChainInfo;
      this._toChainInfo = fromChainInfo;
    }
    // server side para
    this._quota = null;
    this._fee = null;
    // storage
    this._task = new CrossChainTask(this.id);
    // runtime context
    this._curStep = 0;
    this._executedStep = -1;
    this._ota = '';
  }

  async init() {
    let validWallet = await this._bridge.checkWallet(this._assetPair, this._direction, this._wallet);
    if (!validWallet) {
      throw "Invalid wallet";
    }
    let feeErr = await this._checkFee();
    if (feeErr) {
      throw feeErr;
    }
    let smgErr = await this._checkSmg();
    if (smgErr) {
      throw smgErr;
    }
    if (this._fromAccount) {
      let fromAccountErr = await this._checkFromAccount();
      if (fromAccountErr) {
        throw fromAccountErr;
      }
    }
    let toAccountErr = await this._checkToAccount();
    if (toAccountErr) {
      throw toAccountErr;
    }    
  }

  async start() {
    let bridge = this._bridge;
    let assetPair = this._assetPair;
    let ccTaskData = this._task.ccTaskData;    

    // task
    let jsonTaskAssetPair = {
      assetPairId: assetPair.assetPairId,
      assetType: assetPair.assetType,
      direction: this._direction,
      fromSymbol: this._fromChainInfo.symbol,
      toSymbol: this._toChainInfo.symbol,
      fromChainType: this._fromChainInfo.chainType,
      toChainType: this._toChainInfo.chainType,
      fromChainName: this._fromChainInfo.chainName,
      toChainName: this._toChainInfo.chainName,
      smg: this._smg,
    };
    console.debug("jsonTaskAssetPair: %O", jsonTaskAssetPair);

    this._task.setTaskAssetPair(jsonTaskAssetPair);
    this._task.setFee(this._fee);
    this._task.setOtaTx(!this._wallet);
    this._task.setTaskAccountAddress('From', this._fromAccount);
    this._task.setTaskAccountAddress('To', this._toAccount);
    this._task.setTaskAmount(this._amount);

    // build steps
    let errInfo = await this._checkTaskSteps();
    if (errInfo) {
      bridge.emit("error", {taskId: this.id, reason: errInfo});
      return;
    }

    // save context
    ccTaskData.status = "Performing";
    let taskSteps = bridge.stores.crossChainTaskSteps.mapCCTaskStepsArray.get(this.id);
    ccTaskData.stepData = taskSteps;
    // console.log("ccTaskData: %O", ccTaskData);
    bridge.stores.crossChainTaskRecords.addNewTradeTask(ccTaskData);
    bridge.storageService.save("crossChainTaskRecords", ccTaskData.ccTaskId, ccTaskData);

    // background process
    this._parseTaskStatus(taskSteps);
  }

  async _checkFee() {
    this._fee = await this._bridge.estimateFee(this._assetPair, this._direction);
    if (this._amount <= this._fee.networkFee.value) {
      return ("Amount is too small, must greater than " + this._fee.networkFee.value + " " + this._fromChainInfo.symbol);
    }
    return "";
  }

  async _checkSmg() {
    // check timeout
    let curTime = tool.getCurTimeSec();
    if (curTime >= this._smg.endTime) {
      return "Smg timeout";
    }
    // check quota
    let fromChainType = this._fromChainInfo.chainType;
    this._quota = await this._bridge.storemanService.getStroremanGroupQuotaInfo(fromChainType, this._assetPair.assetPairId, this._smg.id);
    console.log("%s quota: %O", this._direction, this._quota);
    if (this._amount < this._quota.minQuota) {
      return "Less than minQuota";
    } else if (this._amount > this._quota.maxQuota) {
      return "Exceed maxQuota";
    }
    // check activating balance
    let smgAddr = "";
    let minValue = 0;
    if ("XRP" == fromChainType) {
      smgAddr = this._getSmgXrpClassicAddress();
      minValue = this._bridge.configService.getGlobalConfig("MinXrpValue");
    } else if ("DOT" == fromChainType) {
      smgAddr = this._genSmgPolkaAddress();
      minValue = this._bridge.configService.getGlobalConfig("MinDotValue");
    } else {
      return "";
    }
    let smgBalance = await this._bridge.storemanService.getAccountBalance(this._assetPair.assetPairId, "MINT", smgAddr, true);
    console.log("%s smgAddr %s balance: %s", fromChainType, smgAddr, smgBalance.toString());
    let estimateBalance = parseFloat(smgBalance) + this._amount;
    if (estimateBalance < minValue) {
      let diff = parseFloat(minValue) - parseFloat(smgBalance);
      return ("The amount is too small, at least " + diff + " " + this._fromChainInfo.symbol);
    }
  }

  async _checkFromAccount() {
    let coinBalance  = await this._bridge.storemanService.getAccountBalance(this._assetPair.assetPairId, this._direction, this._fromAccount, true);
    let assetBalance = await this._bridge.storemanService.getAccountBalance(this._assetPair.assetPairId, this._direction, this._fromAccount, false);
    let requiredCoin = this._fee.operateFee.value;
    let requiredAsset = this._amount;
    if ((this._assetPair.fromAccount == 0) && (this._direction == "MINT")) { // asset is coin
      requiredCoin = requiredCoin + requiredAsset;
      requiredAsset = 0;
      this._task.setFromAccountBalance(coinBalance);
    } else {
      this._task.setFromAccountBalance(assetBalance);
    }
    if (coinBalance < requiredCoin) {
      return ("Insufficient " + this._fromChainInfo.chainType + " balance");
    }
    if (assetBalance < requiredAsset) {
      return ("Insufficient " + this._fromChainInfo.symbol + " balance");
    }
  }

  async _checkToAccount() {
    // check activating balance
    let toChainType = this._toChainInfo.chainType;
    let minValue = 0;
    if ("XRP" == toChainType) {
      minValue = this._bridge.configService.getGlobalConfig("MinXrpValue");
    } else if ("DOT" == toChainType) {
      minValue = this._bridge.configService.getGlobalConfig("MinDotValue");
    } else {
      return "";
    }
    let balance = await this._bridge.storemanService.getAccountBalance(this._assetPair.assetPairId, "MINT", this._toAccount, true);
    console.log("toAccount %s balance: %s", this._toAccount, balance);
    let estimateBalance = parseFloat(balance) + this._amount;
    if (estimateBalance < minValue) {
      let diff = parseFloat(minValue) - parseFloat(balance);
      return ("Amount is too small, at least " + diff + " " + this._toChainInfo.symbol);
    }
  }

  async _checkTaskSteps() {
    let ccTaskData = this._task.ccTaskData;
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
      storemanGroupGpk: this._secp256k1Gpk,
      value: ccTaskData.amount,
      wallet: this._wallet
    }; 
    // console.log("checkTaskSteps: %O", convertJson);
    let stepInfo = await this._bridge.storemanService.getConvertInfo(convertJson);
    // console.log("getConvertInfo: %O", stepInfo);
    if (stepInfo.stepNum > 0) {
      this._task.setTaskStepNums(stepInfo.stepNum);
      return "";
    } else {
      return this._getErrInfo(stepInfo.errCode);
    }
  }

  async _parseTaskStatus(ccTaskStepsArray) {
    console.log("task %s steps: %d", this.id, ccTaskStepsArray.length);
    for (; this._curStep < ccTaskStepsArray.length; ) {
      let taskStep = ccTaskStepsArray[this._curStep];
      console.debug("check task %d step %d: %O", this.id, this._curStep, taskStep);
      let stepResult = taskStep.stepResult;
      if (!stepResult) {
        if (this._executedStep != this._curStep) {
          let jsonStepHandle = taskStep.jsonParams;
          // to call server to execute the api
          await this._bridge.storemanService.processTxTask(jsonStepHandle, this._wallet);
          this._executedStep = this._curStep;
        }
        await tool.sleep(10000);
        continue;
      }
      if (["Failed", "Rejected"].includes(stepResult)) { // ota stepResult is tag value or ota address
        this._updateTaskStepData(taskStep.stepNo, taskStep.txHash, stepResult);
        this._bridge.emit('error', {taskId: this.id, reason: stepResult});
        break;
      }
      if (!this._wallet) {
        this._procOtaAddr(taskStep);
      } else if ((taskStep.jsonParams.name == "erc20Approve") && (this._fromChainInfo.chainType == "DEV")) {
        await tool.sleep(30000); // wait Moonbeam approve take effect
      }
      this._updateTaskStepData(taskStep.stepNo, taskStep.txHash, stepResult);
      this._curStep++;
    }
  }

  _procOtaAddr(taskStep) {
    if (this._ota) {
      return;
    }
    let records = this._bridge.stores.crossChainTaskRecords;
    let chainType = this._fromChainInfo.chainType;
    let ota = {taskId: this.id};
    if (['BTC', 'LTC'].includes(chainType)) {
      records.attachTagIdByTaskId(this.id, taskStep.stepResult);
      this._ota = taskStep.stepResult;
      ota.address = this._ota;
    } else if (chainType == 'XRP') {
      let xrpAddr = this._getXAddressByTagId(taskStep.stepResult);
      records.attachTagIdByTaskId(this.id, xrpAddr.xAddr, xrpAddr.tagId, xrpAddr.rAddr);
      this._ota = xrpAddr.xAddr;
      ota.address = this._ota;
      ota.rAddress = xrpAddr.rAddr;
      ota.tagId = xrpAddr.tagId;
    } else {
      throw ("Invalid ota chain type " + chainType);
    }
    this._bridge.emit('ota', ota);
    console.log("%s OTA: %O", chainType, ota);
  }

  _updateTaskStepData(stepNo, txHash, stepResult) {
    let records = this._bridge.stores.crossChainTaskRecords;
    const ccTaskRecords = records.ccTaskRecords;
    let ccTask = ccTaskRecords.get(this.id);    
    if (ccTask) {
      if (records.updateTaskStepResult(this.id, stepNo, txHash, stepResult)) {
        this._bridge.emit("lock", {taskId: this.id, txHash});
      }
      this._bridge.storageService.save("crossChainTaskRecords", this.id, ccTask);
    }
  }

  _getSmgXrpClassicAddress() {
    let pubKey = Secp256k1.keyFromPublic("04" + this._secp256k1Gpk.slice(2), 'hex');
    let compressed = pubKey.getPublic(true, 'hex');
    let deriveAddress = keypairs.deriveAddress(compressed.toUpperCase());
    return deriveAddress;
  }

  _getXAddressByTagId(tagId) {
    let deriveAddress = this._getSmgXrpClassicAddress();
    let xrpXAddr = xrpAddrCodec.classicAddressToXAddress(deriveAddress, tagId);
    let xrpAddr = {
      xAddr: xrpXAddr,
      rAddr: deriveAddress,
      tagId
    }
    return xrpAddr;
  }

  _genSmgPolkaAddress() {
    let format = ("testnet" === this._bridge.network)? dotTxWrapper.WESTEND_SS58_FORMAT : dotTxWrapper.POLKADOT_SS58_FORMAT;
    let pubKey = '0x04' + this._secp256k1Gpk.slice(2);
    const compressed = polkaUtilCrypto.secp256k1Compress(polkaUtil.hexToU8a(pubKey));
    const hash = polkaUtilCrypto.blake2AsU8a(compressed);
    const keyring = new Keyring({type: 'ecdsa', ss58Format: format});
    const smgAddr = keyring.encodeAddress(hash);
    return smgAddr;
  }

  _getErrInfo(errCode) {
    let ERR_CODE = this._bridge.globalConstant;
    switch(errCode) {
      case ERR_CODE.ERR_INSUFFICIENT_BALANCE:
        return "Insufficient balance";
      case ERR_CODE.ERR_INSUFFICIENT_GAS:
          return "Insufficient gas";
      case ERR_CODE.ERR_INSUFFICIENT_TOKEN_BALANCE:
        return "Insufficient asset";
      default:
        return "Unknown error";
    }
  }
}

module.exports = BridgeTask;