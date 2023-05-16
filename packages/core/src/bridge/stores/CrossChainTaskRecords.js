class CrossChainTaskRecords {

  constructor() {
    this.ccTaskRecords = new Map();
  }

  addNewTradeTask(ccTaskData) {
    let ccTask = this.ccTaskRecords.get(ccTaskData.ccTaskId);
    if (ccTask) {
      return;
    }
    this.ccTaskRecords.set(ccTaskData.ccTaskId, ccTaskData);
  }

  modifyTradeTaskStatus(id, ccTaskStatus, errInfo = "") {
    let ccTask = this.ccTaskRecords.get(id);
    if (ccTask) {
      if (!["Failed", "Succeeded", "Error"].includes(ccTask.status)) {
        if (errInfo) { // set errInfo
          ccTask.errInfo = errInfo;
        } else if ((ccTaskStatus === "Converting") && (ccTask.status === "Timeout")) {
          ccTask.errInfo = ""; // clear temporary Timeout status
        }
        ccTask.status = ccTaskStatus;
      }
    }    
  }

  setTaskOtaInfo(ccTaskId, ota) {
    // adapted to BTC/XRP crosschain task on 2021.0111     
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      ccTask.ota = ota;
    }
  }

  // stepData has already been updated, only need to update task info
  updateTaskByStepResult(ccTaskId, stepIndex, txHash, result, errInfo = "") {
    let isLockTx = false;
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      for (let i = 0; i < ccTask.stepData.length; i++) {
        if (ccTask.stepData[i].stepIndex === stepIndex) {
          if (["Failed", "Rejected"].includes(result)) {
            ccTask.status = result;
            if (errInfo) {
              ccTask.errInfo = errInfo;
            }            
          } else if (["userFastMint", "userFastBurn", "depositForBurn"].includes(ccTask.stepData[i].name)) {
            // on evm both tx and receipt will trigger updateTaskByStepResult, update txHash and notify dapp only once
            if (txHash && !ccTask.lockHash) {
              ccTask.lockHash = txHash;
              isLockTx = true;
            }
            if (result) { // on evm do not change status until receipt with resule
              ccTask.status = "Converting";
            }
          }
        }
      }
    }
    return isLockTx;
  }

  updateTaskFee(ccTaskId, type, value, rectify = false) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask && ccTask.fee) {
      console.debug("task %d update %s fee: %s->%s", ccTaskId, type, ccTask.fee[type].value, value);
      ccTask.fee[type].value = value;
      if (rectify) {
        ccTask.fee[type].isRatio = false;
      }
    } else {
      console.error("task %d fee data is damaged", ccTaskId);
    }
  }

  setTaskLockTxHash(ccTaskId, txHash, sentAmount, sender, uniqueId) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      ccTask.lockHash = txHash;
      ccTask.uniqueId = uniqueId || "";
      ccTask.sentAmount = sentAmount;
      if (sender) {
        ccTask.fromAccount = sender;
      }
    }
  }

  setTaskRedeemTxHash(ccTaskId, txHash, receivedAmount) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      if (txHash) { // prevent clearing txHash on repeated redeem
        ccTask.redeemHash = txHash;
      }
      ccTask.receivedAmount = receivedAmount;
    }
  }

  removeTradeTask(ccTaskId) {
    this.ccTaskRecords.delete(ccTaskId);
  }

  loadTradeTask(ccTaskList) {
    for (let i = 0; i < ccTaskList.length; i++) {
      let ccTask = ccTaskList[i];
      if (ccTask.ota !== undefined) {
        if (!ccTask.protocol) {
          ccTask.protocol = "Erc20"; // for compatibility
        }
        this.ccTaskRecords.set(ccTask.ccTaskId, ccTask);
      } else {
        console.debug("skip not-compatible old version task id %s record", ccTask.ccTaskId);
      }
    }
  }

  // maybe only update txHash, not really finished
  finishTaskStep(ccTaskId, stepIndex, txHash, stepResult, errInfo = "") {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    let steps = ccTask.stepData || [];
    for (let i = 0; i < steps.length; i++) {
      if (stepIndex == steps[i].stepIndex) {
        if (txHash) {
          steps[i].txHash = txHash;
        }
        if (stepResult) {
          steps[i].stepResult = stepResult;
        }
        if (errInfo) {
          steps[i].errInfo = errInfo;
        }
      }
    }
  }
}

module.exports = CrossChainTaskRecords;
