
// cctype => array[{txType},{txType}]
const CCTypeConfig_X = [{
  stepTxType: "txTypeId_A",
},{
  stepTxType: "txTypeId_B",
}];

const CCTypeConfig_Y = [{
  stepTxType: "txTypeId_B",
}];

// map(cctypeId => cctype)
const CCTypeConfigRegistry = {
  ccType_erc20: CCTypeConfig_X,
  ccType_coins: CCTypeConfig_Y,
};




export default CCTypeConfigRegistry;