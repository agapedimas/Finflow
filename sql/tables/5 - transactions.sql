
CREATE TABLE IF NOT EXISTS `transactions` (
    `transaction_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `student_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `transaction_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `amount` DECIMAL(15, 2) NOT NULL,
    
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