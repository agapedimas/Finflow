CREATE TABLE IF NOT EXISTS `accounts` 
(
    `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `username` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `displayname` text COLLATE utf8mb4_bin,
    `phonenumber` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `email` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `wallet_address` varchar(255) CHARACTER SET ascii COLLATE ascii_bin UNIQUE NULL,
    `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, 
    `role` ENUM('Student', 'Parent', 'ScholarshipFunder') NOT NULL,
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
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- STUDENT
CREATE TABLE IF NOT EXISTS `accounts_student` 
(
    `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `balance` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        PRIMARY KEY (`id`),
        CONSTRAINT `fk_accounts_student_acc` 
            FOREIGN KEY (`id`) REFERENCES `accounts`(`id`) 
            ON DELETE CASCADE
            ON UPDATE CASCADE
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- PARENT OR SCHOLARSHIP FUNDER
CREATE TABLE IF NOT EXISTS `accounts_funder` 
(
    `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
    `type` int UNSIGNED NOT NULL,  -- 0: beasiswa, 1: parent
        PRIMARY KEY (`id`), 
        CONSTRAINT `fk_accounts_funder_acc` 
            FOREIGN KEY (`id`) REFERENCES `accounts`(`id`) 
            ON DELETE CASCADE
            ON UPDATE CASCADE
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;