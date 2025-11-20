import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";
'use strict';
const DefaultGas = 10_000_000;
export default (class ProcessBurnFromSui {
    constructor(frameworkService) {
        this.frameworkService = frameworkService;
        this.webStores = this.frameworkService.getService("WebStores");
        this.configService = frameworkService.getService("ConfigService");
        let extension = this.configService.getExtension("SUI");
        this.tool = extension.tool;
        this.storemanService = frameworkService.getService("StoremanService");
        this.tokenPairService = frameworkService.getService("TokenPairService");
    }
    async process(stepData, wallet) {
        let params = stepData.params;
        try {
            let tokenPair = this.tokenPairService.getTokenPair(params.tokenPairID);
            let direction = (tokenPair.fromChainType === "SUI");
            let chainInfo = direction ? tokenPair.fromScInfo : tokenPair.toScInfo;
            let tokenAccount = direction ? tokenPair.fromAccount : tokenPair.toAccount;
            let coinType = tool.ascii2letter(tokenAccount);
            let totalSui = new BigNumber(params.networkFee).plus(DefaultGas);
            let tx = this.tool.newTransaction();
            // fee
            let suiCoins = await this.storemanService.getSuiCoins(params.fromAddr, "0x2::sui::SUI");
            let selectedSuiCoins = this.tool.selectCoins(suiCoins, totalSui.toFixed(0));
            tx.setGasPayment(selectedSuiCoins.map(v => {
                return { objectId: v.coinObjectId, version: v.version, digest: v.digest };
            }));
            let [feeCoin] = tx.splitCoins(tx.gas, [params.networkFee]);
            let assetCoins = await this.storemanService.getSuiCoins(params.fromAddr, coinType);
            let selectedAssetCoins = this.tool.selectCoins(assetCoins, params.value);
            let assetCoin = selectedAssetCoins[0];
            if (selectedAssetCoins.length > 1) {
                tx.mergeCoins(assetCoin.coinObjectId, selectedAssetCoins.slice(1).map(v => v.coinObjectId));
            }
            let [crossCoin] = tx.splitCoins(assetCoin.coinObjectId, [params.value]);
            //
            tx.moveCall({
                target: chainInfo.crossScAddr + '::cross::user_burn',
                arguments: [
                    tx.object(chainInfo.tokenPairRegistry),
                    tx.object(chainInfo.TreasuryCapsRegistry),
                    tx.object(chainInfo.foundationConfig),
                    tx.object(chainInfo.pauseConfig),
                    tx.object(chainInfo.feeConfig),
                    tx.object(chainInfo.oracleStorage),
                    tx.object(chainInfo.clock),
                    tx.pure.vector('u8', new Uint8Array(Buffer.from(tool.hexStrip0x(params.storemanGroupId), 'hex'))),
                    tx.pure.u64(BigInt(params.tokenPairID)),
                    tx.pure.string(params.userAccount),
                    tx.object(crossCoin),
                    tx.object(feeCoin),
                    tx.pure.string('')
                ],
                typeArguments: [coinType],
            });
            tx.transferObjects([feeCoin], params.fromAddr);
            let txHash = await wallet.sendTransaction(tx, params.fromAddr);
            this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
            let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType);
            let checker = {
                chain: "SUI",
                ccTaskId: params.ccTaskId,
                stepIndex: stepData.stepIndex,
                txHash,
                txCheckInfo: null, // only check tx receipt, no event
                convertCheckInfo: {
                    ccTaskId: params.ccTaskId,
                    txHash,
                    uniqueID: tool.sha256(txHash),
                    chain: params.toChainType,
                    fromBlockNumber: blockNumber,
                    taskType: this.tokenPairService.getTokenEventType(params.tokenPairID, direction),
                    // for api server
                    fromAddr: params.fromAddr,
                    toAddr: params.toAddr
                }
            };
            let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
            await checkTxReceiptService.add(checker);
        }
        catch (err) {
            if (["Rejected from user"].includes(err.message)) {
                this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
            }
            else {
                console.error("ProcessBurnFromSui error: %O", err);
                this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
            }
        }
    }
});
