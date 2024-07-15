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

const gpkAlgs = {
  ecdsa: 0,
  schnorr: 1,
  schnorr340: 2,
  ed25519: 3,
};

const gpkCurves = {
  secp256: 0,
  bn256: 1,
  ed25519: 2,
};

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
    this._gpkInfo = null;
    // server side para
    this._quota = null;
    this._fee = null;
    // storage
    this._task = new CrossChainTask(this.id);
    // runtime context
    this._ota = '';
  }

  async init(options) {
    console.debug("bridgeTask init at %s ms", tool.getCurTimestamp());
    // check
    let validWallet = await this._bridge.checkWallet(this._fromChainInfo.chainName, this._wallet);
    if (!validWallet) {
      throw new Error("Invalid wallet");
    }
    let err = await this._checkFee(options.isSubsidy);
    if (err) {
      throw new Error(err);
    }
    err = await this._checkSmg(); // depends on fee
    if (err) {
      throw new Error(err);
    }
    let [fromAccountErr, toAccountErr] = await Promise.all([
      this._checkFromAccount(),
      this._checkToAccount(options)
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
      fromAccountId: options.fromAccountId || '',
      toAccount: this._toAccount,
      toAccountId: options.toAccountId || '',
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
      smg: {name: this._smg? this._smg.name : "", gpk: this._gpkInfo? this._gpkInfo.gpk : ""}
    };
    // console.debug({taskData});
    this._task.setTaskData(taskData);
  }

  async start() {
    console.debug("bridgeTask tokenpair %s start at %s ms", this._tokenPair.id, tool.getCurTimestamp());
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

  async _checkFee(isSubsidy) {
    let options = {protocol: this._tokenPair.protocol, address: [this._fromAccount || "", this._toAccount]};
    let isErc20 = (this._tokenPair.protocol === "Erc20");
    if (!isErc20) {
      options.batchSize = this._amount.length;
    }
    // should use assetAlias as assetType to call bridge external api
    this._fee = await this._bridge.estimateFee((this._tokenPair.assetAlias || this._tokenPair.readableSymbol), this._fromChainInfo.chainName, this._toChainInfo.chainName, options);
    if (this._fee.networkFee.isSubsidy) {
      // check subsidyCrossSc coin balance and clear subsidyFee
      let subsidyFee = tool.parseFee(this._fee, this._amount, this._fee.networkFee.unit, {feeType: "networkFee", includeSubsidy: true});
      let subsidyBalance = this._fee.networkFee.subsidyBalance;
      console.debug("balance for fee subsidy: %s/%s %s", subsidyBalance, subsidyFee, this._fee.networkFee.unit);
      if (new BigNumber(subsidyBalance).lt(subsidyFee)) {
        if (isSubsidy === false) { // default is true
          this._fee.networkFee.isSubsidy = false;
        } else {
          console.error("Not enough balance for fee subsidy: %s/%s %s", subsidyBalance, subsidyFee, this._fee.networkFee.unit);
          return "Not enough balance for fee subsidy";
        }
      }
    }
    if (isErc20) {
      let assetFee = tool.parseFee(this._fee, this._amount, this._tokenPair.readableSymbol);
      if (new BigNumber(assetFee).gte(this._amount)) { // input amount includes fee
        console.error("Amount is too small to pay the bridge fee: %s %s", assetFee, this._tokenPair.readableSymbol);
        return "Amount is too small to pay the bridge fee";
      }
    }
    return "";
  }

  // depends on fee
  async _checkSmg() {
    // get active smg
    let smg = await this._bridge.getSmgInfo();
    this._smg = smg;
    if (this._tokenPair.bridge) { // only for unifying process flow, other bridge do not care smg
      return "";
    }
    let gpk = "", curve = gpkCurves.secp256, algo = gpkAlgs.ecdsa;
    if ((this._fromChainInfo.chainType === 'BTC') && smg.gpk3) {
      algo = gpkAlgs.schnorr340;
    }
    for (let i = 1; smg["gpk" + i]; i++) {
      if (curve == smg["curve" + i] && algo == smg["algo" + i]) {
        gpk = smg["gpk" + i];
        break;
      }
    }
    if (!gpk) {
      return "Invalid protocol parameter";
    }
    this._gpkInfo = {gpk, curve, algo};
    if (this._tokenPair.protocol !== "Erc20") { // only Erc20 need to check token smg balance
      return "";
    }
    // check quota
    let fromChainType = this._fromChainInfo.chainType;
    if (smg.changed) { // optimize for mainnet getQuota performance issue
      this._quota = await this._bridge.storemanService.getStroremanGroupQuotaInfo(fromChainType, this._tokenPair.id, smg.id);
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
    let tokenAccount = (this._direction === "MINT")? this._tokenPair.fromAccount : this._tokenPair.toAccount;
    let isLockCoin = (tokenAccount == 0);
    let chainInfo = this._bridge.chainInfoService.getChainInfoByType(fromChainType);
    let crossScAddr = chainInfo.crossScAddr || (chainInfo.CircleBridge && chainInfo.CircleBridge.crossScAddr);
    if ((!crossScAddr) && chainInfo.minReserved) { // do not check contract as it only set once
      let smgAddr = this._getSmgAddress(fromChainType);
      let smgBalance = await this._bridge.storemanService.getAccountBalance(this._tokenPair.id, fromChainType, smgAddr, {wallet: this._wallet, isCoin: true});
      console.debug("%s smgAddr %s balance: %s", fromChainType, smgAddr, smgBalance.toFixed());
      let estimateBalance = smgBalance;
      if (isLockCoin) { // only lock coin would change balance, ignore lock token networkFee
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
    if ((fromChainType === "XRP") && !isLockCoin) { // XRP token need to check smg trust line
      if (!this._bridge.validateXrpTokenAmount(this._amount)) {
        return "Amount out of range";
      }
      let smgAddr = this._getSmgAddress(fromChainType);
      let line = await this._bridge.storemanService.getXrpTokenTrustLine(tokenAccount, smgAddr);
      if ((!line) || line.limit.minus(line.balance).lt(this._amount)) {
        let token = tool.parseXrpTokenPairAccount(tokenAccount, true).join(".");
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
    let chainInfo = this._bridge.chainInfoService.getChainInfoByType(chainType);
    let coinBalance  = await this._bridge.storemanService.getAccountBalance(this._tokenPair.id, chainType, this._fromAccount, {wallet: this._wallet, isCoin: true});
    let assetBalance = await this._bridge.storemanService.getAccountBalance(this._tokenPair.id, chainType, this._fromAccount, {wallet: this._wallet});
    let coinSymbol = this._bridge.chainInfoService.getCoinSymbol(chainType);
    let requiredCoin = new BigNumber(0);
    let requiredAsset = 0;
    if (this._tokenPair.readableSymbol === coinSymbol) { // asset is coin
      requiredCoin = requiredCoin.plus(this._amount); // includes fee
      requiredAsset = 0;
    } else {
      requiredCoin = requiredCoin.plus(tool.parseFee(this._fee, this._amount, coinSymbol));
      requiredAsset = this._amount;
    }
    if (chainInfo.minReserved) {
      requiredCoin = requiredCoin.plus(chainInfo.minReserved);
    }
    if ((chainType === "SOL") && (this._tokenPair.bridge === "Circle")) { // depositForBurn messageSentEventData rent
      requiredCoin = requiredCoin.plus("0.00295104");
    }
    console.debug("required coin balance: %s/%s", requiredCoin.toFixed(), coinBalance.toFixed());
    if (coinBalance.lt(requiredCoin)) {
      return this._bridge.globalConstant.ERR_INSUFFICIENT_BALANCE;
    }
    if (this._tokenPair.protocol === "Erc20") {
      console.debug("required asset balance: %s/%s", requiredAsset, assetBalance.toFixed());
      if (assetBalance.lt(requiredAsset)) {
        return this._bridge.globalConstant.ERR_INSUFFICIENT_TOKEN_BALANCE;
      }
    }
    return "";
  }

  async _checkToAccount(options) {
    let chainType = this._toChainInfo.chainType;
    let tokenAccount = (this._direction === "MINT")? this._tokenPair.toAccount : this._tokenPair.fromAccount;
    let isRedeemCoin = (tokenAccount == 0);
    // check address id
    if (options.toAccountId) {
      let addresses = await this._bridge.accountId2Address(options.toAccountId, this._toChainInfo.chainName);
      if (!addresses.find(v => v.address === this._toAccount)) {
        return "Recipient address and id do not match";
      }
    }
    // check activating balance
    let chainInfo = this._bridge.chainInfoService.getChainInfoByType(chainType);
    if (chainInfo.minReserved && (chainType !== "SOL")) { // solana do not limit on toChain
      let balance = await this._bridge.storemanService.getAccountBalance(this._tokenPair.id, chainType, this._toAccount, {isCoin: true});
      console.debug("toAccount %s balance: %s", this._toAccount, balance.toFixed());
      let estimateBalance = balance;
      if (isRedeemCoin) { // only redeem coin would change balance
        let fee = tool.parseFee(this._fee, this._amount, this._tokenPair.readableSymbol);
        estimateBalance = estimateBalance.plus(this._amount).minus(fee);
      }
      if (estimateBalance.lt(chainInfo.minReserved)) {
        if (isRedeemCoin) {
          let diff = new BigNumber(chainInfo.minReserved).minus(balance);
          console.error("Amount is too small to activate recipient account, at least %s %s", diff.toFixed(), this._fromChainInfo.symbol);
          return "Amount is too small to activate recipient account";
        } else {
          return "Recipient account is inactive";
        }
      }
    }
    // check xrp token trust line
    if ((chainType === "XRP") && !isRedeemCoin) { // XRP token need to check recipient trust line
      if (!this._bridge.validateXrpTokenAmount(this._amount)) {
        return "Amount out of range";
      }
      let line = await this._bridge.storemanService.getXrpTokenTrustLine(tokenAccount, this._toAccount);
      if ((!line) || line.limit.minus(line.balance).lt(this._amount)) {
        let token = tool.parseXrpTokenPairAccount(tokenAccount, true).join(".");
        let reason = line? "Liquidity is not enough" : "No trust line";
        let msg = util.format("%s for %s", reason, token);
        console.debug("Recipient %s %s: liquidity=%s", this._toAccount, msg, line? line.limit.minus(line.balance).toFixed() : "0");
        return msg;
      }
    }
    // check algo status and opt in
    if ((chainType === "ALGO") && !isRedeemCoin) { // algorand token need to check recipient opt in
      let aInfo = await this._bridge.iwan.getAccountInfo("ALGO", this._toAccount);
      if (aInfo) {
        if (aInfo.deleted) {
          return "Recipient account is inactive";
        }
        let assetId = Number(tokenAccount), optIn = null;
        if ((aInfo['total-assets-opted-in'] > 0) && aInfo.assets) {
          optIn = aInfo.assets.find(v => ((v['asset-id'] === assetId) && (v['opted-in-at-round'] > 0)));
        }
        if (!optIn) {
          let msg = "No opt-in for token " + assetId;
          return msg;
        }
      } else {
        return "Recipient account is not found";
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
      storemanGroupId: this._smg.id,
      gpkInfo: this._gpkInfo,
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

  _updateTaskByStepData(stepIndex, txHash, stepResult, errInfo = "") { // only for sync step result to update lockTx hash
    let records = this._bridge.stores.crossChainTaskRecords;
    let ccTask = records.ccTaskRecords.get(this.id);
    if (ccTask) {
      let {isLockTx, isLocked} = records.updateTaskByStepResult(this.id, stepIndex, txHash, stepResult, errInfo);
      if (isLockTx) {
        let lockEvent = {taskId: this.id, txHash};
        console.debug("lockTxHash: %O", lockEvent);
        this._bridge.emit("lock", lockEvent);
      }
      if (isLocked) {
        let lockedEvent = {taskId: this.id, txHash};
        console.debug("lockedEvent: %O", lockedEvent);
        this._bridge.emit("locked", lockedEvent);
      }
      this._bridge.storageService.save("crossChainTaskRecords", this.id, ccTask);
    }
  }

  _getSmgXrpClassicAddress() {
    let pubKey = Secp256k1.keyFromPublic("04" + this._gpkInfo.gpk.slice(2), 'hex');
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
      return extension.tool.gpk2Address(this._gpkInfo.gpk, chainType, this._bridge.network);
    } else if ("XRP" === chainType) {
      return this._getSmgXrpClassicAddress();
    } else { // only for not-sc-chain to check smg account, other chains should not call this function
      throw new Error("Unknown " + chainType + " smg address");
    }
  }
}

module.exports = BridgeTask;