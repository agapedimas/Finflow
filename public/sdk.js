/**
 * FINFLOW SDK (FIXED VERSION)
 */

const CONFIG = {
  // GANTI DENGAN CLIENT ID DARI DASHBOARD WEB3AUTH ANDA
  WEB3AUTH_CLIENT_ID: "BGQqw1_xgioq69pdr-MA7fO099Eg0cfi-Ko4xucSzRwfqIqLnz1Gv0r3D6QVndbWZNHfg2QAKRVuWJRUB40pRFA",

  // URL BACKEND
  BACKEND_URL: "http://localhost:1111/api",

  CHAIN_CONFIG: {
    chainNamespace: "eip155",
    chainId: "0x13882", // Polygon Amoy
    rpcTarget: "https://rpc-amoy.polygon.technology",
    displayName: "Polygon Amoy",
    blockExplorer: "https://amoy.polygonscan.com",
    ticker: "MATIC",
    tickerName: "Matic",
  },
};

let web3auth = null;
let provider = null;

const Finflow = {
  // 1. INISIALISASI
  init: async () => {
    // Cek Library Ethers
    if (typeof window.ethers === "undefined") {
      console.error("CRITICAL: Library Ethers.js belum dimuat di HTML!");
      return null;
    }

    try {
      const privateKeyProvider = new window.EthereumProvider.EthereumPrivateKeyProvider({
        config: { chainConfig: CONFIG.CHAIN_CONFIG },
      });

      web3auth = new window.Modal.Web3Auth({
        clientId: CONFIG.WEB3AUTH_CLIENT_ID,
        web3AuthNetwork: "sapphire_devnet",
        privateKeyProvider: privateKeyProvider,
      });

      await web3auth.initModal();

      if (web3auth.connected) {
        provider = web3auth.provider;
        return await _getUserInfo();
      }
      return null;
    } catch (error) {
      console.error("SDK Init Error:", error);
      return null;
    }
  },

  // 2. LOGIN
  login: async () => {
    if (!web3auth) throw new Error("SDK belum siap. Cek koneksi internet.");
    provider = await web3auth.connect();

    // Auto-login ke backend untuk dapat Session Cookie
    const user = await _getUserInfo();
    const result = await Finflow.backendLogin(user);

    return result;
  },

  logout: async () => {
        console.log("Logging out...");

        // 1. Logout dari Web3Auth (Membersihkan sesi Google di Browser)
        if (web3auth) {
            await web3auth.logout();
        }

        // 2. Panggil Backend untuk Hapus Session Database
        try {
            await fetch(CONFIG.BACKEND_URL + '/auth/logout', {
                method: 'POST',
                credentials: 'include' // Bawa cookie biar backend tau siapa yg mau di-logout
            });
        } catch (e) {
            console.error("Backend logout warning:", e);
        }

        // 3. Bersihkan LocalStorage (Jejak-jejak Frontend)
        provider = null;
        localStorage.clear();
        sessionStorage.clear();

        // 4. Redirect ke Halaman Login
        window.location.href = "/signin.html"; // Atau /index.html
    },

  // 3. API WRAPPERS

  // Login Backend (Tukar Wallet jadi Session)
  backendLogin: async (userObj = null) => {
    const user = userObj || (await _getUserInfo());
    return await _post("/auth/login", {
      email: user.email,
      wallet_address: user.wallet,
    });
  },

  registerFunder: async (data) => {
    const user = await _getUserInfo();
    return await _post("/auth/register/funder", {
      email: user.email,
      wallet_address: user.wallet,
      full_name: data.fullName,
      org_name: data.orgName,
      bank_name: data.bankName,
      bank_account: data.bankAccount,
    });
  },

  registerStudent: async (data) => {
    const user = await _getUserInfo();
    return await _post("/auth/register/student", {
      invite_token: data.inviteToken, // PENTING
      email: user.email,
      wallet_address: user.wallet,
      full_name: data.fullName,
      bank_name: data.bankName,
      bank_account: data.bankAccount,
      password: "dummy_password",
    });
  },

  registerParent: async (data) => {
    const user = await _getUserInfo();
    return await _post("/auth/register/parent", {
      invite_token: data.inviteToken,
      email: user.email,
      wallet_address: user.wallet,
      full_name: data.fullName,
      password: "dummy_password",
    });
  },
};

// --- HELPERS ---
async function _getUserInfo() {
  if (!web3auth || !web3auth.connected) return null;
  const user = await web3auth.getUserInfo();
  const p = new window.ethers.providers.Web3Provider(provider);
  const s = p.getSigner();
  const a = await s.getAddress();
  return { email: user.email, wallet: a, name: user.name };
}

async function _post(endpoint, body) {
  try {
    return await $.post(CONFIG.BACKEND_URL + endpoint, body);
    // const res = await fetch(CONFIG.BACKEND_URL + endpoint, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(body),
    //   credentials: "include", // PENTING: Session Cookie
    // });
    // console.log(res.body);
    // return await res.json();
  } catch (e) {
    console.error(e);
    return { success: false, message: "Gagal koneksi ke server backend" };
  }
}

window.Finflow = Finflow;
