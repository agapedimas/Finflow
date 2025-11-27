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