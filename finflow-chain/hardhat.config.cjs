require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config(); // Ini akan memuat file .env Anda

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20", // Sesuaikan dengan versi di TestVault.sol
  networks: {
    // Definisikan jaringan Amoy di sini
    amoy: {
      url: process.env.AMOY_RPC_URL, // Mengambil URL dari file .env
      accounts: [process.env.PRIVATE_KEY], // Mengambil private key dari .env
      chainId: 80002, // Chain ID resmi Polygon Amoy
    },
  },
};
