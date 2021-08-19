class CrossChainTaskSteps {

  constructor() {
    this.mapCCTaskStepsArray = new Map();  // taskId => steps
  }

  setTaskSteps(taskId, taskSteps) {
    let steps = [];
    for (let i = 0; i < taskSteps.length; i++) {
      let step = {
        stepNo: taskSteps[i].stepIndex,
        stepTitle: taskSteps[i].title, //approve
        stepDesc: taskSteps[i].desc, // 
        stepResult: taskSteps[i].stepResult,
        txHash: taskSteps[i].txHash,
        jsonParams: taskSteps[i]
      }
      steps.push(step);
    };
    this.mapCCTaskStepsArray.set(taskId, steps);
  }

  // maybe only update txHash, not really finished
  finishTaskStep(taskId, stepIndex, txHash, stepRslt = undefined) {
    let steps = this.mapCCTaskStepsArray.get(taskId);
    for (let i = 0; i < steps.length; i++) {
      if (stepIndex == steps[i].stepNo) {
        steps[i].txHash = txHash;
        if (stepRslt) {
          steps[i].stepResult = stepRslt;
        }
      }
    }
  }
}

module.exports = CrossChainTaskSteps;
