// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FinflowVault is Ownable {
    IERC20 public finflowToken;

    struct StudentPlan {
        bool isActive;
        uint256 totalEducationFund; // Saldo terkunci (Dana Pendidikan)
        uint256 lastDripTime;       // Waktu drip terakhir
    }

    mapping(address => StudentPlan) public studentPlans;

    event DripExecuted(address indexed student, uint256 amount, uint256 timestamp);
    event UrgentFundReleased(address indexed student, uint256 amount, string reason);

    constructor(address _tokenAddress) Ownable(msg.sender) {
        finflowToken = IERC20(_tokenAddress);
    }

    // 1. SETUP PLAN
    function createStudentPlan(
        address _student,
        uint256 _totalEducationFund,
        uint256 _initialDripAmount, // Drip pertama langsung cair
        uint256 _totalDepositAmount
    ) external onlyOwner {
        require(!studentPlans[_student].isActive, "Plan already exists");

        // Tarik Total Dana dari Admin ke Vault
        require(finflowToken.transferFrom(msg.sender, address(this), _totalDepositAmount), "Deposit failed");

        studentPlans[_student] = StudentPlan({
            isActive: true,
            totalEducationFund: _totalEducationFund,
            lastDripTime: block.timestamp 
        });

        // Cairkan Drip Minggu Pertama
        require(finflowToken.transfer(_student, _initialDripAmount), "First drip failed");
        emit DripExecuted(_student, _initialDripAmount, block.timestamp);
    }

    // 2. PROCESS WEEKLY DRIP (FLEXIBLE AMOUNT)
    // Nominal '_amount' dihitung oleh Backend (bisa dikurangi kalau minggu lalu ambil urgent)
    function processWeeklyDrip(address _student, uint256 _amount) external onlyOwner {
        StudentPlan storage plan = studentPlans[_student];
        require(plan.isActive, "Plan not active");
        
        // Cek Waktu (Minimal 1 Menit dari drip terakhir untuk Demo)
        require(block.timestamp >= plan.lastDripTime + 60, "Not time yet for drip"); 

        plan.lastDripTime = block.timestamp;
        
        // Transfer sesuai perintah Backend
        require(finflowToken.transfer(_student, _amount), "Drip transfer failed");
        emit DripExecuted(_student, _amount, block.timestamp);
    }

    // 3. RELEASE URGENT / EDUCATION FUND (BYPASS WAKTU)
    // Fungsi ini TIDAK mengecek 'lastDripTime'. Ini jalan tikus untuk Urgent Fund.
    function releaseSpecialFund(address _student, uint256 _amount, string memory _reason) external onlyOwner {
        StudentPlan storage plan = studentPlans[_student];
        require(plan.isActive, "Plan not active");
        
        require(finflowToken.transfer(_student, _amount), "Transfer failed");
        
        // Jika reason adalah "Education", kurangi jatah education fund
        // (Logic string comparison di Solidity agak mahal gas-nya, tapi oke buat Hackathon)
        // Disini kita simpelkan: Backend yang atur logic pengurangan di database.
        
        emit UrgentFundReleased(_student, _amount, _reason);
    }
}