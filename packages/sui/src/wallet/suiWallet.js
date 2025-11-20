class SuiWallet {
    constructor() {
        this.name = "SuiWallet";
        this.wallet = null;
        this.chainId = "";
        let detail = {
            register: (wallet) => {
                this.wallet = wallet;
                console.debug("got SuiWallet");
            }
        };
        window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail }));
    }
    // standard function
    async checkWallet() {
        if (!this.wallet) {
            throw new Error("Not installed or not ready");
        }
        if (this.wallet.accounts.length === 0) {
            try {
                await this.wallet.features['standard:connect'].connect();
            }
            catch (err) {
                throw new Error("Not connected");
            }
        }
    }
    async getChainId() {
        if (!this.chainId) {
            await this.checkWallet();
            this.chainId = this.wallet.accounts[0]?.chains[0];
        }
        return this.chainId;
    }
    async getAccounts() {
        await this.checkWallet();
        return [this.wallet.accounts[0].address];
    }
    async getBalance(address, tokenAccount = "") {
        throw new Error("Not support getBalance");
    }
    async sendTransaction(tx, sender) {
        let { digest } = await this.wallet.features['sui:signAndExecuteTransaction'].signAndExecuteTransaction({
            transaction: tx,
            options: {
                showEffects: true,
                showEvents: true,
                showInput: true,
            },
            chain: this.chainId,
            account: { address: sender }
        });
        return digest;
    }
}
export default SuiWallet;
