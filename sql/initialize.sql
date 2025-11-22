-- =======================================================
-- 1. SETUP AWAL DAN PERINTAH CLEANUP
-- =======================================================
SET time_zone = '+07:00';
SET FOREIGN_KEY_CHECKS = 0; -- Nonaktifkan cek FK sementara untuk mempermudah penghapusan dan pembuatan ulang

-- Hapus data uji lama untuk pengujian berulang yang bersih (DELETE FROM tabel anak ke tabel induk)
-- DELETE FROM smart_contracts;
-- DELETE FROM funding_allocation;
-- DELETE FROM funding;
-- DELETE FROM chat_history;
-- DELETE FROM transactions;
-- DELETE FROM accounts_student;
-- DELETE FROM accounts_funder;
-- DELETE FROM accounts;
-- DELETE FROM allocation_categories;
-- DELETE FROM authentication;
-- DELETE FROM budget_plan;

-- Catatan: Perintah DELETE di atas hanya menghapus data, bukan tabel. 
-- Jika ingin menghapus tabel (saat migrasi besar): DROP TABLE IF EXISTS `nama_tabel`;

-- =======================================================
-- 2. CREATE TABLES: MASTER DAN ACCOUNTS (HARUS DI AWAL)
-- =======================================================

-- 2.1 CATEGORIES (Master Data untuk Kategori Transaksi)
CREATE TABLE IF NOT EXISTS `allocation_categories` (
    `id` INT UNSIGNED PRIMARY KEY, 
    `category_name` VARCHAR(50) UNIQUE NOT NULL, 
    `allocation_type` ENUM('Needs', 'Wants', 'Education', 'Personal') NOT NULL, -- Menambahkan tipe alokasi di sini
    
    UNIQUE KEY `uk_category_name` (`category_name`)
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 2.2 ACCOUNTS (Tabel Induk)
CREATE TABLE IF NOT EXISTS `accounts` 
(
    `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `username` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `displayname` text COLLATE utf8mb4_bin,
    `password` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `phonenumber` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `email` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `wallet_address` varchar(255) CHARACTER SET ascii COLLATE ascii_bin UNIQUE NULL,
    `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, 
    `avatarversion` int UNSIGNED NOT NULL DEFAULT 1,
        PRIMARY KEY (`id`), 
        UNIQUE KEY `username` (`username`),
        UNIQUE KEY `email` (`email`)
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 2.3 ACCOUNTS_STUDENT
CREATE TABLE IF NOT EXISTS `accounts_student` 
(
    `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `balance` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        PRIMARY KEY (`id`),
        CONSTRAINT `fk_accounts_student_acc` 
            FOREIGN KEY (`id`) REFERENCES `accounts`(`id`) 
            ON DELETE CASCADE
            ON UPDATE CASCADE
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 2.4 ACCOUNTS_FUNDER
CREATE TABLE IF NOT EXISTS `accounts_funder` 
(
    `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `type` int UNSIGNED NOT NULL,  -- 0: beasiswa, 1: parent
        PRIMARY KEY (`id`), 
        CONSTRAINT `fk_accounts_funder_acc` 
            FOREIGN KEY (`id`) REFERENCES `accounts`(`id`) 
            ON DELETE CASCADE
            ON UPDATE CASCADE
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 2.5 AUTHENTICATION
CREATE TABLE IF NOT EXISTS `authentication` 
(
    `id` int(11) NOT NULL AUTO_INCREMENT, 
    `user` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `ip` varchar(45) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `time` varchar(25) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        PRIMARY KEY (`id`),
        CONSTRAINT `fk_authentication_user` 
            FOREIGN KEY (`user`) REFERENCES `accounts`(`id`) 
            ON DELETE CASCADE
            ON UPDATE CASCADE
) 
ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;

-- =======================================================
-- 3. CREATE TABLES: KETERGANTUNGAN FUNGSI (Funding, Transaction, Budget)
-- =======================================================

-- 3.1 FUNDING (Perjanjian Pendanaan Funder-Student)
CREATE TABLE IF NOT EXISTS `funding` (
    `funding_id` VARCHAR(128) PRIMARY KEY NOT NULL, 
    `funder_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `student_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `total_monthly_fund` DECIMAL(10, 2) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `status` ENUM('Active', 'Completed', 'Canceled') NOT NULL DEFAULT 'Active', 
    
    FOREIGN KEY (`funder_id`) REFERENCES `accounts_funder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (`student_id`) REFERENCES `accounts_student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    
    UNIQUE KEY `uk_funder_student_active` (`funder_id`, `student_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 3.2 FUNDING_ALLOCATION (Aturan Budget dan Drip)
CREATE TABLE IF NOT EXISTS `funding_allocation` (
    `allocation_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `funding_id` VARCHAR(128) NOT NULL,
    `category_id` INT UNSIGNED NOT NULL,
    `monthly_budget` DECIMAL(10, 2) NOT NULL,
    `drip_frequency` ENUM('Monthly', 'Weekly', 'Locked') NOT NULL,
    `drip_amount` DECIMAL(10, 2) NULL, 
    
    FOREIGN KEY (`funding_id`) REFERENCES `funding`(`funding_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (`category_id`) REFERENCES `allocation_categories`(`id`) ON UPDATE CASCADE
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 3.3 TRANSACTIONS (Pemasukan dan Pengeluaran)
CREATE TABLE IF NOT EXISTS `transactions` (
    `transaction_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `student_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    
    `transaction_date` DATETIME NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `type` ENUM('Income', 'Expense') NOT NULL,
    
    `category_id` INT UNSIGNED NOT NULL, 
    `funding_id` VARCHAR(128) NULL, -- Referensi ke funding jika dibayar dari dana Funder
    
    `is_verified_by_ai` BOOLEAN DEFAULT FALSE, 
    `raw_description` VARCHAR(255) NULL,
    
    FOREIGN KEY (`student_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (`category_id`) REFERENCES `allocation_categories`(`id`) ON UPDATE CASCADE,
    FOREIGN KEY (`funding_id`) REFERENCES `funding`(`funding_id`) ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX `idx_student_date_type` (`student_id`, `transaction_date`, `type`),
    INDEX `idx_category_allocation` (`category_id`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 3.4 SMART_CONTRACTS (Record On-Chain)
CREATE TABLE IF NOT EXISTS `smart_contracts` (
    `contract_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `funding_id` VARCHAR(128) UNIQUE NOT NULL, 
    
    `contract_address` VARCHAR(42) UNIQUE NOT NULL, 
    `usdc_token_address` VARCHAR(42) NOT NULL, 
    
    `is_locked_education` BOOLEAN DEFAULT TRUE,
    `last_drip_date` DATE NULL, 
    `total_drip_count` INT DEFAULT 0, 
    
    FOREIGN KEY (`funding_id`) REFERENCES `funding`(`funding_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 3.5 BUDGET_PLAN (Rencana Pengeluaran Bulanan Student)
CREATE TABLE IF NOT EXISTS `budget_plan` (
    `id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `planner_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    
    `item_name` VARCHAR(255) NOT NULL,
    `category_id` INT UNSIGNED NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `quantity` INT UNSIGNED NOT NULL,
    
    `month` INT UNSIGNED NOT NULL, 
    `year` YEAR NOT NULL, 
    
    FOREIGN KEY (`planner_id`) 
        REFERENCES `accounts_student`(`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    FOREIGN KEY (`category_id`) REFERENCES `allocation_categories`(`id`) ON UPDATE CASCADE,
    
    UNIQUE KEY `uk_plan_item_month_year` (`planner_id`, `item_name`, `month`, `year`)
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 3.6 CHAT_HISTORY (Riwayat Percakapan Single Session)
CREATE TABLE IF NOT EXISTS `chat_history` (
    `student_id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `content` TEXT NOT NULL, 
    PRIMARY KEY (`student_id`),

    FOREIGN KEY (`student_id`) 
        REFERENCES `accounts_student`(`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;


-- =======================================================
-- 4. SEED DATA (DATA UJI)
-- =======================================================

-- 4.1 Master Data: Kategori
-- Catatan: Menggunakan ID yang spesifik, pastikan ID ini tidak bentrok dengan ID kategori buatan user di masa depan.
INSERT IGNORE INTO `allocation_categories` (id, category_name, allocation_type) VALUES 
(1, 'Gaji Sampingan', 'Personal'),    -- Income Category
(100, 'Makanan', 'Needs'),
(101, 'Kebutuhan Harian', 'Needs'),
(200, 'Hiburan', 'Wants'),
(300, 'Course Online', 'Education');

-- 4.2 ACCOUNTS
-- Funder A: ID funder-12345
INSERT INTO accounts (id, username, displayname, password, phonenumber, email, created) VALUES
('funder-12345', 'funder.a', 'Bapak Funder', 'password_hash_funder', '08111234567', 'funder.a@mail.com', '2025-01-01 00:00:00');
INSERT INTO accounts_funder (id, type) VALUES ('funder-12345', 1);

-- Student B: ID student-54321 (Student utama yang akan diuji)
INSERT INTO accounts (id, username, displayname, password, phonenumber, email, created) VALUES
('student-54321', 'student.b', 'Budi Santoso', 'password_hash_student', '08123456789', 'student.b@mail.com', '2025-01-01 00:00:00');
INSERT INTO accounts_student (id, balance) VALUES ('student-54321', 1000000.00); -- Saldo Awal

-- 4.3 FUNDING dan FUNDING_ALLOCATION
-- Perjanjian antara Funder A dan Student B
INSERT INTO funding (funding_id, funder_id, student_id, total_monthly_fund, start_date, status) VALUES
('fund-001', 'funder-12345', 'student-54321', 5000000.00, '2025-10-01', 'Active');

-- Aturan Budget: Total 5.000.000 dialokasikan
INSERT INTO funding_allocation (allocation_id, funding_id, category_id, monthly_budget, drip_frequency, drip_amount) VALUES
('alloc-001-needs', 'fund-001', 101, 3000000.00, 'Monthly', 3000000.00), -- Kebutuhan Harian (Needs)
('alloc-001-wants', 'fund-001', 200, 1000000.00, 'Monthly', 1000000.00), -- Hiburan (Wants)
('alloc-001-edu', 'fund-001', 300, 1000000.00, 'Monthly', 1000000.00); -- Course Online (Education)

-- 4.4 TRANSACTIONS (Data Keuangan Uji - Asumsi Bulan Saat Ini adalah November 2025)

-- Pengeluaran NEEDS (ID Kategori 101)
INSERT INTO transactions (transaction_id, student_id, funding_id, transaction_date, amount, type, category_id, raw_description) VALUES
('trx-exp-N-001', 'student-54321', 'fund-001', '2025-11-02 12:30:00', 500000.00, 'Expense', 101, 'Belanja bulanan di Supermarket'), -- Needs
('trx-exp-N-002', 'student-54321', 'fund-001', '2025-11-05 10:00:00', 300000.00, 'Expense', 101, 'Bayar listrik kosan'), -- Needs
('trx-exp-N-003', 'student-54321', 'fund-001', '2025-10-15 10:00:00', 400000.00, 'Expense', 101, 'Belanja bulan lalu (Oktober)'); -- Needs

-- Pengeluaran WANTS (ID Kategori 200)
INSERT INTO transactions (transaction_id, student_id, funding_id, transaction_date, amount, type, category_id, raw_description) VALUES
('trx-exp-W-001', 'student-54321', 'fund-001', '2025-11-03 15:00:00', 150000.00, 'Expense', 200, 'Tiket bioskop nonton film baru'); -- Wants

-- Pengeluaran EDUCATION (ID Kategori 300)
INSERT INTO transactions (transaction_id, student_id, funding_id, transaction_date, amount, type, category_id, is_verified_by_ai, raw_description) VALUES
('trx-exp-E-001', 'student-54321', 'fund-001', '2025-11-04 09:00:00', 600000.00, 'Expense', 300, TRUE, 'Pembayaran Course Data Science'); -- Education

-- Pengeluaran/Pemasukan Personal (ID Kategori 1 dan 100)
INSERT INTO transactions (transaction_id, student_id, transaction_date, amount, type, category_id, raw_description) VALUES
('trx-inc-001', 'student-54321', '2025-11-01 10:00:00', 1000000.00, 'Income', 1, 'Pembayaran project freelance'), -- Income
('trx-exp-P-001', 'student-54321', '2025-11-05 08:00:00', 35000.00, 'Expense', 100, 'Kopi susu di Starbuck'); -- Personal Expense (Makanan)

-- 4.5 SMART_CONTRACTS
INSERT INTO smart_contracts (contract_id, funding_id, contract_address, usdc_token_address, last_drip_date, total_drip_count) VALUES
('sc-001', 'fund-001', '0x2A62961d6eF64C5A8c9aF9F2418eF83A0E5c4a52', '0x...TokenUSDC...', '2025-10-01', 1);

-- Mengaktifkan kembali Foreign Key Checks
SET FOREIGN_KEY_CHECKS = 1;