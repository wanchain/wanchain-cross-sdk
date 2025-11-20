import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";
'use strict';
export default (class CircleBridgeSuiDeposit {
    constructor(frameworkService) {
        this.frameworkService = frameworkService;
        this.configService = frameworkService.getService("ConfigService");
    }
    async process(tokenPair, convert) {
        try {
            let direction = (convert.convertType === "MINT");
            let decimals = direction ? tokenPair.fromDecimals : tokenPair.toDecimals;
            let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0);
            let networkFee = tool.parseFee(convert.fee, convert.value, "SUI", { formatWithDecimals: false, feeType: "networkFee" });
            let toChainType = direction ? tokenPair.toChainType : tokenPair.fromChainType;
            let innerToAddr = convert.toAddr;
            if (toChainType === "SOL") {
                let sol = this.configService.getExtension(toChainType);
                let toAccount = tool.ascii2letter(direction ? tokenPair.toAccount : tokenPair.fromAccount);
                innerToAddr = sol.tool.getAssociatedTokenAddressSync(sol.tool.getPublicKey(toAccount), sol.tool.getPublicKey(convert.toAddr)).toString();
                console.log({ innerToAddr });
            }
            let toAddressInfo = tool.getStandardAddressInfo(toChainType, innerToAddr, this.configService.getExtension(toChainType));
            let params = {
                ccTaskId: convert.ccTaskId,
                toChainType,
                userAccount: toAddressInfo.cctp || toAddressInfo.evm,
                toAddr: convert.toAddr, // for readability
                innerToAddr, // for cctp to solana
                tokenPairID: convert.tokenPairId,
                value,
                taskType: "ProcessCircleBridgeSuiDeposit",
                networkFee,
                fromAddr: convert.fromAddr
            };
            console.debug("CircleBridgeSuiDeposit params: %O", params);
            let steps = [
                { name: "userFastBurn", stepIndex: 1, params }
            ];
            return steps;
        }
        catch (err) {
            console.error("CircleBridgeSuiDeposit error: %O", err);
            throw err;
        }
    }
});
