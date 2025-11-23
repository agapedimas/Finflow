SET FOREIGN_KEY_CHECKS = 0;

-- =======================================================
-- 1. MASTER DATA (Categories)
-- =======================================================
CREATE TABLE IF NOT EXISTS `allocation_categories` (
    `id` INT UNSIGNED PRIMARY KEY, 
    `category_name` VARCHAR(50) UNIQUE NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- =======================================================
-- 2. ACCOUNTS & ROLES (Modified for Invite System)
-- =======================================================
CREATE TABLE IF NOT EXISTS `accounts` (
    `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `username` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `displayname` text COLLATE utf8mb4_bin,
    `email` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `password` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
    `wallet_address` varchar(255) CHARACTER SET ascii COLLATE ascii_bin UNIQUE NULL,
    `password` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
    `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, 
    `avatarversion` int UNSIGNED NOT NULL DEFAULT 1,
    
    -- Info Profil Tambahan
    `organization_name` VARCHAR(255) NULL,
    `bank_name` VARCHAR(50) NULL,
    `bank_account_number` VARCHAR(50) NULL,

    -- Relasi Keluarga
    `invite_code` VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin UNIQUE NULL, 
    `parent_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,

    PRIMARY KEY (`id`), 
    UNIQUE KEY `username` (`username`),
    UNIQUE KEY `email` (`email`),
    CONSTRAINT `fk_parent_link` FOREIGN KEY (`parent_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;


CREATE TABLE IF NOT EXISTS `accounts_student` (
    `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `balance` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_accounts_student` FOREIGN KEY (`id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `accounts_funder` (
    `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `type` int UNSIGNED NOT NULL,   
    PRIMARY KEY (`id`), 
    CONSTRAINT `fk_accounts_funder` FOREIGN KEY (`id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- =======================================================
-- 3. FUNDING & RULES (Modified for Readjustment Logic)
-- =======================================================
CREATE TABLE IF NOT EXISTS `funding` (
    `funding_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `funder_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `student_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `total_monthly_fund` DECIMAL(10, 2) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `status` ENUM('Active', 'Completed', 'Canceled', 'Waiting_Allocation') NOT NULL DEFAULT 'Waiting_Allocation', 
    
    FOREIGN KEY (`funder_id`) REFERENCES `accounts_funder`(`id`),
    FOREIGN KEY (`student_id`) REFERENCES `accounts_student`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Mengganti nama kolom 'total_monthly_fund' menjadi 'total_period_fund'
ALTER TABLE `funding` 
CHANGE COLUMN `total_monthly_fund` `total_period_fund` DECIMAL(15, 2) NOT NULL;

-- Tambah Kolom untuk melacak uang masuk
ALTER TABLE `funding` 
ADD COLUMN `collected_amount` DECIMAL(15, 2) DEFAULT 0;

ALTER TABLE `funding` 
MODIFY COLUMN `status` 
ENUM('Open_For_Parent', 'Waiting_Allocation', 'Ready_To_Fund', 'Partially_Funded', 'Active', 'Completed', 'Canceled') 
NOT NULL DEFAULT 'Open_For_Parent';

CREATE TABLE IF NOT EXISTS `funding_allocation` (
    `allocation_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `funding_id` VARCHAR(128) NOT NULL,
    `category_id` INT UNSIGNED NOT NULL,
    `monthly_budget` DECIMAL(10, 2) NOT NULL,
    `drip_frequency` ENUM('Monthly', 'Weekly', 'Locked') NOT NULL,
    `drip_amount` DECIMAL(10, 2) NULL,
    
    -- [FIXED] Tambahan untuk Matematika Dana Darurat
    `remaining_drip_count` INT DEFAULT 0, -- Sisa berapa kali drip lagi?
    `total_withdrawn` DECIMAL(15,2) DEFAULT 0, -- Total yang sudah diambil
    
    FOREIGN KEY (`funding_id`) REFERENCES `funding`(`funding_id`) ON DELETE CASCADE,
    FOREIGN KEY (`category_id`) REFERENCES `allocation_categories`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

ALTER TABLE `funding_allocation` 
CHANGE COLUMN `monthly_budget` `total_allocation` DECIMAL(15, 2) NOT NULL;

-- =======================================================
-- 4. TRANSACTIONS (Modified for Urgent & Drip_In)
-- =======================================================
CREATE TABLE IF NOT EXISTS `transactions` (
    `transaction_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `student_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `transaction_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `amount` DECIMAL(10, 2) NOT NULL,
    
    -- [FIXED] Tambah tipe Drip_In
    `type` ENUM('Income', 'Expense', 'Drip_In') NOT NULL,
    
    `category_id` INT UNSIGNED NULL, 
    `merchant_name` VARCHAR(100) NULL,
    `raw_description` VARCHAR(255) NULL,
    
    -- Fitur AI & Blockchain
    `is_verified_by_ai` BOOLEAN DEFAULT FALSE,
    `proof_image_url` TEXT NULL,
    `blockchain_tx_hash` VARCHAR(100) NULL,

    -- [FIXED] Tambahan untuk Dana Darurat
    `is_urgent_withdrawal` BOOLEAN DEFAULT FALSE,
    `urgency_reason` TEXT NULL,

    FOREIGN KEY (`student_id`) REFERENCES `accounts`(`id`),
    FOREIGN KEY (`category_id`) REFERENCES `allocation_categories`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- =======================================================
-- 5. BUDGET PLAN & CHAT
-- =======================================================
CREATE TABLE IF NOT EXISTS `budget_plan` (
    `id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `planner_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `item_name` VARCHAR(255) NOT NULL,
    `category_id` INT UNSIGNED NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `quantity` INT UNSIGNED NOT NULL,
    `month` INT UNSIGNED NOT NULL,
    `year` YEAR NOT NULL,          
    `status` ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    `ai_feedback` TEXT NULL,
    FOREIGN KEY (`planner_id`) REFERENCES `accounts_student`(`id`),
    FOREIGN KEY (`category_id`) REFERENCES `allocation_categories`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `chat_history` (
    `student_id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `content` TEXT NOT NULL, 
    PRIMARY KEY (`student_id`),
    FOREIGN KEY (`student_id`) REFERENCES `accounts_student`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- =======================================================
-- 6. NOTIFICATIONS (MISSING TABLE - RESTORED)
-- =======================================================
CREATE TABLE IF NOT EXISTS `notifications` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `title` VARCHAR(100) NOT NULL,
    `message` TEXT NOT NULL,
    `is_read` BOOLEAN DEFAULT FALSE,
    `type` ENUM('Info', 'Warning', 'Success', 'Urgent') DEFAULT 'Info',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- =======================================================
-- 7. SMART CONTRACTS
-- =======================================================
CREATE TABLE IF NOT EXISTS `smart_contracts` (
    `contract_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `funding_id` VARCHAR(128) UNIQUE NOT NULL, 
    `contract_address` VARCHAR(42) UNIQUE NOT NULL, 
    `usdc_token_address` VARCHAR(42) NOT NULL, 
    `is_locked_education` BOOLEAN DEFAULT TRUE, 
    FOREIGN KEY (`funding_id`) REFERENCES `funding`(`funding_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 8. AUTHENTICATION
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

-- Tabel Undangan (Penting untuk Flow Funder -> Student -> Parent)
-- 4. UNDANGAN (INVITATIONS) - PENTING BUAT FLOW
CREATE TABLE IF NOT EXISTS `invitations` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `token` VARCHAR(100) NOT NULL UNIQUE,
    `inviter_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `invitee_email` VARCHAR(255) NOT NULL,
    `role` ENUM('student', 'parent') NOT NULL,
    `status` ENUM('pending', 'used') DEFAULT 'pending',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `weekly_reports` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `student_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    
    -- Data Statistik
    `total_spent` DECIMAL(15, 2) DEFAULT 0,
    `budget_limit` DECIMAL(15, 2) DEFAULT 0,
    
    -- Hasil Analisa
    `health_status` ENUM('Excellent', 'Good', 'Warning') NOT NULL,
    `ai_message` TEXT NOT NULL, -- Isi surat cintanya
    
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`student_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 1. INSERT KATEGORI
INSERT IGNORE INTO allocation_categories (id, category_name) VALUES 
(0, 'Wants'), (1, 'Needs'), (2, 'Education');

-- 2. INSERT USERS (4 Karakter Utama)
-- Funder
INSERT INTO accounts (id, username, displayname, email, wallet_address, invite_code) VALUES 
('funder_01', 'yayasan_finflow', 'Yayasan Finflow', 'admin@finflow.id', '0x_FUNDER_WALLET', 'INV_FUNDER_001');
INSERT INTO accounts_funder (id, type) VALUES ('funder_01', 0);

-- Student 1 (Budi - The Good One)
INSERT INTO accounts (id, username, displayname, email, wallet_address, invite_code) VALUES 
('student_01', 'budi_santoso', 'Budi Santoso', 'budi@student.com', '0x_BUDI_WALLET', 'INV_BUDI_001');
INSERT INTO accounts_student (id, balance) VALUES ('student_01', 2500000.00);

-- Student 2 (Siti - The Edge Case)
INSERT INTO accounts (id, username, displayname, email, wallet_address, invite_code) VALUES 
('student_02', 'siti_aminah', 'Siti Aminah', 'siti@student.com', '0x_SITI_WALLET', 'INV_SITI_001');
INSERT INTO accounts_student (id, balance) VALUES ('student_02', 150000.00); -- Saldo Kritis!

-- Parent (Pak Santoso - Ayah Budi)
INSERT INTO accounts (id, username, displayname, email, wallet_address) VALUES 
('parent_01', 'santoso_ayah', 'Pak Santoso', 'santoso@parent.com', '0x_PARENT_WALLET');
-- LINK Parent ke Budi
UPDATE accounts SET parent_id = 'parent_01' WHERE id = 'student_01';

-- Set password dummy '123456' (Harusnya di-hash, tapi untuk dummy plain dulu ok)
UPDATE accounts SET password = '123456' WHERE id = 'funder_01';
UPDATE accounts SET password = '123456' WHERE id = 'student_01';

-- 3. INSERT FUNDING & RULES
-- Funding Budi (6 Juta)
INSERT INTO funding (funding_id, funder_id, student_id, total_monthly_fund, start_date, status) VALUES 
('fund_budi', 'funder_01', 'student_01', 6000000, '2025-01-01', 'Active');

-- Rules Budi (Drip Mingguan)
INSERT INTO funding_allocation (allocation_id, funding_id, category_id, monthly_budget, drip_frequency, drip_amount, remaining_drip_count) VALUES 
('alloc_budi_1', 'fund_budi', 1, 2000000, 'Weekly', 500000, 20), -- Needs
('alloc_budi_2', 'fund_budi', 0, 1000000, 'Weekly', 250000, 20), -- Wants
('alloc_budi_3', 'fund_budi', 2, 3000000, 'Locked', 0, 0);       -- Edu (Vault)

-- Funding Siti (4 Juta)
INSERT INTO funding (funding_id, funder_id, student_id, total_monthly_fund, start_date, status) VALUES 
('fund_siti', 'funder_01', 'student_02', 4000000, '2025-01-01', 'Active');

-- Rules Siti
INSERT INTO funding_allocation (allocation_id, funding_id, category_id, monthly_budget, drip_frequency, drip_amount, remaining_drip_count) VALUES 
('alloc_siti_1', 'fund_siti', 1, 2000000, 'Weekly', 500000, 18);


-- 4. INSERT TRANSACTIONS (History)
-- Budi: Income Drip (Uang Masuk)
INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description, is_verified_by_ai) VALUES 
('tx_budi_in', 'student_01', 750000, 'Drip_In', NULL, 'Minggu 1: Needs + Wants', TRUE);

-- Budi: Expense (Makan - Normal)
INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description) VALUES 
('tx_budi_out1', 'student_01', 25000, 'Expense', 1, 'Makan Siang Warteg');

-- Budi: Expense (Buku - AI Verified)
INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description, is_verified_by_ai, proof_image_url) VALUES 
('tx_budi_edu', 'student_01', 150000, 'Expense', 2, 'Beli Buku Coding', TRUE, 'http://img.url/struk_buku.jpg');

-- Siti: URGENT WITHDRAWAL (Dana Darurat)
INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description, is_urgent_withdrawal, urgency_reason, is_verified_by_ai) VALUES 
('tx_siti_urgent', 'student_02', 500000, 'Drip_In', 1, 'Dana Darurat: Sakit Gigi', TRUE, 'Sakit gigi butuh ke dokter segera', TRUE);


-- 5. INSERT BUDGET PLAN (AI Scenarios)
-- Budi: Approved
INSERT INTO budget_plan (id, planner_id, item_name, category_id, amount, quantity, month, year, status, ai_feedback) VALUES 
('plan_budi_1', 'student_01', 'Course Udemy', 2, 150000, 1, 11, 2025, 'approved', 'Sangat bagus untuk skill.');

-- Siti: REJECTED (Edge Case)
INSERT INTO budget_plan (id, planner_id, item_name, category_id, amount, quantity, month, year, status, ai_feedback) VALUES 
('plan_siti_1', 'student_02', 'Tas Branded', 0, 2000000, 1, 11, 2025, 'rejected', 'Ditolak. Harga melebihi 50% total budget bulanan kamu.');


-- 6. INSERT NOTIFICATIONS (Loneng)
-- Notif Sukses
INSERT INTO notifications (user_id, title, message, type) VALUES 
('student_01', 'Uang Masuk 💸', 'Drip mingguan Rp 750.000 berhasil dicairkan.', 'Success');

-- Notif Warning (Siti Boros)
INSERT INTO notifications (user_id, title, message, type) VALUES 
('student_02', '⚠️ Bahaya!', 'Kamu sudah menghabiskan 80% dana dalam 3 hari. Rem sedikit ya!', 'Warning');


-- 7. INSERT CHAT HISTORY
INSERT INTO chat_history (student_id, content) VALUES 
('student_01', '[{"role": "user", "parts": [{"text": "Halo Finflow, uangku aman?"}]}, {"role": "model", "parts": [{"text": "Halo Budi! Aman sekali. Kamu baru pakai 5% budget."}]}]');

SET FOREIGN_KEY_CHECKS = 1;