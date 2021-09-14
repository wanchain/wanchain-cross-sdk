class CrossChainTaskRecords {

  constructor() {
    this.ccTaskRecords = new Map();
  }

  addNewTradeTask(ccTaskData) {
    let ccTask = this.ccTaskRecords.get(ccTaskData.ccTaskId);
    if (ccTask) {
      return;
    }
    ccTaskData.lockHash = null;
    ccTaskData.redeemHash = null;
    this.ccTaskRecords.set(ccTaskData.ccTaskId, ccTaskData);
  }

  modifyTradeTaskStatus(id, ccTaskStatus, errInfo = "") {
    let ccTask = this.ccTaskRecords.get(id);
    if (ccTask) {
      if (!["Failed", "Succeeded", "Error"].includes(ccTask.status)) {
        ccTask.status = ccTaskStatus;
        if (errInfo) {
          ccTask.errInfo = errInfo;
        }
      }
    }    
  }

  attachTagIdByTaskId(ccTaskId, address, tagId, rAddress) {
    // adapted to BTC/XRP crosschain task on 2021.0111     
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      ccTask.ota = {address};
      if (tagId) {
        ccTask.ota.tagId = tagId;
      }
      if (rAddress) {
        ccTask.ota.rAddress = rAddress;
      }
    }
  }

  updateTaskStepResult(ccTaskId, stepNo, txHash, result, errInfo = "") {
    let isLockTx = false;
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      for (let i = 0; i < ccTask.stepData.length; i++) {
        let stepInfo = ccTask.stepData[i];
        if (stepInfo.stepNo == stepNo) {
          stepInfo.txHash = txHash;
          if (result) {
            stepInfo.stepResult = result;
          }
          if (("Failed" == result) || ("Rejected" == result)) {
            ccTask.status = result;
            if (errInfo) {
              ccTask.errInfo = errInfo;
            }            
          } else if ((stepNo === ccTask.stepNums) && (!ccTask.isOtaTx)) {
            if (txHash && !ccTask.lockHash) {
              // update txHash and notify dapp, then wait receipt, do not change status
              ccTask.lockHash = txHash;
              isLockTx = true;
            }
            if (result) {
              ccTask.status = "Converting";
            }
          }
        }
      }
    }
    return isLockTx;
  }

  setTaskNetworkFee(ccTaskId, fee) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask && ccTask.fee) {
      ccTask.fee.networkFee.value = fee;
    }
  }

  setTaskLockTxHash(ccTaskId, txHash, sentAmount, sender) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      ccTask.lockHash = txHash;
      ccTask.sentAmount = sentAmount;
      if (sender) {
        ccTask.fromAccount = sender;
      }
    }
  }

  setTaskRedeemTxHash(ccTaskId, txHash, receivedAmount) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      ccTask.redeemHash = txHash;
      ccTask.receivedAmount = receivedAmount;
    }
  }

  removeTradeTask(ccTaskId) {
    this.ccTaskRecords.delete(ccTaskId);
  }

  loadTradeTask(ccTaskObjList) {
    for (let i = 0; i < ccTaskObjList.length; i++) {
      let ccTask = ccTaskObjList[i];
      if (ccTask.ota !== undefined) {
        this.ccTaskRecords.set(ccTask.ccTaskId, ccTask);
      } else {
        console.debug("skip not-compatible old version task id %s record", ccTask.ccTaskId);
      }
    }
  }
}

module.exports = CrossChainTaskRecords;
