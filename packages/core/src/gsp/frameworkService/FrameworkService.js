
class FrameworkService {
  constructor(options) {
    this.serviceRegistry = {};
  }

  registerService(serviceName, serviceInstance) {
    this.serviceRegistry[serviceName] = serviceInstance;
  }

  getService(serviceName) {
    return this.serviceRegistry[serviceName];
  }
}

export default FrameworkService;
