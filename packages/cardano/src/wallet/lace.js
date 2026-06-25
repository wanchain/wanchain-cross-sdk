import wasm from "../wasm/index.js";
import tool from "../tool.js";

class Lace {
  constructor(provider) {
    if (window.cardano?.lace) {
      this.name = "Lace";
      if (!['mainnet', 'testnet'].includes(provider)) {
        throw new Error("Invalid provider, should be 'mainnet' or 'testnet'");
      }
      this.cardano = window.cardano;
      this.lace = null;
      this.wasm = wasm.getWasm();
    } else {
      window.open('https://www.lace.io');
      throw new Error('please install lace wallet');
    }
  }

  // standard function

  async getChainId() {
    if (!this.lace) {
      this.lace = await this.cardano.lace.enable({ extensions: [{ cip: 95 }] });
    }
    const id = await this.lace.getNetworkId();
    return id;
  }

  async getAccounts() {
    try {
      let lace = null;
      if (this.lace) {
        lace = this.lace;
      } else {
        lace = await this.cardano.lace.enable({ extensions: [{ cip: 95 }] });
        this.lace = lace;
      }
      let accounts = await lace.getUsedAddresses();
      accounts = [accounts[0]];
      accounts = accounts.map(v => this.wasm.Address.from_bytes(Buffer.from(v, 'hex')).to_bech32());
      return accounts;
    } catch (err) {
      console.error("%s not installed or not allowed: %O", this.name, err);
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance(addr, tokenId) {
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      if (!this.lace) {
        this.lace = await this.cardano.lace.enable({ extensions: [{ cip: 95 }] });
      }
      let balance = await this.lace.getBalance();
      let value = this.wasm.Value.from_hex(balance);
      if (tokenId) {
        let [policyId, assetName] = tokenId.split(".");
        if (assetName) { // erc20
          return tool.getAssetBalance(value.multiasset(), policyId, assetName);
        } else { // nft
          let nfts = tool.getNftInfo(value.multiasset(), tokenId);
          return nfts.length.toString();
        }
      } else { // coin
        return value.coin().to_str(); // including locked value, keep consistent with wallet ui
      }
    } else {
      console.error("%s is not current address", addr);
      throw new Error("Not current address");
    }
  }

  async getBalances(addr, tokenIds) {
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      if (!this.lace) {
        this.lace = await this.cardano.lace.enable({ extensions: [{ cip: 95 }] });
      }
      let balance = await this.lace.getBalance();
      let value = this.wasm.Value.from_hex(balance);
      return tokenIds.map(id => {
        if (id) {
          let [policyId, assetName] = id.split(".");
          if (assetName) { // erc20
            return tool.getAssetBalance(value.multiasset(), policyId, assetName);
          } else { // nft
            let nfts = tool.getNftInfo(value.multiasset(), id);
            return nfts.length.toString();
          }
        } else {
          return value.coin().to_str();
        }
      });
    } else {
      console.error("%s is not current address", addr);
      throw new Error("Not current address");
    }
  }

  async getChangedAccounts() {
    try {
      let lace = null;
      let accounts = null;
      if (this.lace) {
        lace = this.lace;
        accounts = await lace.getChangeAddress();
        accounts = [accounts];
      } else {
        lace = await this.cardano.lace.enable({ extensions: [{ cip: 95 }] });
        this.lace = lace;
        accounts = await lace.getUsedAddresses();
        accounts = [accounts[0]];
      }
      accounts = accounts.map(v => this.wasm.Address.from_bytes(Buffer.from(v, 'hex')).to_bech32());
      return accounts;
    } catch (err) {
      console.error("%s not installed or not allowed: %O", this.name, err);
      throw new Error("Not installed or not allowed");
    }
  }

  async getNftInfo(addr, tokenId) {
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      if (!this.lace) {
        this.lace = await this.cardano.lace.enable({ extensions: [{ cip: 95 }] });
      }
      let balance = await this.lace.getBalance();
      let value = this.wasm.Value.from_hex(balance);
      let nfts = tool.getNftInfo(value.multiasset(), tokenId);
      return nfts;
    } else {
      console.error("%s is not current address", addr);
      throw new Error("Not current address");
    }
  }

  async sendTransaction(tx) {
    if (!this.lace) {
      this.lace = await this.cardano.lace.enable({ extensions: [{ cip: 95 }] });
    }
    tx = this.wasm.Transaction.from_hex(tx);
    let witnessSet = await this.lace.signTx(tx.to_hex(), true);
    witnessSet = this.wasm.TransactionWitnessSet.from_hex(witnessSet);
    let redeemers = tx.witness_set().redeemers();
    if (redeemers) {
      witnessSet.set_redeemers(redeemers);
    }
    let transaction = this.wasm.Transaction.new(tx.body(), witnessSet, tx.auxiliary_data());
    let txHash = await this.lace.submitTx(transaction.to_hex());
    return txHash;
  }

  // customized function

  async getUtxos() {
    if (!this.lace) {
      this.lace = await this.cardano.lace.enable({ extensions: [{ cip: 95 }] });
    }
    let utxos = await this.lace.getUtxos();
    return utxos;
  }

  async getCollateral() {
    if (!this.lace) {
      this.lace = await this.cardano.lace.enable({ extensions: [{ cip: 95 }] });
    }
    let utxos = await this.lace.getCollateral();
    utxos = utxos || [];
    return utxos.slice(0, 3);
  }
}

export default Lace;
