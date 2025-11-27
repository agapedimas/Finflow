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
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;


