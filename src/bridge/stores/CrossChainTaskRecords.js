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

  // stepData has been assigned via CrossChainTaskSteps, only process additional logic
  updateTaskByStepResult(ccTaskId, stepIndex, txHash, result, errInfo, uniqueId) {
    let isLockTx = false;
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      for (let i = 0; i < ccTask.stepData.length; i++) {
        if (ccTask.stepData[i].stepIndex === stepIndex) {
          if (("Failed" == result) || ("Rejected" == result)) {
            ccTask.status = result;
            if (errInfo) {
              ccTask.errInfo = errInfo;
            }            
          } else if ((stepIndex === ccTask.stepNums) && (!ccTask.isOtaTx)) {
            if (txHash && !ccTask.lockHash) {
              // update txHash and notify dapp, then wait receipt, do not change status
              ccTask.lockHash = txHash;
              ccTask.uniqueId = uniqueId || "";
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
      console.debug("task %d update networkFee %s -> %s", ccTaskId, ccTask.fee.networkFee.value, fee);
      ccTask.fee.networkFee.value = fee;
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
        if (!ccTask.protocol) {
          ccTask.protocol = "Erc20"; // for compatibility
        }
        this.ccTaskRecords.set(ccTask.ccTaskId, ccTask);
      } else {
        console.debug("skip not-compatible old version task id %s record", ccTask.ccTaskId);
      }
    }
  }
}

module.exports = CrossChainTaskRecords;
