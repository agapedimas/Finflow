/**
 * FINFLOW SDK
 * Library penghubung antara Frontend UI, Web3Auth, dan Backend.
 */

// 1. KONFIGURASI UTAMA
const CONFIG = {
    // Ganti dengan Client ID Web3Auth Project Anda
    WEB3AUTH_CLIENT_ID: "BGQqw1_xgioq69pdr-MA7fO099Eg0cfi-Ko4xucSzRwfqIqLnz1Gv0r3D6QVndbWZNHfg2QAKRVuWJRUB40pRFA", 
    
    // URL Backend (Ganti localhost dengan IP Public jika deploy nanti)
    BACKEND_URL: "http://localhost:1111/api", 
    
    // Chain Config (Polygon Amoy)
    CHAIN_CONFIG: {
        chainNamespace: "eip155",
        chainId: "0x13882", 
        rpcTarget: "https://rpc-amoy.polygon.technology",
        displayName: "Polygon Amoy",
        blockExplorer: "https://amoy.polygonscan.com",
        ticker: "MATIC",
        tickerName: "Matic",
    }
};

// Global State
let web3auth = null;
let provider = null;

const Finflow = {
    
    // --- A. INISIALISASI (Wajib dipanggil di awal) ---
    init: async () => {
        try {
            if (typeof window.ethers === 'undefined') throw new Error("Ethers.js belum di-load!");
            
            // 1. Setup Chain Config & Provider
            const privateKeyProvider = new window.EthereumProvider.EthereumPrivateKeyProvider({ 
                config: { chainConfig: CONFIG.CHAIN_CONFIG } 
            });

            // 2. Setup Web3Auth Instance
            web3auth = new window.Modal.Web3Auth({
                clientId: CONFIG.WEB3AUTH_CLIENT_ID,
                web3AuthNetwork: "sapphire_devnet",
                privateKeyProvider: privateKeyProvider
            });

            // 3. SETUP ADAPTER (YANG DIPERBAIKI)
            // Hapus 'loginConfig' yang bikin error. Cukup set uxMode.
            const openloginAdapter = new window.OpenloginAdapter.OpenloginAdapter({
                adapterSettings: {
                    uxMode: "popup",
                    whiteLabel: {
                        appName: "Finflow",
                        defaultLanguage: "en",
                    }
                },
                privateKeyProvider: privateKeyProvider
            });

            // Masukkan adapter ke instance Web3Auth
            web3auth.configureAdapter(openloginAdapter);

            // 4. Init Modal
            await web3auth.initModal();
            
            if (web3auth.connected) {
                provider = web3auth.provider;
                return await Finflow.getUserInfo();
            }
            return null;
        } catch (error) {
            console.error("Finflow Init Error:", error);
            throw error;
        }
    },

    // --- B. FUNGSI AUTH ---
    login: async (loginProvider) => {
        if (!web3auth) throw new Error("SDK belum di-init");
        
        try {
            if (loginProvider) {
                // JIKA ADA PARAMETER (Misal: "google"), LANGSUNG LOGIN TANPA MODAL
                // "openlogin" adalah adapter default untuk sosial media di Web3Auth
                provider = await web3auth.connectTo("openlogin", {
                    loginProvider: loginProvider 
                });
            } else {
                // JIKA KOSONG, BUKA MODAL BAWAAN WEB3AUTH
                provider = await web3auth.connect();
            }
            
            return await Finflow.getUserInfo();
        } catch (error) {
            const errString = error.message.toLowerCase(); // atau error.toString().toLowerCase()
            if (errString.includes("closed") || errString.includes("cancel") || errString.includes("user_canceled")) {
                // JIKA USER CANCEL:
                console.log("Info: User membatalkan login (Popup ditutup).");
                
                // Penting: Pastikan status bersih (walaupun SDK biasanya auto-reset, kita pastikan return null)
                return null; 
            }
            
            // Jika error lain (bukan cancel), baru kita log sebagai error beneran
            console.error("Login Error System:", error);
            return null;
        }
    },

    logout: async () => {
        if (!web3auth) return;
        await web3auth.logout();
        provider = null;
    },

    getUserInfo: async () => {
        if (!provider) return null;
        
        // 1. Ambil Email dari Web3Auth
        const user = await web3auth.getUserInfo();
        
        // 2. Ambil Wallet dari Ethers
        const ethersProvider = new window.ethers.providers.Web3Provider(provider);
        const signer = ethersProvider.getSigner();
        const address = await signer.getAddress();

        return {
            email: user.email,
            wallet: address,
            name: user.name
        };
    },

    // --- C. FUNGSI API BACKEND (CRUD) ---
    
    // Register Funder
    registerFunder: async (data) => {
        // data = { fullName, orgName, bankName, bankAccount }
        // Otomatis ambil email/wallet dari sesi login
        const user = await Finflow.getUserInfo(); 
        if(!user) throw new Error("User belum login");

        return await _post('/auth/register/funder', {
            email: user.email,
            wallet_address: user.wallet,
            full_name: data.fullName,
            org_name: data.orgName,
            bank_name: data.bankName,
            bank_account: data.bankAccount
        });
    },

    // Register Student (Aktivasi via Token)
    registerStudent: async (data) => {
        // data = { inviteToken, fullName, bankName, bankAccount, password }
        const user = await Finflow.getUserInfo();
        return await _post('/auth/register/student', {
            invite_token: data.inviteToken,
            email: user.email,
            wallet_address: user.wallet,
            full_name: data.fullName,
            bank_name: data.bankName,
            bank_account: data.bankAccount,
            password: data.password
        });
    },

    // Register Parent
    registerParent: async (data) => {
        const user = await Finflow.getUserInfo();
        return await _post('/auth/register/parent', {
            invite_token: data.inviteToken,
            email: user.email,
            wallet_address: user.wallet,
            full_name: data.fullName,
            password: data.password
        });
    },

    // Login Biasa (Cek ke Backend)
    backendLogin: async () => {
        const user = await Finflow.getUserInfo();
        return await _post('/auth/login', {
            email: user.email,
            wallet_address: user.wallet
        });
    },

    // Create Invite
    createInvite: async (targetEmail, role) => {
        const user = await Finflow.getUserInfo();
        return await _post('/auth/invite/create', {
            wallet_address: user.wallet,
            invitee_email: targetEmail,
            role_target: role // 'student' or 'parent'
        });
    },
    
    // Ambil Data Dashboard
    getDashboard: async () => {
        const user = await Finflow.getUserInfo();
        // Request GET beda format dikit
        const res = await fetch(`${CONFIG.BACKEND_URL}/dashboard?wallet_address=${user.wallet}`);
        return await res.json();
    },

    // --- D. FUNGSI SMART CONTRACT (FRONTEND) ---
    
    // Student Cairkan Dana (Withdraw)
    withdrawFunds: async (amount) => {
        try {
            const user = await Finflow.getUserInfo();
            if (!user) throw new Error("Login dulu!");

            // Alamat Admin (Tujuan Pengembalian Token)
            // GANTI DENGAN ALAMAT ADMIN WALLET ANDA
            const ADMIN_ADDRESS = "0x_ALAMAT_WALLET_ADMIN_YANG_DEPLOY_CONTRACT"; 
            const TOKEN_ADDRESS = "0x_ALAMAT_SMART_CONTRACT_FIDR";

            // Setup Ethers di Frontend
            const provider = new window.ethers.providers.Web3Provider(window.web3auth.provider);
            const signer = provider.getSigner();
            
            // ABI Minimal untuk Transfer
            const abi = ["function transfer(address to, uint256 amount) public returns (bool)"];
            const contract = new window.ethers.Contract(TOKEN_ADDRESS, abi, signer);

            console.log(`Mengirim ${amount} token ke Admin...`);
            
            // 1. EKSEKUSI BLOCKCHAIN (Muncul Popup Sign)
            const tx = await contract.transfer(ADMIN_ADDRESS, amount.toString());
            await tx.wait(); // Tunggu sukses

            // 2. LAPOR KE BACKEND
            return await _post('/exec/withdraw', {
                wallet_address: user.wallet,
                amount: amount,
                tx_hash: tx.hash
            });

        } catch (error) {
            console.error("Withdraw Error:", error);
            return { success: false, message: error.message };
        }
    },
    
    // Admin Trigger Drip (Untuk Testing/Demo)
    triggerDripManual: async () => {
        return await _post('/exec/drip', {});
    }
};

// Helper Private untuk Fetch
async function _post(endpoint, body) {
    try {
        const response = await fetch(CONFIG.BACKEND_URL + endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        return { success: false, message: "Koneksi Gagal" };
    }
}

// Export agar bisa dipakai di file lain (jika pakai module system)
// window.Finflow = Finflow; // Atau tempel ke window biar global