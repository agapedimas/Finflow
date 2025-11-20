// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Impor console.log untuk debugging di Hardhat
import "hardhat/console.sol";

/**
 * @title TestVault
 * @dev Kontrak super sederhana untuk Spike kita
 * Hanya menyimpan satu string (message) dan memperbolehkannya diubah
 */

contract TestVault{
    string public message;

    /**
     * @dev Set pesan awal saat kontrak di deploy
     */

    constructor(string memory initMessage){
        console.log("Mengerahkan TestVault dengan pesan:", initMessage);
        message = initMessage;
    }

    /**
     * @dev Fungsi untuk mengubah pesan yang tersimpan
     */
    function updateMessage(string memory newMessage) public {
        console.log("Mengubah pesan dari '%s' ke '%s'", message, newMessage);
        message = newMessage;
    }
}