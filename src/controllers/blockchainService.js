
const { ethers } = require("ethers");

// Konfigurasi
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;
const TOKEN_ADDRESS = process.env.TOKEN_CONTRACT_ADDRESS;
const VAULT_ADDRESS = process.env.VAULT_CONTRACT_ADDRESS;

if (!RPC_URL || !PRIVATE_KEY || !TOKEN_ADDRESS || !VAULT_ADDRESS) {
    console.error("ERROR: Konfigurasi Blockchain di .env belum lengkap!");
}

// Setup Provider & Wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const adminWallet = new ethers.Wallet(PRIVATE_KEY, provider);

// ABI (Kamus Kontrak) - Disesuaikan dengan FinflowVault Flexible Drip
const TOKEN_ABI = ["function approve(address spender, uint256 amount) public returns (bool)"];
const VAULT_ABI = [
    "function createStudentPlan(address _student, uint256 _totalEducationFund, uint256 _initialDripAmount, uint256 _totalDepositAmount) external",
    "function processWeeklyDrip(address _student, uint256 _amount) external", // <-- Perhatikan ada parameter _amount
    "function releaseSpecialFund(address _student, uint256 _amount, string memory _reason) external" // <-- Fungsi Bypass Waktu
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

            // --- TAMBAHAN: CEK SALDO ADMIN DULU ---
            const adminAddr = adminWallet.address;
            const adminBalance = await tokenContract.balanceOf(adminAddr);
            
            if (adminBalance < totalDeposit) {
                throw new Error(`Saldo Admin Kurang! Butuh: ${totalDeposit}, Punya: ${adminBalance}`);
            }
            // -------------------------------------

            console.log(`[BC] Total Deposit: ${totalDeposit}`);

            // A. Approve Token
            // Cek allowance dulu (Opsional, tapi biar hemat gas kalau sudah approve)
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
                dripBN,
                totalDeposit
            );
            const receipt = await txCreate.wait();
            return receipt.hash;

        } catch (error) {
            // Error handling yang lebih rapi
            console.error("[BC ERROR] Setup Plan:", error.message);
            throw error;
        }
    },

    // 2. JALANKAN DRIP (Flexible Amount)
    executeDrip: async (studentAddress, amount) => {
        try {
            console.log(`[BC] Drip ${amount} to ${studentAddress}`);
            const amountBN = BigInt(Math.floor(amount));
            
            // Panggil fungsi processWeeklyDrip dengan nominal dinamis
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
            
            // Panggil fungsi releaseSpecialFund (Bypass Waktu)
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