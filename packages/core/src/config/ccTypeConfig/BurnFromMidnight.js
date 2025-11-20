import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";
'use strict';
export default (class BurnFromMidnight {
    constructor(frameworkService) {
        this.frameworkService = frameworkService;
        this.configService = frameworkService.getService("ConfigService");
        let extension = this.configService.getExtension("DUST");
        this.tool = extension.tool;
    }
    async process(tokenPair, convert) {
        try {
            let direction = (convert.convertType === "MINT");
            let chainInfo = direction ? tokenPair.fromScInfo : tokenPair.toScInfo;
            let decimals = direction ? tokenPair.fromDecimals : tokenPair.toDecimals;
            let toChainType = direction ? tokenPair.toChainType : tokenPair.fromChainType;
            let tokenType = tokenPair.protocol;
            let value = (tokenType === "Erc20") ? new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0) : convert.value;
            let networkFee = tool.parseFee(convert.fee, convert.value, "DUST", { formatWithDecimals: false, feeType: "networkFee" });
            let steps = [];
            if (networkFee > 0) {
                let feeBalance = this.tool.getUserFeeBalance(convert.fromAddr);
                let rechargeValue = new BigNumber(networkFee).minus(feeBalance);
                if (rechargeValue.gt(0)) {
                    let feeParams = {
                        ccTaskId: convert.ccTaskId,
                        fromAddr: convert.fromAddr,
                        value: rechargeValue.toFixed(),
                        taskType: "ProcessMidnightRechargeFee"
                    };
                    console.debug("Midnight RechargeFee %s params: %O", tokenPair.readableSymbol, feeParams);
                    steps.push({ name: "rechargeFee", stepIndex: 1, feeParams });
                }
            }
            let burnParams = {
                ccTaskId: convert.ccTaskId,
                toChainType,
                crossScAddr: chainInfo.crossScAddr,
                userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).text,
                toAddr: convert.toAddr, // for readability
                storemanGroupId: convert.storemanGroupId,
                tokenPairID: convert.tokenPairId,
                value,
                taskType: "ProcessBurnFromMidnight",
                networkFee,
                fromAddr: convert.fromAddr,
                tokenType
            };
            console.debug("Midnight Burn %s params: %O", tokenPair.readableSymbol, burnParams);
            steps.push({ name: "userFastBurn", stepIndex: steps.length + 1, burnParams });
            return steps;
        }
        catch (err) {
            console.error("Midnight Burn %s error: %O", tokenPair.readableSymbol, err);
            throw err;
        }
    }
});
