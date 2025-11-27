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