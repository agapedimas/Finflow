const clientId = "BGQqw1_xgioq69pdr-MA7fO099Eg0cfi-Ko4xucSzRwfqIqLnz1Gv0r3D6QVndbWZNHfg2QAKRVuWJRUB40pRFA"; 
const backendUrl = "http://localhost:1111/api"; 

const chainConfig = {
    chainNamespace: "eip155",
    chainId: "0x13882", 
    rpcTarget: "https://rpc-amoy.polygon.technology",
    displayName: "Polygon Amoy",
    blockExplorer: "https://amoy.polygonscan.com",
    ticker: "MATIC",
    tickerName: "Matic",
};

let web3auth = null;
let provider = null;
let userEmail = "";
let userWallet = "";

// INISIALISASI
window.onload = async () => {
    try {
        // 1. Cek Magic Link
        const urlParams = new URLSearchParams(window.location.search);
        const magicToken = urlParams.get('token');
        const actionRole = urlParams.get('role'); 

        if (magicToken && actionRole) {
            console.log("🔗 Magic Link Detected!");
            setTimeout(() => {
                if (actionRole === 'student') showSection('sec-student');
                if (actionRole === 'parent') showSection('sec-parent');
                
                const inputId = actionRole === 'student' ? 's_token' : 'p_token';
                const inputField = document.getElementById(inputId);
                if (inputField) {
                    inputField.value = magicToken;
                    inputField.style.backgroundColor = "#e8f0fe"; 
                }
                alert("🎟️ Token Undangan terdeteksi! Silakan Login untuk melanjutkan.");
            }, 1000);
        }

        // 2. Init Web3Auth (v9 Fix)
        const privateKeyProvider = new window.EthereumProvider.EthereumPrivateKeyProvider({ config: { chainConfig } });
        web3auth = new window.Modal.Web3Auth({
            clientId,
            web3AuthNetwork: "sapphire_devnet",
            privateKeyProvider: privateKeyProvider 
        });

        await web3auth.initModal();

        if (web3auth.connected) {
            provider = web3auth.provider;
            await fetchUserInfo();
        }
    } catch (error) {
        console.error("Init Error:", error);
    }
};

// FUNGSI HELPER
async function loginWeb3() {
    if (!web3auth) return alert("Web3Auth belum siap");
    provider = await web3auth.connect();
    await fetchUserInfo();
}

async function logoutWeb3() {
    if (!web3auth) return;
    await web3auth.logout();
    provider = null; userEmail = ""; userWallet = "";
    updateUI(false);
}

async function fetchUserInfo() {
    if (!provider) return;
    const user = await web3auth.getUserInfo();
    userEmail = user.email;

    const ethersProvider = new window.ethers.providers.Web3Provider(provider);
    const signer = ethersProvider.getSigner();
    userWallet = await signer.getAddress();

    updateUI(true);
}

function updateUI(isLoggedIn) {
    if (isLoggedIn) {
        document.getElementById("connectionStatus").innerText = "Connected ✅";
        document.getElementById("myEmail").innerText = userEmail;
        document.getElementById("myWallet").innerText = userWallet;
        document.getElementById("btnLogin").classList.add("hidden");
        document.getElementById("btnLogout").classList.remove("hidden");
        document.getElementById("scenario-menu").classList.remove("hidden");
    } else {
        document.getElementById("connectionStatus").innerText = "Disconnected ❌";
        document.getElementById("myEmail").innerText = "-";
        document.getElementById("myWallet").innerText = "-";
        document.getElementById("btnLogin").classList.remove("hidden");
        document.getElementById("btnLogout").classList.add("hidden");
        document.getElementById("scenario-menu").classList.add("hidden");
    }
}

function showSection(id) {
    document.querySelectorAll('.box').forEach(b => b.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

// API CALLS
async function apiRegisterFunder(e) {
    e.preventDefault();
    const payload = {
        email: userEmail,
        wallet_address: userWallet,
        full_name: document.getElementById("f_name").value,
        org_name: document.getElementById("f_org").value,
        bank_name: document.getElementById("f_bank").value,
        bank_account: document.getElementById("f_rek").value
    };
    sendPostRequest("/auth/register/funder", payload);
}

async function apiCreateInvite(e) {
    e.preventDefault();
    const payload = {
        wallet_address: userWallet,
        invitee_email: document.getElementById("i_email").value,
        role_target: document.getElementById("i_role").value
    };
    const res = await sendPostRequest("/auth/invite/create", payload);
    if (res?.success) {
        document.getElementById("inviteResult").innerHTML = 
            `Token: <b>${res.data.token}</b><br>Link: <a href="${res.data.link}" target="_blank">Klik Disini</a>`;
    }
}

async function apiRegisterStudent(e) {
    e.preventDefault();
    const payload = {
        invite_token: document.getElementById("s_token").value,
        email: userEmail,
        wallet_address: userWallet,
        full_name: document.getElementById("s_name").value,
        bank_name: document.getElementById("s_bank").value,
        bank_account: document.getElementById("s_rek").value
    };
    sendPostRequest("/auth/register/student", payload);
}

async function apiRegisterParent(e) {
    e.preventDefault();
    const payload = {
        invite_token: document.getElementById("p_token").value,
        email: userEmail,
        wallet_address: userWallet,
        full_name: document.getElementById("p_name").value
    };
    sendPostRequest("/auth/register/parent", payload);
}

async function apiLogin() {
    const payload = { email: userEmail, wallet_address: userWallet };
    sendPostRequest("/auth/login", payload);
}

async function sendPostRequest(endpoint, body) {
    try {
        const res = await fetch(backendUrl + endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            credentials: 'include'
        });
        const json = await res.json();
        if(json.success) alert("SUKSES: " + json.message);
        else alert("GAGAL: " + json.message);
        return json;
    } catch (err) { alert("Error Koneksi"); return null; }
}