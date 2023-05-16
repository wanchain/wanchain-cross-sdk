const tool = require("../utils/tool.js");
const keypairs = require('ripple-keypairs');
const elliptic = require('elliptic');
const Secp256k1 = elliptic.ec('secp256k1');
const xrpAddrCodec = require('ripple-address-codec');
const CrossChainTask = require('./stores/CrossChainTask');
const BigNumber = require("bignumber.js");
const util = require('util');

// consistant with crosschain contract
const MAX_NFT_BATCH_SIZE = 10;

class BridgeTask {
  constructor(bridge, tokenPair, direction, fromAccount, toAccount, amount, wallet) {
    this.id = Date.now();
    this._bridge = bridge;
    this._tokenPair = tokenPair;
    this._direction = direction;
    this._fromAccount = fromAccount;
    this._toAccount = toAccount;
    if (tokenPair.protocol === "Erc20") {
      this._amount = new BigNumber(amount).toFixed();
    } else {
      if (amount.length > MAX_NFT_BATCH_SIZE) {
        throw new Error("Max NFT batch size is " + MAX_NFT_BATCH_SIZE);
      }
      this._amount = amount;
    }
    this._wallet = wallet;
    let fromChainInfo = {
      symbol: tokenPair.fromSymbol,
      decimals: tokenPair.fromDecimals,
      chainType: bridge.tokenPairService.getChainType(tokenPair.fromChainName),
      chainName: tokenPair.fromChainName
    };
    let toChainInfo = {
      symbol: tokenPair.toSymbol,
      decimals: tokenPair.toDecimals,
      chainType: bridge.tokenPairService.getChainType(tokenPair.toChainName),
      chainName: tokenPair.toChainName
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
    let validWallet = await this._bridge.checkWallet(this._fromChainInfo.chainName, this._wallet);
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
    let taskData = {
      assetPairId: this._tokenPair.id,
      assetType: this._tokenPair.readableSymbol,
      assetAlias: this._tokenPair.assetAlias,
      protocol: this._tokenPair.protocol,
      direction: this._direction,
      amount: this._amount,
      bridge: this._tokenPair.bridge,
      fromAccount: this._fromAccount,
      toAccount: this._toAccount,
      fromChainName: this._fromChainInfo.chainName,
      toChainName: this._toChainInfo.chainName,
      fromSymbol: this._fromChainInfo.symbol,
      toSymbol: this._toChainInfo.symbol,
      fromDecimals: this._fromChainInfo.decimals,
      toDecimals: this._toChainInfo.decimals,
      fromChainType: this._fromChainInfo.chainType,
      toChainType: this._toChainInfo.chainType,
      isOtaTx: !this._wallet,
      fee: this._fee,
      smg: this._smg
    };
    // console.debug({taskData});
    this._task.setTaskData(taskData);
  }

  async start() {
    console.debug("bridgeTask start at %s ms", tool.getCurTimestamp());
    // build
    let steps = await this._buildTaskSteps();
    this._task.initSteps(steps);
    this._task.setTaskData({status: "Performing"});
    // save context
    let bridge = this._bridge;
    let ccTaskData = this._task.ccTaskData;
    bridge.stores.crossChainTaskRecords.addNewTradeTask(ccTaskData);
    await bridge.storageService.save("crossChainTaskRecords", ccTaskData.ccTaskId, ccTaskData);
    // process
    this._procTaskSteps();
  }

  async _initToWallet() {
    let chainType = this._toChainInfo.chainType;
    if (["DOT", "PHA"].includes(chainType)) {
      let provider = this._bridge.network;
      let extension = this._bridge.configService.getExtension(chainType);
      this._toWallet = new extension.PolkadotJsWallet(provider, this._toChainInfo.chainName);
    }
  }

  async _checkFee() {
    let options = {protocol: this._tokenPair.protocol};
    let isErc20 = (this._tokenPair.protocol === "Erc20");
    if (!isErc20) {
      options.batchSize = this._amount.length;
    }
    // should use assetAlias as assetType to call bridge external api
    this._fee = await this._bridge.estimateFee((this._tokenPair.assetAlias || this._tokenPair.readableSymbol), this._fromChainInfo.chainName, this._toChainInfo.chainName, options);
    if (isErc20) {
      let fee = tool.parseFee(this._fee, this._amount, this._tokenPair.readableSymbol);
      if (new BigNumber(fee).gte(this._amount)) { // input amount includes fee
        console.error("Amount is too small to pay the bridge fee: %s %s", fee, this._tokenPair.readableSymbol);
        return "Amount is too small to pay the bridge fee";
      }
    }
    return "";
  }

  // depends on fee
  async _checkSmg() {
    // get active smg
    this._smg = await this._bridge.getSmgInfo();
    if (this._tokenPair.bridge) { // only for unifying process flow, other bridge do not care smg
      return "";
    }
    this._secp256k1Gpk = (0 == this._smg.curve1)? this._smg.gpk1 : this._smg.gpk2;
    if (this._tokenPair.protocol !== "Erc20") { // only Erc20 need to check token smg balance
      return "";
    }
    // check quota
    let fromChainType = this._fromChainInfo.chainType;
    if (this._smg.changed) { // optimize for mainnet getQuota performance issue
      this._quota = await this._bridge.storemanService.getStroremanGroupQuotaInfo(fromChainType, this._tokenPair.id, this._smg.id);
      console.debug("%s %s %s quota: %O", this._direction, this._amount, this._tokenPair.readableSymbol, this._quota);
      let networkFee = tool.parseFee(this._fee, this._amount, this._tokenPair.readableSymbol, {feeType: "networkFee"});
      let agentAmount = new BigNumber(this._amount).minus(networkFee); // use agent amount to check maxQuota and minValue, which include agentFee, exclude networkFee
      if (agentAmount.gt(this._quota.maxQuota)) {
        return "Exceed maxQuota";
      } else if (agentAmount.lt(this._quota.minQuota)) {
        return "Amount is too small";
      }
    }
    // check activating balance
    let chainInfo = this._bridge.chainInfoService.getChainInfoByType(fromChainType);
    if ((!chainInfo.crossScAddr) && chainInfo.minReserved && (this._direction === "MINT") && (this._tokenPair.fromAccount == 0)) { // only mint coin on not-sc-chain need to check smg balance
      let smgAddr = this._getSmgAddress(fromChainType);
      let smgBalance = await this._bridge.storemanService.getAccountBalance(this._tokenPair.id, fromChainType, smgAddr, {wallet: this._wallet, isCoin: true});
      console.debug("%s smgAddr %s balance: %s", fromChainType, smgAddr, smgBalance.toFixed());
      let estimateBalance = smgBalance;
      let isLockCoin = (this._tokenPair.fromAccount == 0); // only release coin would change balance
      if (isLockCoin) {
        estimateBalance = estimateBalance.plus(this._amount);
      }
      if (estimateBalance.lt(chainInfo.minReserved)) {
        if (isLockCoin) {
          let diff = new BigNumber(chainInfo.minReserved).minus(smgBalance);
          console.error("Amount is too small to activate storeman account, at least %s %s", diff.toFixed(), this._tokenPair.readableSymbol);
          return "Amount is too small to activate storeman account";
        } else {
          return "Storeman account is inactive";
        }
      }
    }
    // check xrp token trust line
    if ((fromChainType === "XRP") && (this._direction === "MINT") && (this._tokenPair.fromAccount != 0)) { // only mint token from xrp need to check smg trust line
      if (!this._bridge.validateXrpTokenAmount(this._amount)) {
        return "Amount out of range";
      }
      let smgAddr = this._getSmgAddress(fromChainType);
      let line = await this._bridge.storemanService.getXrpTokenTrustLine(this._tokenPair.fromAccount, smgAddr);
      if ((!line) || line.limit.minus(line.balance).lt(this._amount)) {
        let token = tool.parseXrpTokenPairAccount(this._tokenPair.fromAccount, true).join(".");
        console.debug("Storeman has no trust line for %s: smg=%s, liquidity=%s", token, smgAddr, line? line.limit.minus(line.balance).toFixed() : "0");
        return "The XRPL token crosschain is being activated. Please try again later";
      }
    }
    return "";
  }

  async _checkFromAccount() {
    if (!this._fromAccount) { // third party wallet
      return "";
    }
    let chainType = this._fromChainInfo.chainType;
    let coinBalance  = await this._bridge.storemanService.getAccountBalance(this._tokenPair.id, chainType, this._fromAccount, {wallet: this._wallet, isCoin: true, keepAlive: true});
    let assetBalance = await this._bridge.storemanService.getAccountBalance(this._tokenPair.id, chainType, this._fromAccount, {wallet: this._wallet});
    let coinSymbol = tool.getCoinSymbol(this._fromChainInfo.chainType, this._fromChainInfo.chainName);
    let requiredCoin = new BigNumber(0);
    let requiredAsset = 0;
    if (this._tokenPair.readableSymbol === coinSymbol) { // asset is coin
      requiredCoin = requiredCoin.plus(this._amount); // includes fee
      requiredAsset = 0;
      this._task.setTaskData({fromAccountBalance: coinBalance.toFixed()});
    } else {
      requiredCoin = requiredCoin.plus(tool.parseFee(this._fee, this._amount, coinSymbol));
      requiredAsset = this._amount;
      this._task.setTaskData({fromAccountBalance: assetBalance.toFixed()});
    }
    if (coinBalance.lt(requiredCoin)) {
      console.debug("required coin balance: %s/%s", requiredCoin.toFixed(), coinBalance.toFixed());
      return this._bridge.globalConstant.ERR_INSUFFICIENT_BALANCE;
    }
    if (this._tokenPair.protocol === "Erc20") {
      if (assetBalance.lt(requiredAsset)) {
        console.debug("required asset balance: %s/%s", requiredAsset, assetBalance.toFixed());
        return this._bridge.globalConstant.ERR_INSUFFICIENT_TOKEN_BALANCE;
      }
    }
    if ((chainType === "ADA") && (this._direction === "BURN")) { // check ADA collateral
      let collateral = await this._wallet.getCollateral();
      if (collateral.length === 0) {
        return this._bridge.globalConstant.ERR_NO_COLLATERAL;
      }
    }
    return "";
  }

  async _checkToAccount() {
    // check activating balance
    let chainInfo = this._bridge.chainInfoService.getChainInfoByType(this._toChainInfo.chainType);
    if (chainInfo.minReserved) {
      let balance = await this._bridge.storemanService.getAccountBalance(this._tokenPair.id, this._toChainInfo.chainType, this._toAccount, {wallet: this._toWallet, isCoin: true});
      console.debug("toAccount %s balance: %s", this._toAccount, balance.toFixed());
      let estimateBalance = balance;
      let isReleaseCoin = (this._tokenPair.fromAccount == 0); // only release coin would change balance
      if (isReleaseCoin) {
        let fee = tool.parseFee(this._fee, this._amount, this._tokenPair.readableSymbol);
        estimateBalance = estimateBalance.plus(this._amount).minus(fee);
      }
      if (estimateBalance.lt(chainInfo.minReserved)) {
        if (isReleaseCoin) {
          let diff = new BigNumber(chainInfo.minReserved).minus(balance);
          console.error("Amount is too small to activate recipient account, at least %s %s", diff.toFixed(), this._fromChainInfo.symbol);
          return "Amount is too small to activate recipient account";
        } else {
          return "Recipient account is inactive";
        }
      }
    }
    // check xrp token trust line
    if ((this._toChainInfo.chainType === "XRP") && (this._direction === "BURN") && (this._tokenPair.fromAccount != 0)) { // only burn token to xrp need to check recipient trust line
      if (!this._bridge.validateXrpTokenAmount(this._amount)) {
        return "Amount out of range";
      }
      let line = await this._bridge.storemanService.getXrpTokenTrustLine(this._tokenPair.fromAccount, this._toAccount);
      if ((!line) || line.limit.minus(line.balance).lt(this._amount)) {
        let token = tool.parseXrpTokenPairAccount(this._tokenPair.fromAccount, true).join(".");
        let reason = line? "Liquidity is not enough" : "No trust line";
        let msg = util.format("%s for %s", reason, token);
        console.debug("Recipient %s %s: liquidity=%s", this._toAccount, msg, line? line.limit.minus(line.balance).toFixed() : "0");
        return msg;
      }
    }
    return "";
  }

  async _buildTaskSteps() {
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
    let steps = await this._bridge.cctHandleService.getConvertInfo(convert);
    // console.debug("getConvertInfo: %O", steps);
    return steps;
  }

  async _procTaskSteps() {
    let steps = this._task.ccTaskData.stepData;
    console.debug("bridgeTask _procTaskSteps total %d at %s ms", steps.length, tool.getCurTimestamp());
    let curStep = 0, executedStep = -1, stepTxHash = "";
    for (; curStep < steps.length; ) {
      let taskStep = steps[curStep];
      let stepResult = taskStep.stepResult;
      if (!stepResult) {
        if (taskStep.txHash && !stepTxHash) {
          this._updateTaskByStepData(taskStep.stepIndex, taskStep.txHash, ""); // only update txHash, no result
          stepTxHash = taskStep.txHash;
        }
        if (executedStep != curStep) {
          console.debug("bridgeTask _procTaskSteps step %s at %s ms", curStep, tool.getCurTimestamp());
          await this._bridge.txTaskHandleService.processTxTask(taskStep, this._wallet);
          executedStep = curStep;
        } else {
          await tool.sleep(3000);
        }
        continue;
      }
      console.debug("proc task %d step %d: %O", this.id, curStep, taskStep);
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

  _updateTaskByStepData(stepIndex, txHash, stepResult, errInfo = "") { // for sync step result
    let records = this._bridge.stores.crossChainTaskRecords;
    let ccTask = records.ccTaskRecords.get(this.id);
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

  _getSmgAddress(chainType) {
    let extension = this._bridge.configService.getExtension(chainType);
    if (extension && extension.tool && extension.tool.gpk2Address) {
      return extension.tool.gpk2Address(this._secp256k1Gpk, chainType, this._bridge.network);
    } else if ("XRP" === chainType) {
      return this._getSmgXrpClassicAddress();
    } else { // only for not-sc-chain to check smg account, other chains should not call this function
      throw new Error("Unknown " + chainType + " smg address");
    }
  }
}

module.exports = BridgeTask;