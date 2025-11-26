
class TaskService {
  constructor() {
    this.tasks = [];
  }

  async init(frameworkService) {
    let configService = frameworkService.getService("ConfigService");
    this.taskInterval = configService.getConfig("TaskService", "taskInterval");
    setTimeout(() => this.taskLoop(), this.taskInterval);
  }

  async addTask(inst, interval, para = "") {
    for (let i = 0; i < this.tasks.length; ++i) {
      if (inst === this.tasks[i].inst) {
        return;
      }
    }
    let task = {
      inst: inst,
      interval: interval || 15_000, // default 15 seconds
      para: para,
      timestamp: 0
    };
    this.tasks.push(task);
  }

  async removeTask(inst) {
    this.tasks = this.tasks.filter(v => (v.inst !== inst));
  }

  async taskLoop() {
    for (let i = 0; i < this.tasks.length; i++) {
      let now = Date.now();
      let task = this.tasks[i];
      try {
        if ((now - task.timestamp) >= task.interval) {
          await task.inst.runTask(task.para);
          task.timestamp = now;
        }
      } catch (err) {
        console.log("taskLoop err:", err);
      }
    }
    setTimeout(() => this.taskLoop(), this.taskInterval);
  }
}

export default TaskService;
