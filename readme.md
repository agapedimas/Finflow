# Finflow: AI & Blockchain-Based Scholarship Management

**Finflow** is an innovative financial management application designed to bridge the gap between scholarship providers (corporations/institutions) and recipients (students). By integrating **Artificial Intelligence** and **Blockchain**, Finflow ensures that scholarship funds are used transparently, accurately, and accountably.

## Achievement

Developed during the **National Hackathon, IT Fair XIV at UIN Sunan Gunung Djati Bandung**, this project represented **Universitas Katolik Parahyangan** and successfully secured **2nd Place**.

## Background

Many scholarship-granting institutions struggle to monitor fund utilization post-disbursement. Major pain points include:

* **Lack of Transparency:** Real-time tracking of fund flows is often impossible.
* **Fund Misuse:** Funds are frequently diverted to non-educational expenses.
* **Data Integrity:** High risks associated with manual reporting and data manipulation.

## Our Solution

Finflow provides an end-to-end solution driven by two technological pillars:

1.  **Blockchain for Integrity:** Every transaction is recorded on the blockchain, ensuring **immutability**. This provides donors with absolute transparency and a verifiable audit trail.
2.  **AI for Spending Control:** Powered by the **Gemini API**, our AI categorizes and monitors expenditures. It automatically detects and flags transactions unrelated to academic needs, keeping the funds within the educational ecosystem.

## Key Features

* **Company Dashboard:** Real-time monitoring of fund distribution with blockchain-verified analytics.
* **Student Wallet:** A digital wallet with built-in AI controls to ensure budget compliance.
* **Transaction Transparency:** Transparent logs for providers that balance accountability with user privacy.
* **Educational Spend Validation:** Automated categorization and validation of every transaction against educational requirements.

## Tech Stack

* **Blockchain:** Solidity (Smart Contracts)
* **Artificial Intelligence:** Gemini API (Financial Analysis & Categorization)
* **Backend:** Node.js
* **Frontend:** Agape Dimas Assets (Located in: https://assets.agapedimas.com/ui/v3)

## Installation

To run Finflow locally, follow these steps:

**1. Clone the repository**
``` git
git clone https://github.com/agapedimas/finflow.git
```

**2. Create SQL database and add some environment variables**
``` env
SESSION_KEY = <any string>

SQL_USERNAME = ...
SQL_PASSWORD = ...
SQL_DATABASE = ...

GEMINI_API_KEY = ...

ADMIN_PRIVATE_KEY = ...
TOKEN_CONTRACT_ADDRESS = ...
RPC_URL = "https://polygon-amoy.g.alchemy.com/v2/wSE4tCDsWmZEDKsAGSsfs"
VAULT_WALLET_ADDRESS = ...
VAULT_PRIVATE_KEY = ...
```

**3. Install dependencies**
``` bash
npm install
```

**4. Run the server**
``` bash
npm run
```

4. Open http://localhost:1111 in your browser

## License
Finflow is licensed under the MIT License. Finflow also includes external libraries that are available under a variety of licenses.