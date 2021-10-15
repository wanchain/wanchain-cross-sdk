'use strict';

let BigNumber = require("bignumber.js");

module.exports = class UtilService {
    constructor() {
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
    }

    async checkBalanceGasFee(retAry, chainType, fromAddr, fee) {
        try {
            let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
            // checkBalance & gas
            let balance = await iwanBCConnector.getBalance(chainType, fromAddr);
            balance = new BigNumber(balance);
            let gas = new BigNumber(0);
            let gasPrice = await iwanBCConnector.getGasPrice(chainType);
            gasPrice = new BigNumber(gasPrice);
            for (let idx = 0; idx < retAry.length; ++idx) {
                let gasLimit = new BigNumber(retAry[idx].params.gasLimit);
                let gasFee = gasLimit.multipliedBy(gasPrice);
                gas = gas.plus(gasFee);
            }
            gas = gas.plus(fee);
            return balance.gte(gas);
        } catch (err) {
            console.error("UtilService checkBalanceGasFee error: %O", err);
            return false;
        }
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
