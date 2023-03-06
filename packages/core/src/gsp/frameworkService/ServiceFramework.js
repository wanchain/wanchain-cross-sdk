
const SERVICE_FRAME_ERROR = {
    NoService: 'service not found',
    NotSupport: 'method not support',
}

class ServiceFramework {

    constructor(options) {
        this.serviceRegistry = {};
    }

    registerService(serviceType, serviceName, serviceInstance) {
        this.serviceRegistry[serviceType] = this.serviceRegistry[serviceType] || {};
        this.serviceRegistry[serviceType][serviceName] = serviceInstance;
    }

    getService(serviceType, serviceName) {
        return this.serviceRegistry[serviceType][serviceName];
    }
}


class ServiceBase {
    constructor(serviceType,serviceName) {
        this.status = ServiceStatus.NotInit;
        this.serviceType = serviceType;
        this.serviceName = serviceName;
    }

    async init(options) {
        this.status = ServiceStatus.Ready;
    }

    async start(){
        this.status = ServiceStatus.StartWork;
    }

    getServiceName() { return this.serviceName; }

    getServiceType() { return this.serviceType; }

    getServiceStatus() { return this.status };
}

const ServiceStatus = {
    NotInit: 0,
    Ready:1,
    StartWork: 2
}

let serviceFramework = new ServiceFramework();

module.exports = { serviceFramework, SERVICE_FRAME_ERROR, ServiceBase, ServiceStatus };
