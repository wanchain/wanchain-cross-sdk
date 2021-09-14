'use strict';
let BigNumber = require("bignumber.js");

let ProcessBase = require("./processBase.js");
//BTC:wan->eth
//{
//    "id": "5",
//    "fromChainID": "2153201998",
//    "fromAccount": "0x07fdb4e8f8e420d021b9abeb2b1f6dce150ef77c",
//    "toChainID": "2147483708",
//    "toAccount": "0xab839532149d889a417e1275eab0b62b2ad32d09",
//    "ancestorSymbol": "BTC",
//    "ancestorDecimals": "8",
//    "ancestorAccount": "0x0000000000000000000000000000000000000000",
//    "ancestorName": "bitcoin",
//    "ancestorChainID": "2147483648",
//    "name": "wanBTC@Ethereum",
//    "symbol": "wanBTC",
//    "decimals": "8"
//};

module.exports = class ProcessMintOtherCoinBetweenEthWan extends ProcessBase {
    constructor(frameworkService) {
        super(frameworkService);
    }

    async process(paramsJson, wallet) {
        let uiStrService = this.m_frameworkService.getService("UIStrService");
        let strFailed = uiStrService.getStrByName("Failed");
        let params = paramsJson.params;
        try {
            if (!(await this.checkChainId(paramsJson, wallet))) {
                return;
            }

            if (typeof params.value === "string") {
                params.value = new BigNumber(params.value);
            }
            // check allowance
            let stroemanService = this.m_frameworkService.getService("StoremanService");
            let tokenPair = await stroemanService.getTokenPairObjById(params.tokenPairID);
            let allowance = await this.m_iwanBCConnector.getErc20Allowance(
                params.scChainType,
                tokenPair.fromAccount,
                params.fromAddr,
                params.crossScAddr,
                tokenPair.fromScInfo.erc20AbiJson);
            let bn_allowance = new BigNumber(allowance);
            if (bn_allowance.isLessThan(params.value)) {
                this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed, "Insufficient ERC20 token allowance");
                return;
            }

            let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
            let scData = await txGeneratorService.generateUserBurnData(params.crossScAddr,
                params.crossScAbi,
                params.storemanGroupId,
                params.tokenPairID,
                params.value,
                params.userBurnFee,
                params.tokenAccount,
                params.userAccount);

            // async generateTx(toAddress, value, txData)
            let txValue = params.fee;
            let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.crossScAddr, txValue, scData, params.fromAddr);
            await this.sendTransactionData(paramsJson, txData, wallet);
            return;
        }
        catch (err) {
            console.error("ProcessErc20UserFastMint process err: %O", err);
            this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed, "Failed to generate transaction data");
        }
    }

    // virtual function
    async getConvertInfoForCheck(paramsJson) {
        let storemanService = this.m_frameworkService.getService("StoremanService");
        let tokenPairObj = await storemanService.getTokenPairObjById(paramsJson.params.tokenPairID);
        let blockNumber = await this.m_iwanBCConnector.getBlockNumber(tokenPairObj.toChainType);
        let obj = {
            needCheck: true,
            checkInfo: {
                "ccTaskId": paramsJson.params.ccTaskId,
                "uniqueID": paramsJson.txhash,
                "userAccount": paramsJson.params.userAccount,
                "smgID": paramsJson.params.storemanGroupId,
                "tokenPairID": paramsJson.params.tokenPairID,
                "value": paramsJson.params.value,
                "chain": tokenPairObj.toChainType,
                "fromBlockNumber": blockNumber,
                "taskType": "MINT"
            }
        };
        return obj;
    }
};


// { "name": "userFastMint", "stepIndex": retAry.length + 1, "title": "userFastMint title", "desc": "userFastMint desc", "params": userFastMintParaJson }
//let userFastMintParaJson = {
//    "fromAddr": convertJson.fromAddr,
//    "scChainType": mintChainInfo.chaintype,
//    "crossScAddr": mintChainScInfo.crossScAddr,
//    "crossScAbi": mintChainScInfo.crossScAbiJson,
//    "storemanGroupId": convertJson.storemanGroupId,
//    "tokenPairID": convertJson.tokenPairId,
//    "value": convertJson.value,
//    "userAccount": convertJson.toAddr,
//    "processHandler": new ProcessUserFastMint(this.m_frameworkService)
//};

