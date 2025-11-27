CREATE TABLE IF NOT EXISTS `budget_plan` (
    `id` VARCHAR(128) PRIMARY KEY NOT NULL,
    `planner_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    
    `item_name` VARCHAR(255) NOT NULL,
    `category_id` INT UNSIGNED NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
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