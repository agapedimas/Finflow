
const { ethers } = require("ethers");

// Konfigurasi
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;
const TOKEN_ADDRESS = process.env.TOKEN_CONTRACT_ADDRESS;
const VAULT_ADDRESS = process.env.VAULT_CONTRACT_ADDRESS;

if (!RPC_URL || !PRIVATE_KEY || !TOKEN_ADDRESS || !VAULT_ADDRESS) {
    console.error("❌ ERROR: Konfigurasi Blockchain di .env belum lengkap!");
}

// Setup Provider & Wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const adminWallet = new ethers.Wallet(PRIVATE_KEY, provider);

// ABI (Kamus Kontrak) - SUDAH DIPERBAIKI LENGKAP
const TOKEN_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)" // <-- Baris ini yang sebelumnya hilang
];

const VAULT_ABI = [
    "function createStudentPlan(address _student, uint256 _totalEducationFund, uint256 _initialDripAmount, uint256 _totalDepositAmount) external",
    "function processWeeklyDrip(address _student, uint256 _amount) external",
    "function releaseSpecialFund(address _student, uint256 _amount, string memory _reason) external"
];

const tokenContract = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, adminWallet);
const vaultContract = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, adminWallet);

module.exports = {
    // 1. SETUP PLAN (Dipanggil saat Aktivasi Budget)
    setupVaultPlan: async (studentAddress, totalEdu, initialDripAmount, totalWeeks) => {
        try {
            console.log(`[BC] 🚀 Setup Plan Start: ${studentAddress}`);
            
            const eduBN = BigInt(Math.floor(totalEdu));
            const dripBN = BigInt(Math.floor(initialDripAmount));
            const weeksBN = BigInt(totalWeeks);
            const totalDeposit = eduBN + (dripBN * weeksBN);

            // Cek Saldo Admin Dulu
            const adminAddr = adminWallet.address;
            const adminBalance = await tokenContract.balanceOf(adminAddr); // Sekarang fungsi ini sudah dikenali
            
            if (adminBalance < totalDeposit) {
                throw new Error(`Saldo Admin Kurang! Butuh: ${totalDeposit}, Punya: ${adminBalance}`);
            }

            console.log(`[BC] Total Deposit: ${totalDeposit}`);

            // A. Approve Token
            const currentAllowance = await tokenContract.allowance(adminAddr, VAULT_ADDRESS);
            if (currentAllowance < totalDeposit) {
                console.log("[BC] Approving Token...");
                const txApprove = await tokenContract.approve(VAULT_ADDRESS, totalDeposit);
                await txApprove.wait();
            } else {
                console.log("[BC] Allowance sudah cukup, skip approve.");
            }

            // B. Create Plan
            console.log("[BC] Creating Plan on Vault...");
            const txCreate = await vaultContract.createStudentPlan(
                studentAddress,
                eduBN,
                dripBN, // Drip pertama langsung cair saat setup
                totalDeposit
            );
            const receipt = await txCreate.wait();
            
            console.log(`[BC] ✅ Plan Created! Hash: ${receipt.hash}`);
            return receipt.hash;

        } catch (error) {
            console.error("[BC ERROR] Setup Plan:", error.message);
            throw error;
        }
    },

    // 2. JALANKAN DRIP (Flexible Amount)
    executeDrip: async (studentAddress, amount) => {
        try {
            console.log(`[BC] Drip ${amount} to ${studentAddress}`);
            const amountBN = BigInt(Math.floor(amount));
            
            const tx = await vaultContract.processWeeklyDrip(studentAddress, amountBN);
            const receipt = await tx.wait();
            
            console.log(`[BC] ✅ Drip Sukses! Hash: ${receipt.hash}`);
            return receipt.hash;
        } catch (error) {
            console.error(`[BC ERROR] Drip Gagal: ${error.reason || error.message}`);
            return null;
        }
    },

    // 3. CAIRKAN DANA KHUSUS (Urgent / Edu)
    releaseFund: async (studentAddress, amount, reason) => {
        try {
            console.log(`[BC] Release Special Fund: ${amount}`);
            const amountBN = BigInt(Math.floor(amount));
            
            const tx = await vaultContract.releaseSpecialFund(studentAddress, amountBN, reason);
            const receipt = await tx.wait();
            
            console.log(`[BC] ✅ Release Sukses! Hash: ${receipt.hash}`);
            return receipt.hash;
        } catch (error) {
            console.error("[BC ERROR] Release Fund:", error.message);
            throw error;
        }
    }
};