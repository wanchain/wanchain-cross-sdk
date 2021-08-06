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

  modifyTradeTaskStatus(id, ccTaskStatus) {
    let ccTask = this.ccTaskRecords.get(id);
    if (ccTask) {
      if (!["Failed", "Succeeded", "Error"].includes(ccTask.status)) {
        ccTask.status = ccTaskStatus;
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

  updateTaskStepResult(ccTaskId, stepNo, txHash, result) {
    let isLockTx = false;
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      for (let i = 0; i < ccTask.stepData.length; i++) {
        let stepInfo = ccTask.stepData[i];
        if (stepInfo.stepNo == stepNo) {
          stepInfo.stepResult = result;
          stepInfo.txHash = txHash;
          // to update the task status if necessary if needed
          if (("Failed" == result) || ("Rejected" == result)) {
            ccTask.status = result;
          } else if ((stepNo === ccTask.stepNums) && (!ccTask.isOtaTx)) {
            ccTask.lockHash = txHash;
            ccTask.status = "Converting";
            isLockTx = true;
          }
        }
      }
    }
    return isLockTx;
  }

  setTaskSentAmount(ccTaskId, value) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      ccTask.sentAmount = value;
    }
  }

  setTaskNetworkFee(ccTaskId, fee) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask && ccTask.fee) {
      ccTask.fee.networkFee.value = fee;
    }
  }

  setTaskLockTxHash(ccTaskId, txHash, sender = undefined) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      ccTask.lockHash = txHash;
      if (sender) {
        ccTask.fromAccount = sender;
      }
    }
  }

  setTaskRedeemTxHash(ccTaskId, txHash) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      ccTask.redeemHash = txHash;
    }
  }

  removeTradeTask(ccTaskId) {
    this.ccTaskRecords.delete(ccTaskId);
  }

  loadTradeTask(ccTaskObjList) {
    for (let i = 0; i < ccTaskObjList.length; i++) {
      let ccTask = ccTaskObjList[i];
      this.ccTaskRecords.set(ccTask.ccTaskId, ccTask);
    }
  }
}

module.exports = CrossChainTaskRecords;
