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

            return balance.isGreaterThanOrEqualTo(gas);
        }
        catch (err) {
            console.log("UtilService checkBalanceGasFee err:", err);
            return false;
        }
    }
};
