

// cctype => array[{txType},{txType}]

const TxApprove = (jsonParams) => {

    //tokenId,fromAddr,toAddr,amount

 //_approvlZeroTxHash = await wrc20TokenInstance.approve(RedPacketInsAddr, 0, {from: optAddress, gas: 4700000}); 
 //_approvlTxHash = await wrc20TokenInstance.approve(RedPacketInsAddr, _rpTotalBonus, {from: optAddress, gas: 4700000});  
}

const TxCrosschain = (jsonParams) => {
    
    // from, to, amount, storemanGroup
    // scAddr,
    // scFunc,

}

// map(cctypeId => cctype)
const TxTypeConfigRegistry = {
    txTypeId_A: TxApprove,
    txTypeId_B: TxCrosschain,
}; 
  
  
export default { TxTypeConfigRegistry };