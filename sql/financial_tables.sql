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
    
    FOREIGN KEY (`funder_id`) REFERENCES `accounts_funder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (`student_id`) REFERENCES `accounts_student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    
    UNIQUE KEY `uk_funder_student_active` (`funder_id`, `student_id`, `status`) -- Hanya 1 perjanjian aktif per pasangan
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- =======================================================
-- 2. FUNDING_ALLOCATION (Aturan Budget dan Drip)
-- =======================================================
CREATE TABLE IF NOT EXISTS `funding_allocation` (
    `allocation_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `funding_id` VARCHAR(128) NOT NULL,
    `category_id` INT UNSIGNED NOT NULL,
    `monthly_budget` DECIMAL(10, 2) NOT NULL,
    `drip_frequency` ENUM('Monthly', 'Weekly', 'Locked') NOT NULL,
    `drip_amount` DECIMAL(10, 2) NULL, -- Jumlah yang diturunkan per periode
    
    FOREIGN KEY (`funding_id`) REFERENCES `funding`(`funding_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (`category_id`) REFERENCES `allocation_categories`(`id`) ON UPDATE CASCADE
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- =======================================================
-- 3. TRANSACTIONS (Pemasukan dan Pengeluaran)
-- =======================================================
CREATE TABLE IF NOT EXISTS `transactions` (
    `transaction_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `student_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    
    `transaction_date` DATETIME NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `type` ENUM('Income', 'Expense') NOT NULL,
    
    `category_id` INT UNSIGNED NOT NULL, -- wants/needs/edu
    
    `is_verified_by_ai` BOOLEAN DEFAULT FALSE, -- Untuk dana 'Education'
    `raw_description` VARCHAR(255) NULL,
    
    FOREIGN KEY (`student_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (`category_id`) REFERENCES `allocation_categories`(`id`) ON UPDATE CASCADE,

    -- INDEKS BARU UNTUK RAG DAN PERFORMA LAPORAN
    INDEX `idx_student_date_type` (`student_id`, `transaction_date`, `type`),
    INDEX `idx_category_allocation` (`id`, `allocation_categories`)

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


-- =======================================================
-- 5. BUDGET_PLAN (Rencana Pengeluaran Bulanan Student)
-- =======================================================
CREATE TABLE IF NOT EXISTS `budget_plan` (
    `id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `planner_id` VARCHAR(128) NOT NULL,
    
    `item_name` VARCHAR(255) NOT NULL,
    `category_id` INT UNSIGNED NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `quantity` INT UNSIGNED NOT NULL, -- Jumlah barang (harus positif)
    
    `month` INT UNSIGNED NOT NULL, -- Bulan (1-12)
    `year` YEAR NOT NULL,          -- Tahun (YYYY)
    
    -- Foreign Key: Mereferensi tabel account_students
    FOREIGN KEY (`planner_id`) 
        REFERENCES `account_students`(`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    FOREIGN KEY (`category_id`) REFERENCES `allocation_categories`(`id`) ON UPDATE CASCADE,
    
    -- Optional: Menjamin tidak ada rencana ganda untuk barang yang sama di bulan yang sama
    UNIQUE KEY `uk_plan_item_month_year` (`planner_id`, `item_name`, `month`, `year`)
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;


-- =======================================================
-- 6. CATEGORIES (Master Data untuk Kategori Transaksi)
-- =======================================================
CREATE TABLE IF NOT EXISTS `allocation_categories` (
    `id` INT UNSIGNED PRIMARY KEY, -- ID Kategori unik, menggunakan auto-increment
    `category_name` VARCHAR(50) UNIQUE NOT NULL,  -- Nama Kategori (contoh: 'Makanan', 'Gaji')
    
    UNIQUE KEY `uk_category_name` (`category_name`)
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;


    -- Add default categories
    INSERT IGNORE INTO `allocation_categories` (id, category_name) VALUES (0, 'wants'), (1, 'needs'), (2, 'education');

