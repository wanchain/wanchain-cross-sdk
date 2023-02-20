'use strict';


const EventEmitter = require('events').EventEmitter;

module.exports = class EventService {
    constructor() {
        this.m_eventEmitter = new EventEmitter();
        this.m_eventEmitter.setMaxListeners(100);
    }

    async init(frameworkService) {
    }

    async addEventListener(eventName, listener) {
        this.m_eventEmitter.on(eventName, listener);
    }

    async emitEvent(eventName, args) {
        this.m_eventEmitter.emit(eventName, args);
    }

    async removeAllListeners(eventName) {
        this.m_eventEmitter.removeAllListeners(eventName);
    }

    async removeListener(eventName, listener) {
        this.m_eventEmitter.removeListener(eventName, listener);
    }
};

