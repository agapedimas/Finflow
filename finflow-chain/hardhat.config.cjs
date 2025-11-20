require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config(); // Ini akan memuat file .env Anda

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.0", // Sesuaikan dengan versi di TestVault.sol
  networks: {
    // Definisikan jaringan Amoy di sini
    amoy: {
      url: process.env.AMOY_RPC_URL, // Mengambil URL dari file .env
      accounts: [process.env.PRIVATE_KEY], // Mengambil private key dari .env
    },
  },
};
