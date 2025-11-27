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