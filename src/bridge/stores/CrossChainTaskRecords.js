class CrossChainTaskRecords {

  constructor() {
    this.ccTaskRecords = new Map();
    this.mapTagId2TaskId = new Map();
  }

  addNewTradeTask(ccTaskData) {
    let ccTask = this.ccTaskRecords.get(ccTaskData.ccTaskId);
    if (ccTask) {
      return;
    }
    ccTaskData.lockHash = null;
    ccTaskData.redeemHash = null;
    this.ccTaskRecords.set(ccTaskData.ccTaskId, ccTaskData);
  };

  modifyTradeTaskStatus(id, ccTaskStatus) {
    let ccTask = this.ccTaskRecords.get(id);
    if (ccTask) {
      ccTask.status = ccTaskStatus;
    }    
  };

  attachTagIdByTaskId(ccTaskId, address, tagId, rAddress) {
    // adapted to BTC/XRP crosschain task on 2021.0111     
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask){
      if (tagId) {
        ccTask.tagId = tagId;
        ccTask.xAddress = address;
        ccTask.rAddress = rAddress;
        this.mapTagId2TaskId.set(tagId, ccTaskId);
      } else {
        ccTask.disposableAddress = address;
        this.mapTagId2TaskId.set(address, ccTaskId);
      }
    }
  };

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
          } else if ((stepNo === ccTask.stepNums) && (!ccTask.bDestinationTag)) {
            ccTask.lockHash = txHash;
            ccTask.status = "Converting";
            isLockTx = true;
          }
        }
      }
    }
    return isLockTx;
  };

  setTaskSentAmount(ccTaskId, value) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      ccTask.sentAmount = value;
    }
  };

  setTaskNetworkFee(ccTaskId, fee) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      ccTask.networkFee = fee;
    }
  };

  setTaskLockTxHash(ccTaskId, txHash) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      ccTask.lockHash = txHash;
    }
  };

  setTaskRedeemTxHash(ccTaskId, txHash) {
    let ccTask = this.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      ccTask.redeemHash = txHash;
    }
  };

  removeTradeTask(ccTaskId) {
    this.ccTaskRecords.delete(ccTaskId);
  };

  loadTradeTask(ccTaskObjList) {
    for (let i = 0; i < ccTaskObjList.length; i++) {
      let ccTask = ccTaskObjList[i];
      this.ccTaskRecords.set(ccTask.ccTaskId, ccTask);
      // adapted to BTC/XRP crosschain task on 2021.0111 
      if (ccTask.tagId) {
        this.mapTagId2TaskId.set(ccTask.tagId, ccTask.ccTaskId);
      } else if (ccTask.disposableAddress) {
        this.mapTagId2TaskId.set(ccTask.disposableAddress, ccTask.ccTaskId);
      }
    }
  };
}

module.exports = CrossChainTaskRecords;
