const tool = require("../utils/tool.js");
const keypairs = require('ripple-keypairs');
const elliptic = require('elliptic');
const Secp256k1 = elliptic.ec('secp256k1');
const xrpAddrCodec = require('ripple-address-codec');
const polkaUtil = require("@polkadot/util");
const polkaUtilCrypto = require("@polkadot/util-crypto");
const { Keyring } = require('@polkadot/api');
const CrossChainTask = require('./stores/CrossChainTask');
const BigNumber = require("bignumber.js");
const Wallet = require("./wallet/wallet.js");

class BridgeTask {
  constructor(bridge, assetPair, direction, fromAccount, toAccount, amount, wallet) {
    this.id = Date.now();
    this._bridge = bridge;
    this._assetPair = assetPair;
    this._direction = direction;
    this._fromAccount = fromAccount;
    this._toAccount = toAccount;
    this._amount = new BigNumber(amount).toFixed();
    this._wallet = wallet;
    let fromChainInfo = {
      symbol: assetPair.fromSymbol,
      decimals: assetPair.fromDecimals,
      chainType: assetPair.fromChainType,
      chainName: assetPair.fromChainName
    };
    let toChainInfo = {
      symbol: assetPair.toSymbol,
      decimals: assetPair.toDecimals,
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
    // smg info
    this._smg = null;
    this._secp256k1Gpk = '';
    // server side para
    this._quota = null;
    this._fee = null;
    // storage
    this._task = new CrossChainTask(this.id);
    // runtime context
    this._ota = '';
  }

  async init() {
    console.debug("bridgeTask init at %s ms", tool.getCurTimestamp());
    // check
    let validWallet = await this._bridge.checkWallet(this._assetPair, this._direction, this._wallet);
    if (!validWallet) {
      throw new Error("Invalid wallet");
    }
    this._initToWallet();
    let err = await this._checkFee();
    if (err) {
      throw new Error(err);
    }
    err = await this._checkSmg(); // depends on fee
    if (err) {
      throw new Error(err);
    }
    let [fromAccountErr, toAccountErr] = await Promise.all([
      this._checkFromAccount(),
      this._checkToAccount()
    ]);
    err = fromAccountErr || toAccountErr;
    if (err) {
      throw new Error(err);
    }

    // set task data
    let assetPair = this._assetPair;
    let taskData = {
      assetPairId: assetPair.assetPairId,
      assetType: assetPair.assetType,
      decimals: assetPair.decimals,
      protocol: assetPair.protocol,
      direction: this._direction,
      amount: this._amount,
      fromAccount: this._fromAccount,
      toAccount: this._toAccount,
      toChainName: this._toChainInfo.chainName,
      fromSymbol: this._fromChainInfo.symbol,
      toSymbol: this._toChainInfo.symbol,
      fromDecimals: this._fromChainInfo.decimals,
      toDecimals: this._toChainInfo.decimals,
      fromChainType: this._fromChainInfo.chainType,
      toChainType: this._toChainInfo.chainType,
      fromChainName: this._fromChainInfo.chainName,
      toChainName: this._toChainInfo.chainName,
      isOtaTx: !this._wallet,
      fee: this._fee,
      smg: this._smg
    };
    // console.debug({taskData});
    this._task.setTaskData(taskData);
  }

  async start() {
    console.debug("bridgeTask start at %s ms", tool.getCurTimestamp());

    // build steps
    console.debug("bridgeTask _checkTaskSteps at %s ms", tool.getCurTimestamp());
    let errInfo = await this._checkTaskSteps();
    if (errInfo) {
      throw new Error(errInfo);
    }
    this._task.setTaskData({status: "Performing"});

    // save context
    let bridge = this._bridge;
    let ccTaskData = this._task.ccTaskData;
    let taskSteps = bridge.stores.crossChainTaskSteps.mapCCTaskStepsArray.get(this.id);
    this._task.setTaskData({stepData: taskSteps});
    bridge.stores.crossChainTaskRecords.addNewTradeTask(ccTaskData);
    await bridge.storageService.save("crossChainTaskRecords", ccTaskData.ccTaskId, ccTaskData);

    // background process
    this._parseTaskStatus(taskSteps);
  }

  async _initToWallet() {
    if (this._toChainInfo.chainType === "DOT") {
      let provider = this._bridge.network;
      this._toWallet = new Wallet("polkadot{.js}", provider);
    }
  }

  async _checkFee() {
    this._fee = await this._bridge.estimateFee(this._assetPair, this._direction);
    let unit = this._assetPair.assetType;
    let fee = tool.parseFee(this._fee, this._amount, unit, this._assetPair.decimals);
    if (new BigNumber(fee).gte(this._amount)) { // input amount includes fee
      console.error("Amount is too small to pay the fee: %s %s", fee, unit);
      return "Amount is too small to pay the fee";
    }
    return "";
  }

  // depends on fee
  async _checkSmg() {
    // get active smg
    this._smg = await this._bridge.getSmgInfo();
    this._secp256k1Gpk = (0 == this._smg.curve1)? this._smg.gpk1 : this._smg.gpk2;
    // check quota
    let fromChainType = this._fromChainInfo.chainType;
    let unit = this._assetPair.assetType;
    if (this._smg.changed) { // optimize for mainnet getQuota performance issue
      this._quota = await this._bridge.storemanService.getStroremanGroupQuotaInfo(fromChainType, this._assetPair.assetPairId, this._smg.id);
      console.debug("%s %s %s quota: %O", this._direction, this._amount, this._assetPair.assetType, this._quota);
      let amount = new BigNumber(this._amount);
      if (amount.gt(this._quota.maxQuota)) {
        return "Exceed maxQuota";
      }
      let fee = tool.parseFee(this._fee, this._amount, unit, this._assetPair.decimals);
      let expectedReceivedValue = amount.minus(fee);
      if (this._quota.minQuota > 0) {
        if (expectedReceivedValue.lt(this._quota.minQuota)) {
          return "Less than minValue";
        }
      } else if (expectedReceivedValue.lte(0)) {
        return "Amount is too small";
      }
    }
    // check activating balance
    let chainInfo = this._bridge.chainInfoService.getChainInfoByType(fromChainType);
    if (chainInfo.minReserved && (this._direction === "MINT") && (this._assetPair.fromAccount == 0)) { // only mint coin need to check smg balance
      let smgAddr = this._getSmgAddress(fromChainType);
      let smgBalance = await this._bridge.storemanService.getAccountBalance(this._assetPair.assetPairId, "MINT", smgAddr, {wallet: this._wallet, isCoin: true});
      console.debug("%s smgAddr %s balance: %s", fromChainType, smgAddr, smgBalance.toFixed());
      let estimateBalance = smgBalance.plus(this._amount);
      if (estimateBalance.lt(chainInfo.minReserved)) {
        let diff = new BigNumber(chainInfo.minReserved).minus(smgBalance);
        console.error("Amount is too small to activate smg, at least %s %s", diff.toFixed(), unit);
        return "Amount is too small to activate smg";
      }
    }
    // check xrp token trust line
    if ((fromChainType === "XRP") && (this._direction === "MINT") && (this._assetPair.fromAccount != 0)) { // only mint token need to check smg trust line
      if (!this._bridge.validateXrpTokenAmount(this._amount)) {
        return "Amount out of range";
      }
      let smgAddr = this._getSmgAddress(fromChainType);
      let line = await this._bridge.storemanService.getXrpTokenTrustLine(this._assetPair.fromAccount, smgAddr);
      if ((!line) || line.limit.minus(line.balance).lt(this._amount)) {
        console.debug("%s smgAddr %s token %s trust line: %s", fromChainType, smgAddr, this._assetPair.assetType, line? line.limit.minus(line.balance).toFixed() : "0");
        return "No trust line or liquidity not enough";
      }
    }
    return "";
  }

  async _checkFromAccount() {
    if (!this._fromAccount) { // third party wallet
      return "";
    }
    let coinBalance  = await this._bridge.storemanService.getAccountBalance(this._assetPair.assetPairId, this._direction, this._fromAccount, {wallet: this._wallet, isCoin: true, keepAlive: true});
    let assetBalance = await this._bridge.storemanService.getAccountBalance(this._assetPair.assetPairId, this._direction, this._fromAccount, {wallet: this._wallet});
    let unit = tool.getCoinSymbol(this._fromChainInfo.chainType, this._fromChainInfo.chainName);
    let requiredCoin = new BigNumber(0);
    let requiredAsset = 0;
    if (this._assetPair.assetType === unit) { // asset is coin
      requiredCoin = requiredCoin.plus(this._amount); // includes fee
      requiredAsset = 0;
      this._task.setTaskData({fromAccountBalance: coinBalance.toFixed()});
    } else {
      let chainInfo = this._bridge.chainInfoService.getChainInfoByType(this._fromChainInfo.chainType);
      requiredCoin = requiredCoin.plus(tool.parseFee(this._fee, this._amount, unit, chainInfo.chainDecimals));
      requiredAsset = this._amount;
      this._task.setTaskData({fromAccountBalance: assetBalance.toFixed()});
    }
    if (coinBalance.lt(requiredCoin)) {
      console.debug("required coin balance: %s/%s", requiredCoin.toFixed(), coinBalance.toFixed());
      return this._bridge.globalConstant.ERR_INSUFFICIENT_BALANCE;
    }
    if (this._assetPair.protocol === "Erc20") {
      if (assetBalance.lt(requiredAsset)) {
        console.debug("required asset balance: %s/%s", requiredAsset, assetBalance.toFixed());
        return this._bridge.globalConstant.ERR_INSUFFICIENT_TOKEN_BALANCE;
      }
    } else { // erc721
      let isOwnable = await this._bridge.storemanService.checkAccountOwnership(this._assetPair.assetPairId, this._direction, this._fromAccount, this._amount);
      if (!isOwnable) {
        console.debug("%s not owne token %d", this._fromAccount, this._amount);
        return this._bridge.globalConstant.ERR_NOT_OWNER;
      }
    }
    return "";
  }

  async _checkToAccount() {
    // check activating balance
    let chainInfo = this._bridge.chainInfoService.getChainInfoByType(this._toChainInfo.chainType);
    if (chainInfo.minReserved) {
      let balance = await this._bridge.storemanService.getAccountBalance(this._assetPair.assetPairId, "MINT", this._toAccount, {wallet: this._toWallet, isCoin: true});
      console.debug("toAccount %s balance: %s", this._toAccount, balance.toFixed());
      let unit = this._assetPair.assetType;
      let fee = tool.parseFee(this._fee, this._amount, unit, this._assetPair.decimals);
      let estimateBalance = balance.plus(this._amount).minus(fee);
      if (estimateBalance.lt(chainInfo.minReserved)) {
        let diff = new BigNumber(chainInfo.minReserved).minus(balance);
        console.error("Amount is too small to activate toAccount, at least %s %s", diff.toFixed(), this._fromChainInfo.symbol);
        return "Amount is too small to activate toAccount";
      }
    }
    return "";
  }

  async _checkTaskSteps() {
    let ccTaskData = this._task.ccTaskData;
    // to get the stepsFunc from server api
    let convert = {
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
      fee: this._fee,
      wallet: this._wallet
    }; 
    // console.debug("checkTaskSteps: %O", convert);
    let stepInfo = await this._bridge.storemanService.getConvertInfo(convert);
    // console.debug("getConvertInfo: %O", stepInfo);
    if (stepInfo.stepNum > 0) {
      this._task.setTaskData({stepNums: stepInfo.stepNum});
      return "";
    } else {
      return this._getErrInfo(stepInfo.errCode);
    }
  }

  async _parseTaskStatus(ccTaskStepsArray) {
    console.debug("bridgeTask _parseTaskStatus at %s ms", tool.getCurTimestamp());
    console.debug("task %s steps: %d", this.id, ccTaskStepsArray.length);
    let curStep = 0, executedStep = -1, stepTxHash = "";
    for (; curStep < ccTaskStepsArray.length; ) {
      let taskStep = ccTaskStepsArray[curStep];
      let stepResult = taskStep.stepResult;
      if (!stepResult) {
        if (taskStep.txHash && !stepTxHash) {
          this._updateTaskByStepData(taskStep.stepIndex, taskStep.txHash, ""); // only update txHash, no result
          stepTxHash = taskStep.txHash;
        }
        if (executedStep != curStep) {
          console.debug("bridgeTask _parseTaskStatus step %s at %s ms", curStep, tool.getCurTimestamp());
          await this._bridge.storemanService.processTxTask(taskStep, this._wallet);
          executedStep = curStep;
        } else {
          await tool.sleep(5000);
        }
        continue;
      }
      console.debug("check task %d step %d: %O", this.id, curStep, taskStep);
      if (["Failed", "Rejected"].includes(stepResult)) { // ota stepResult contains ota address, XRP tagId or BTC randomId
        this._updateTaskByStepData(taskStep.stepIndex, taskStep.txHash, stepResult, taskStep.errInfo);
        this._bridge.emit("error", {taskId: this.id, reason: taskStep.errInfo || stepResult});
        break;
      }
      if (!this._wallet) {
        this._procOtaAddr(stepResult);
      } else if ((taskStep.name === "erc20Approve") && (this._fromChainInfo.chainType === "MOVR")) {
        await tool.sleep(30000); // wait Moonbeam approve take effect
      }
      this._updateTaskByStepData(taskStep.stepIndex, taskStep.txHash, stepResult, taskStep.errInfo);
      curStep++;
      stepTxHash = "";
    }
  }

  _procOtaAddr(stepResult) {
    if (this._ota) {
      return;
    }
    let records = this._bridge.stores.crossChainTaskRecords;
    let chainType = this._fromChainInfo.chainType;
    let ota = {taskId: this.id};
    if (["BTC", "LTC", "DOGE"].includes(chainType)) {
      records.setTaskOtaInfo(this.id, {address: stepResult.address, randomId: stepResult.randomId});
      this._ota = stepResult.address;
      ota.address = this._ota;
    } else if (chainType === "XRP") {
      let xrpAddr = this._getXAddressByTagId(stepResult);
      records.setTaskOtaInfo(this.id, {address: xrpAddr.xAddr, tagId: xrpAddr.tagId, rAddress: xrpAddr.rAddr});
      this._ota = xrpAddr.xAddr;
      ota.address = this._ota;
      ota.rAddress = xrpAddr.rAddr;
      ota.tagId = xrpAddr.tagId;
    } else {
      throw new Error("Invalid ota chain type " + chainType);
    }
    this._bridge.emit("ota", ota);
    console.debug("%s OTA: %O", chainType, ota);
  }

  _updateTaskByStepData(stepIndex, txHash, stepResult, errInfo = "") {
    let records = this._bridge.stores.crossChainTaskRecords;
    const ccTaskRecords = records.ccTaskRecords;
    let ccTask = ccTaskRecords.get(this.id);    
    if (ccTask) {
      let isLockTx = records.updateTaskByStepResult(this.id, stepIndex, txHash, stepResult, errInfo);
      if (isLockTx) {
        let lockEvent = {taskId: this.id, txHash};
        console.debug("lockTxHash: %O", lockEvent);
        this._bridge.emit("lock", lockEvent);
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

  _getSmgPolkaAddress() {
    let format = ("testnet" === this._bridge.network)? tool.PolkadotSS58Format.westend : tool.PolkadotSS58Format.polkadot;
    let pubKey = '0x04' + this._secp256k1Gpk.slice(2);
    const compressed = polkaUtilCrypto.secp256k1Compress(polkaUtil.hexToU8a(pubKey));
    const hash = polkaUtilCrypto.blake2AsU8a(compressed);
    const keyring = new Keyring({type: 'ecdsa', ss58Format: format});
    const smgAddr = keyring.encodeAddress(hash);
    return smgAddr;
  }

  _getSmgAddress(chainType) {
    if ("XRP" === chainType) {
      return this._getSmgXrpClassicAddress();
    } else if ("DOT" === chainType) {
      return this._getSmgPolkaAddress();
    } else {
      throw new Error("Unknown " + chainType + " smg address");
    }
  }

  _getErrInfo(errCode) {
    if (typeof(errCode) === "string") {
      return errCode;
    } else if (errCode && errCode.message) {
      return errCode.message;
    } else {
      this._bridge.globalConstant.ERR_OTHER_UNKNOWN_ERR;
    }
  }
}

module.exports = BridgeTask;