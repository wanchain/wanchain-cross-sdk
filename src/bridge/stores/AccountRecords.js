class AccountRecords {

  constructor() {
    this.mapAccountRecords = new Map();// chainType => [{ accountObj }]
  }

  addAccountData(chainType, addr, name, type) {
    let accountList = this.mapAccountRecords.get(chainType)
    if(null == accountList){
      accountList = new Array();
    }

    let objIndex = -1;
    for(let i=0; i<accountList.length; i++){
      if(type == accountList[i].type){
        objIndex = i;
        break;
      }
    }

    if(-1 !== objIndex){
      accountList.splice(objIndex, 1);
    }

    if(addr){
      let accountObj = {
        name: name,
        address: addr,
        type: type,
      };
      accountList.push(accountObj);
    }

    this.mapAccountRecords.set(chainType, accountList);
  };

  removeAccountData(chainType, addr) {
    let accountList = this.mapAccountRecords.get(chainType)
    if(!accountList){
      return;
    }

    let objIndex = -1;
    for(let i=0; i<accountList.length; i++){

      if(accountList[i].address == addr){
        objIndex = i;
        break;
      }
    }

    accountList.splice(objIndex, 1);

    this.mapAccountRecords.set(chainType, accountList);    
  };

  setAccountData(chainType, srctype, addr, name) {
    let isMetaMask = ["ETH", "BNB", "WAN"].includes(chainType);
    if (!addr) {
      if (isMetaMask) {
        this.removeAccountData("ETH", addr);
        this.removeAccountData("BNB", addr);
        this.removeAccountData("WAN", addr);
      } else {
        this.removeAccountData(chainType, addr);
      }
    } else {
      if (isMetaMask) {
        this.addAccountData("ETH", addr, name, srctype);
        this.addAccountData("BNB", addr, name, srctype);
        this.addAccountData("WAN", addr, name, srctype);
      } else {
        this.addAccountData(chainType, addr, name, srctype);
      }
    }
  };


  checkAccountData(chainType, addr) {

    let accountList = this.mapAccountRecords.get(chainType);
    if(!accountList){
      return false;
    }

    for(let i=0; i<accountList.length; i++){
      if(accountList[i].address == addr){
        return true;
      }
    }

    return false;
  }

  getCurAccount(fromChainType, toChainType, direction) {
    let chainType = (direction == "MINT")? fromChainType : toChainType;
    let accountList = this.mapAccountRecords.get(chainType);
    return accountList? accountList[0].address : '';
  };
}

module.exports = AccountRecords;
