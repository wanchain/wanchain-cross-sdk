const EventEmitter = require('events').EventEmitter;

const config = require('../conf/config.js');

let WebSocketClass = undefined;
if (typeof(WebSocket) !== "undefined") {
    WebSocketClass = WebSocket;
} else {
    WebSocketClass = require('ws');
}

const CONN_OPTIONS = {
    'handshakeTimeout': 12000,
    rejectUnauthorized: false
};

class WsEvent extends EventEmitter {}

class WsInstance {
    constructor(apiKey, secretKey, option) {
        this.needReconnect = true;
        this.activeClose = false;  // marked if client take the initiative to close connect
        this.apiKey = apiKey;
        this.secretKey = secretKey;
        this.open = false;
        this.events = new WsEvent();
        this.option = Object.assign({url:config.socketUrl,port:config.socketPort,flag:config.apiFlag,version:config.apiVersion} ,option);
        this.ws_url = 'wss://' + this.option.url + ':' + this.option.port;
        if (this.option.flag) {
            this.ws_url += '/' + this.option.flag;
        }

        if (this.apiKey) {
            this.ws_url += '/' + this.option.version + '/' + this.apiKey;

            this.lockReconnect = false;
            this.functionDict = {};
            this.createWebSocket();
        } else {
            throw new Error('Should config \'APIKEY\' and \'SECRETKEY\'');
            process.exit();
        }
    }

    createWebSocket() {
        try {
            this.wss = new WebSocketClass(this.ws_url);
            this.initEventHandle();
        } catch (e) {
            this.reconnect();
        }
    }

    initEventHandle() {
        this.wss.onopen = () => {
            console.log("wss onopen");
            this.open = true;
            this.events.emit("open");
        };
        this.wss.onmessage = (message) => {
            // console.log('wss onmessage ' + message.data);

            var re = JSON.parse(message.data);
            this.getMessage(re);
        };
        this.wss.onerror = (err) => {
            console.log('wss on error',err);
            if(!this.activeClose) {
                this.reconnect();
            }
            this.open = false;
        };
        this.wss.onclose = () => {
            console.log('wss on onclose. Arguments: ', arguments);
            this.open = false;
            this.clearRequests();
            console.log("ApiInstance notified socket has closed.");
            if(!this.activeClose) {
                this.reconnect();
            }
        };
    }

    clearRequests() {
        for (let key of Object.keys(this.functionDict)) {
            let fn = this.functionDict[key];

            delete this.functionDict[key];
            fn({ error: "websocket error"});
        }
    }

    reconnect() {
        console.log("[WYH_DEBUG] reconnect() ... ");
        if (this.needReconnect === false) {
            return;
        }
        if (this.lockReconnect) {
            return;
        }
        this.lockReconnect = true;
        this.reTt && clearTimeout(this.reTt);
        this.reTt = setTimeout(() => {
            this.createWebSocket();
            this.lockReconnect = false;
        }, 500);
    }

    close() {
        //this.heartCheck.reset();
        console.log("Active closing ...");
        this.needReconnect = false;
        if (this.reTt) {
            clearTimeout(this.reTt);
        }
        this.activeClose = true;
        this.wss.close();
    }

    sendMessage(message, callback) {
        let idx = message.id.toString()

        this.wss.send(JSON.stringify(message));
        this.functionDict[idx] = callback;
    }

    getMessage(message) {
        let idx = message.id.toString()
        let fn = this.functionDict[idx];

        delete this.functionDict[idx];
        fn(message);
    }

    async addConnectNotify(callback) {
        this.events.on("open", callback);
    }
}

module.exports = WsInstance;
