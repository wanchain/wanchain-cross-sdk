import Web3 from "web3";
import ProcessBaseSync from "./processBaseSync.js";
'use strict';
const web3 = new Web3();
export default (class ProcessClaimCrossReward extends ProcessBaseSync {
    constructor(frameworkService) {
        super(frameworkService);
        this.configService = frameworkService.getService("ConfigService");
        this.iwan = frameworkService.getService("iWanConnectorService");
    }
    async process(stepData, wallet) {
        let params = stepData.params;
        let cfg = this.configService.getGlobalConfig("crossTask");
        params.scAddr = cfg.scAddr;
        params.chainType = "WAN";
        console.log("ProcessClaimCrossReward params: %O", params);
        let scData = await this.genTxData(params);
        let txData = await this.txGeneratorService.generateTx(params.chainType, scData.gasLimit, params.scAddr, 0, scData.data, params.fromAddr);
        await this.sendTx(stepData, txData, wallet);
    }
    async genTxData(params) {
        let abi = this.configService.getAbi("rewardTask");
        let sc = new web3.eth.Contract(abi, params.scAddr);
        let data = sc.methods.claimReward(params.taskId, this.getTxHashBytes(params.txHash), params.signature).encodeABI();
        let gasLimit = await this.iwan.estimateGas(params.chainType, { from: params.fromAddr, to: params.scAddr, value: 0, data });
        console.debug("ProcessClaimCrossReward gasLimit: %s", gasLimit);
        return { data, gasLimit };
    }
    getTxHashBytes(txHash) {
        if (/^0x[0-9a-f]+$/.test(txHash)) {
            return txHash;
        }
        else if (/^[0-9a-f]+$/.test(txHash)) {
            return '0x' + txHash;
        }
        else {
            return web3.utils.asciiToHex(txHash);
        }
    }
});
