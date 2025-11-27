-- Perjanjian Pendanaan Funder-Student
CREATE TABLE IF NOT EXISTS `funding` (
    `funding_id` VARCHAR(128) PRIMARY KEY NOT NULL, 
    `program_name` VARCHAR(150) NULL,
    `funder_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `student_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `total_period_fund` DECIMAL(15, 2) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `status` ENUM('Open_For_Parent', 'Waiting_Allocation', 'Ready_To_Fund', 'Partially_Funded', 'Active', 'Completed', 'Canceled') NOT NULL DEFAULT 'Open_For_Parent', 
    `collected_amount` DECIMAL(15, 2) DEFAULT 0,

    FOREIGN KEY (`funder_id`) REFERENCES `accounts_funder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (`student_id`) REFERENCES `accounts_student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Aturan Budget dan Drip
CREATE TABLE IF NOT EXISTS `funding_allocation` (
    `allocation_id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `funding_id` VARCHAR(128) NOT NULL,
    `category_id` INT UNSIGNED NOT NULL,
    `total_allocation` DECIMAL(15, 2) NOT NULL,
    `drip_frequency` ENUM('Monthly', 'Weekly', 'Locked') NOT NULL,
    `drip_amount` DECIMAL(10, 2) NULL, 
    `remaining_drip_count` INT DEFAULT 0, -- Sisa berapa kali drip lagi?
    `total_withdrawn` DECIMAL(15,2) DEFAULT 0, -- Total yang sudah diambil
    
    
    FOREIGN KEY (`funding_id`) REFERENCES `funding`(`funding_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (`category_id`) REFERENCES `allocation_categories`(`id`) ON UPDATE CASCADE
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

