
// map(tokenId => tokenObj)
const TokenList = {
  'tokenId_1': {
    tokenScAddr: '0xc6f4465a6a521124c8e3096b62575c157999d361',
    tokenScABI : "abi.json",
    tokenSymbol: '',
    tokenDecimal: 8,
    chainType: 'ETH',
  },
  'tokenId_2': {
    tokenScAddr: '0xc6f4465a6a521124c8e3096b62575c157999d361',
    tokenScABI : "abi.json",
    tokenSymbol: '',
    tokenDecimal: 8,
    chainType: 'WAN',
  },  
};


// map(tokenPairId = > tokenPairObj)
const TokenPairsReg = {
  'wanBTC/wanBTC@Ethereum': {
    assetType: 'WAN',
    srcToken: 'tokenId_1', // tokenId
    dstToken: 'tokenId_2',  // tokenId
    ccTypeId: 'ccType_erc20',
    storemanGroups: ["storemanGroupId_1", "storemanGroupId_2"],
  },
  'FNX/wanFNX@Ethereum': {
    assetType: 'ETH',
    srcToken: 'tokenId_2',  // tokenId
    dstToken: 'tokenId_1',  // tokenId
    ccTypeId: 'ccType_erc20',
    storemanGroups: ["storemanGroupId_1", "storemanGroupId_2"],
  }
};


// export default {TokenList, TokenPairsReg}
export default  TokenPairsReg;