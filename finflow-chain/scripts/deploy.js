const hre = require("hardhat");

async function main() {
    console.log("Mulai Deploy System Finflow...");

    // 1. Deploy Token
    const token = await hre.ethers.deployContract("FinflowToken");
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log(`✅ FinflowToken Address: ${tokenAddress}`);

    // 2. Deploy Vault (Brankas)
    // Kita masukkan tokenAddress ke dalam constructor Vault
    const vault = await hre.ethers.deployContract("FinflowVault", [tokenAddress]);
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();
    console.log(`✅ FinflowVault Address: ${vaultAddress}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});