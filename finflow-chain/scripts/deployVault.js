const hre = require("hardhat");

async function main(){
    // Ini adalah pesan yang akan disimpan saat kontrak pertama kali dibuat
    const initMessage = "TestVault berhasil dibuat!";

    console.log("Mulai mendeploy TestVault ke Amoy...");

    // Menggunakan HRE (Hardhat Runtime Environment) untuk deploy
    const testVault = await hre.ethers.deployContract("TestVault", [
        initMessage, // Ini adalah argumen untuk constructor
    ]);

    // Menunggu deployment selesai
    await testVault.waitForDeployment();

    // Mendapatkan alamat kontrak yang sudah di deploy
    const address = await testVault.getAddress();

    console.log(`TestVault berhasil di-deploy ke alamat: ${address}`);
}

// Pola standar untuk menjalankan script async
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});