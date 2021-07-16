class AccountRecords {

  constructor() {
    this.mapAccountRecords = new Map(); // chainType => [{account}]
  }

  addAccountData(chainType, addr, name, type) {
    let accountList = this.mapAccountRecords.get(chainType)
    if(null == accountList){
      accountList = new Array();
    }
    if ("DOT" !== chainType) {
      for (let i = 0; i < accountList.length; i++) {
        if (type == accountList[i].type){
          break;
        }
      }
      if (i < accountList.length) {
        accountList.splice(i, 1);
      }
    } else {
      for (let i = 0; i < accountList.length; i++) {
        if (addr == accountList[i].address) {
          return;
        }
      }
    }
    if (addr) {
      let account = {
        name: name,
        address: addr,
        type: type,
      };
      accountList.push(account);
    }
    this.mapAccountRecords.set(chainType, accountList);
  };

  removeAccountData(chainType, addr) {
    let accountList = this.mapAccountRecords.get(chainType)
    if (!accountList) {
      return;
    }
    for (let i = 0; i < accountList.length; i++) {
      if (accountList[i].address == addr) {
        break;
      }
    }
    if (i < accountList.length) {
      accountList.splice(i, 1);
    }    
    this.mapAccountRecords.set(chainType, accountList);    
  };

  setAccountData(chainType, srctype, addr, name) {
    let isMetaMask = (srctype == "MetaMask")? true : false;
    if (!addr) {
      if (isMetaMask) {
        this.removeAccountData("ETH", addr);
        this.removeAccountData("BNB", addr);
        this.removeAccountData("WAN", addr);
        this.removeAccountData("AVAX", addr);
        this.removeAccountData("DEV", addr);
        this.removeAccountData("MATIC", addr);
      } else {
        this.removeAccountData(chainType, addr);
      }
    } else {
      if (isMetaMask) {
        this.addAccountData("ETH", addr, name, srctype);
        this.addAccountData("BNB", addr, name, srctype);
        this.addAccountData("WAN", addr, name, srctype);
        this.addAccountData("AVAX", addr, name, srctype);
        this.addAccountData("DEV", addr, name, srctype);
        this.addAccountData("MATIC", addr, name, srctype);
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
