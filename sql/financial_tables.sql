-- Pastikan file ini dijalankan setelah initialize.sql

-- =======================================================
-- 1. FUNDING (Perjanjian Pendanaan Funder-Student)
-- =======================================================
CREATE TABLE IF NOT EXISTS `funding` (
    `funding_id` VARCHAR(128) PRIMARY KEY NOT NULL, -- PK, gunakan UUID atau hash unik
    `funder_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `student_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `total_monthly_fund` DECIMAL(10, 2) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `status` ENUM('Active', 'Completed', 'Canceled') NOT NULL DEFAULT 'Active', 
    
    FOREIGN KEY (`funder_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (`student_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    
    UNIQUE KEY `uk_funder_student_active` (`funder_id`, `student_id`, `status`) -- Hanya 1 perjanjian aktif per pasangan
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- =======================================================
-- 2. FUNDING_ALLOCATION (Aturan Budget dan Drip)
-- =======================================================
CREATE TABLE IF NOT EXISTS `funding_allocation` (
    `allocation_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `funding_id` VARCHAR(128) NOT NULL,
    `category_type` ENUM('Needs', 'Wants', 'Education') NOT NULL,
    `monthly_budget` DECIMAL(10, 2) NOT NULL,
    `drip_frequency` ENUM('Monthly', 'Weekly', 'Locked') NOT NULL,
    `drip_amount` DECIMAL(10, 2) NULL, -- Jumlah yang diturunkan per periode
    
    FOREIGN KEY (`funding_id`) REFERENCES `funding`(`funding_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY `uk_funding_category` (`funding_id`, `category_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- =======================================================
-- 3. TRANSACTIONS (Pemasukan dan Pengeluaran)
-- =======================================================
CREATE TABLE IF NOT EXISTS `transactions` (
    `transaction_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `student_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `funding_id` VARCHAR(128) NULL, -- Link ke perjanjian pendanaan jika terkait dana bulanan
    
    `transaction_date` DATETIME NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `type` ENUM('Income', 'Expense') NOT NULL,
    
    `category` VARCHAR(50) NOT NULL, -- Hasil AI: 'Coffee', 'Tuition Fee', 'Grocery'
    `allocation_type` ENUM('Needs', 'Wants', 'Education', 'Personal') NOT NULL, -- Dari alokasi budget/dana pribadi
    
    `is_verified_by_ai` BOOLEAN DEFAULT FALSE, -- Untuk dana 'Education'
    `raw_description` VARCHAR(255) NULL, 
    `receipt_image_path` VARCHAR(255) NULL,
    
    FOREIGN KEY (`student_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (`funding_id`) REFERENCES `funding`(`funding_id`) ON DELETE SET NULL ON UPDATE CASCADE,

    -- INDEKS BARU UNTUK RAG DAN PERFORMA LAPORAN
    INDEX `idx_student_date_type` (`student_id`, `transaction_date`, `type`),
    INDEX `idx_category_allocation` (`category`, `allocation_type`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- =======================================================
-- 4. SMART_CONTRACTS (Record On-Chain)
-- =======================================================
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