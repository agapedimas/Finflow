/**
 * FINFLOW SDK (FINAL SESSION-BASED VERSION)
 * Library penghubung Frontend UI <-> Web3Auth <-> Backend Finflow
 */

const CONFIG = {
    WEB3AUTH_CLIENT_ID: "BGQqw1_xgioq69pdr-MA7fO099Eg0cfi-Ko4xucSzRwfqIqLnz1Gv0r3D6QVndbWZNHfg2QAKRVuWJRUB40pRFA", 
    BACKEND_URL: "http://localhost:5000/api", // Ganti jika deploy
    
    // Chain Config (Polygon Amoy)
    CHAIN_CONFIG: {
        chainNamespace: "eip155",
        chainId: "0x13882", 
        rpcTarget: "https://rpc-amoy.polygon.technology",
        displayName: "Polygon Amoy",
        blockExplorer: "https://amoy.polygonscan.com",
        ticker: "MATIC",
        tickerName: "Matic",
    },
    
    // ALAMAT KONTRAK & ADMIN (Isi dengan alamat asli setelah deploy)
    CONTRACTS: {
        TOKEN: "0x_ALAMAT_TOKEN_FIDR",
        ADMIN_WALLET: "0x_ALAMAT_WALLET_ADMIN_BACKEND"
    }
};

// Global State
let web3auth = null;
let provider = null;

const Finflow = {
    
    // --- A. CORE AUTH (WEB3AUTH) ---
    
    init: async () => {
        if (typeof window.ethers === 'undefined') throw new Error("Ethers.js belum di-load!");

        const privateKeyProvider = new window.EthereumProvider.EthereumPrivateKeyProvider({ 
            config: { chainConfig: CONFIG.CHAIN_CONFIG } 
        });

        web3auth = new window.Modal.Web3Auth({
            clientId: CONFIG.WEB3AUTH_CLIENT_ID,
            web3AuthNetwork: "sapphire_devnet",
            privateKeyProvider: privateKeyProvider
        });

        await web3auth.initModal();
        
        if (web3auth.connected) {
            provider = web3auth.provider;
            return await _getWalletAndEmail(); // Return info user buat UI
        }
        return null;
    },

    login: async () => {
        if (!web3auth) throw new Error("SDK belum di-init");
        provider = await web3auth.connect();
        return await _getWalletAndEmail();
    },

    logout: async () => {
        if (!web3auth) return;
        await web3auth.logout();
        provider = null;
        // Panggil logout backend juga buat hapus session
        // await fetch(CONFIG.BACKEND_URL + '/auth/logout'); 
    },

    // --- B. AUTH BACKEND (PUBLIC ENDPOINTS) ---
    
    // 1. Login Backend (Menukar Wallet jadi Session Cookie)
    backendLogin: async () => {
        const user = await _getWalletAndEmail();
        return await _post('/auth/login', {
            email: user.email,
            wallet_address: user.wallet
        });
    },

    // 2. Register Funder
    registerFunder: async (data) => {
        const user = await _getWalletAndEmail();
        return await _post('/auth/register/funder', {
            email: user.email,
            wallet_address: user.wallet,
            full_name: data.fullName,
            org_name: data.orgName,
            bank_name: data.bankName,
            bank_account: data.bankAccount
        });
    },

    // 3. Register Student (Invite)
    registerStudent: async (data) => {
        const user = await _getWalletAndEmail();
        return await _post('/auth/register/student', {
            invite_token: data.inviteToken,
            email: user.email,
            wallet_address: user.wallet,
            full_name: data.fullName,
            bank_name: data.bankName,
            bank_account: data.bankAccount,
            password: "password_dummy" // Backend butuh ini meski dummy
        });
    },

    // 4. Register Parent (Invite)
    registerParent: async (data) => {
        const user = await _getWalletAndEmail();
        return await _post('/auth/register/parent', {
            invite_token: data.inviteToken,
            email: user.email,
            wallet_address: user.wallet,
            full_name: data.fullName,
            password: "password_dummy"
        });
    },

    // --- C. FITUR PROTECTED (SESSION BASED) ---
    // Perhatikan: Tidak ada param 'wallet_address' yang dikirim di sini!
    
    // 1. Dashboard & Insight
    getDashboard: async () => _get('/dashboard'),
    getInsights: async () => _get('/student/insights'),
    getReport: async () => _get('/student/report'),

    // 2. Invite System
    createInvite: async (emailTujuan, role) => {
        return await _post('/auth/invite/create', {
            invitee_email: emailTujuan,
            role_target: role
        });
    },

    // 3. Funding & Budgeting
    initiateFunding: async (data) => {
        return await _post('/funding/init', data); // data = {student_email, total_amount, ...}
    },
    
    parentTopup: async (amount) => {
        return await _post('/funding/topup', { amount: amount });
    },

    submitBudgetPlan: async (data) => {
        return await _post('/funding/finalize', {
            alloc_needs: data.needs,
            alloc_wants: data.wants,
            alloc_edu: data.edu
        });
    },

    confirmPayment: async (fundingIds, amount) => {
        return await _post('/funding/pay', {
            funding_ids: fundingIds,
            amount_paid: amount
        });
    },

    // 4. Transaction & Execution
    addTransaction: async (data) => {
        // data = { amount, category_id, description, ... }
        return await _post('/transaction/add', data);
    },

    requestUrgent: async (amount, reason, imgUrl) => {
        return await _post('/exec/urgent', {
            amount: amount,
            reason: reason,
            proof_image_url: imgUrl
        });
    },

    requestEducation: async (amount, desc, imgUrl) => {
        return await _post('/exec/edu/post', { // Reimburse
            amount: amount,
            description: desc,
            proof_image_url: imgUrl
        });
    },

    // --- D. BLOCKCHAIN ACTION (WITHDRAWAL) ---
    
    withdrawFunds: async (amount) => {
        try {
            // 1. Siapkan Kontrak
            const provider = new window.ethers.providers.Web3Provider(window.web3auth.provider);
            const signer = provider.getSigner();
            const contract = new window.ethers.Contract(
                CONFIG.CONTRACTS.TOKEN, 
                ["function transfer(address to, uint256 amount) public returns (bool)"], 
                signer
            );

            console.log(`Mengirim ${amount} token ke Admin...`);
            
            // 2. Eksekusi (Popup Privy Muncul)
            const tx = await contract.transfer(CONFIG.CONTRACTS.ADMIN_WALLET, amount.toString());
            await tx.wait(); 

            // 3. Lapor Backend (Bawa Session Cookie)
            return await _post('/exec/withdraw', {
                amount: amount,
                tx_hash: tx.hash
            });

        } catch (error) {
            console.error("Withdraw Error:", error);
            return { success: false, message: error.message };
        }
    },
    
    // Admin Only
    triggerDrip: async () => _post('/exec/drip', {})
};

// --- PRIVATE HELPERS ---

async function _getWalletAndEmail() {
    const user = await web3auth.getUserInfo();
    const ethersProvider = new window.ethers.providers.Web3Provider(provider);
    const signer = ethersProvider.getSigner();
    const address = await signer.getAddress();
    return { email: user.email, wallet: address, name: user.name };
}

async function _post(endpoint, body) {
    try {
        const response = await fetch(CONFIG.BACKEND_URL + endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            credentials: 'include' // <--- INI KUNCI SESSION AUTH
        });
        return await response.json();
    } catch (e) { return { success: false, message: "Network Error" }; }
}

async function _get(endpoint) {
    try {
        const response = await fetch(CONFIG.BACKEND_URL + endpoint, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: 'include' // <--- INI JUGA
        });
        return await response.json();
    } catch (e) { return { success: false, message: "Network Error" }; }
}

// Expose to Window
window.Finflow = Finflow;