'use strict';

module.exports = class UtilService {
    constructor() {
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
    }

    async getBtcTxSender(chainType, txid) {
        let iwan = this.m_frameworkService.getService("iWanConnectorService");
        let txInfo = await iwan.getTxInfo(chainType, txid, {format: true});
        let inputLen = txInfo.vin.length;
        let sender = "";
        for (let i = 0; i < inputLen; i++) {
            let inputTxInfo = await iwan.getTxInfo(chainType, txInfo.vin[i].txid, {format: true});
            let senders = inputTxInfo.vout[txInfo.vin[i].vout].scriptPubKey.addresses;
            if (senders && senders.length) {
                sender = senders[0];
                if (senders.length === 1) {
                    break;
                }
            }
        }
        return sender;
    }
};
