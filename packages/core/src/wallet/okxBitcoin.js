class OkxBitcoinWallet {
    constructor(provider) {
        if (window.okxwallet?.bitcoin) {
            this.name = "okxBitcoin";
            this.wallet = window.okxwallet.bitcoin;
        }
        else {
            window.open('https://chromewebstore.google.com/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge');
            throw new Error('please install Okx Bitcoin wallet');
        }
    }
    // standard function
    async getChainId() {
        const chainId = await this.wallet.getChain();
        return chainId;
    }
    async getAccounts(network) {
        try {
            let accounts = await this.wallet.getAccounts();
            return accounts;
        }
        catch (err) {
            console.error("%s not installed or not allowed: %O", this.name, err);
            throw new Error("Not installed or not allowed");
        }
    }
    async getBalance() {
        try {
            const res = await this.wallet.getBalance();
            return res.confirmed;
        }
        catch (e) {
            console.error(e);
            throw new Error("Not used address");
        }
    }
    async sendTransaction(toAddr, satoshis, opt) {
        try {
            let txid = await this.wallet.sendBitcoin(toAddr, satoshis, opt);
            return txid;
        }
        catch (e) {
            console.log(e);
        }
    }
}
export default OkxBitcoinWallet;
