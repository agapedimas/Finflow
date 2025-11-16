const {ethers} = require("ethers");
require("dotenv").config(); // Muat .env untuk RPC dan Private Key

// 1. Ambil ABI (Antarmuka Kontrak)
// ABI adalah 'buku manual' JSON tentang cara berbicara dengan kontrak Anda
// Hardhat membuatnya secara otomatis saat Anda compile
const contractABI = require("./artifacts/contracts/TestVault.sol/TestVault.json").abi;

// 2. Tentukan Alamat Kontrak
const contractAddress = "0xb62dd96139e4ba1E2254d56C30eD1938aa4799B9";

// 3. Siapkan Koneksi (Provider & Signer)
// Provider = Koneksi 'read-only' ke blockchain (via Alchemy)
const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
// Signer = Objek wallet yang bisa mengirim transaksi 'write' (via Private Key)
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// 4. Buat Objek Kontrak
// Ini adalah objek JavaScript yang mewakili kontrak Anda di blockchain
const testVaultContract = new ethers.Contract(contractAddress, contractABI, signer);

async function main() {
    try {
        console.log("--- MEMBACA PESAN SAAT INI ---");

        // Memanggil fungsi 'read-only' (message)
        const currentMessage = await testVaultContract.message();
        console.log("Pesan saat ini di TestVault:", currentMessage);

        console.log("\n--- MEMPERBARUI PESAN ---");
        const newMessage = "Halo dari Finflow di Amoy!";

        // Memanggil fungsi 'write' (updateMessage)
        const tx = await testVaultContract.updateMessage(newMessage);
        console.log(`Transaksi dikirim... hash: ${tx.hash}`);

        // Menunggu tranaksi selesai di mining
        await tx.wait();
        console.log("Transaksi berhasil di mining!");

        console.log("\n--- MEMBACA PESAN BARU ---");
        const updatedMessage = await testVaultContract.message();
        console.log("Pesan baru di TestVault:", updatedMessage);

        if(updatedMessage === newMessage){
            console.log("\n✅ SUKSES! Spike berhasil. Node.js bisa membaca & menulis ke blockchain.");
        } else {
            console.log("\n❌ GAGAL! Sesuatu tidak beres.");
        }
    } catch (error) {
        console.error("\nTerjadi kesalahan:", error);
    }
}

main();