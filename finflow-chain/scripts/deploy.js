const hre = require("hardhat");

async function main(){
    console.log("Mulai deploy FinflowToken...");

    const token = await hre.ethers.deployContract("FinflowToken");
    await token.waitForDeployment();

    const address = await token.getAddress();
    console.log(`FinflowToken berhasil di-deploy ke alamat: ${address}`);
    console.log("Simpan address ini untuk Backend!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});