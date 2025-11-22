// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FinflowToken is ERC20{
    // Constructor ini jalan SEKALI saat deploy
    constructor() ERC20("Finflow IDR", "FIDR") {
        // MINTING: Cetak 1 Triliun Token ke dompet pendeploy (Admin)
        // Kita pakai 0 decimals biar 1 Token = 1 Rupiah
        _mint(msg.sender, 1000000000000);
    }

    // Override decimals jadi 0
    function decimals() public view virtual override returns (uint8) {
        return 0;
    }
}