-- ACCOUNTS
CREATE TABLE IF NOT EXISTS `accounts` 
    (
        `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `username` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `displayname` text COLLATE utf8mb4_bin,
        `password` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `phonenumber` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `email` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, 
        `avatarversion` int UNSIGNED NOT NULL DEFAULT 1,
            PRIMARY KEY (`id`), 
            UNIQUE KEY `username` (`username`),
            UNIQUE KEY 'email' ('email')
            -- konek ke parent dan funder
    ) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `accounts_student` 
    (
        `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `balance` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            PRIMARY KEY (`id`),
            CONSTRAINT `fk_accounts_student` 
                FOREIGN KEY (`id`) REFERENCES `accounts`(`id`) 
                ON DELETE CASCADE
                ON UPDATE CASCADE
    ) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- untuk funder
CREATE TABLE IF NOT EXISTS `accounts_funder` 
    (
        `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        'type' int UNSIGNED NOT NULL,   -- 0: beasiswa, 1: parent
            PRIMARY KEY (`id`), 
            CONSTRAINT `fk_accounts_funder` 
                FOREIGN KEY (`id`) REFERENCES `accounts`(`id`) 
                ON DELETE CASCADE
                ON UPDATE CASCADE
    ) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- AUTHENTICATION
CREATE TABLE IF NOT EXISTS `authentication` 
    (
        `id` int(11) NOT NULL AUTO_INCREMENT, 
        `user` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `ip` varchar(45) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        `time` varchar(25) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
            PRIMARY KEY (`id`),
            CONSTRAINT `fk_authentication_user` 
                FOREIGN KEY (`user`) REFERENCES `accounts`(`id`) 
                ON DELETE CASCADE
                ON UPDATE CASCADE
    ) 
ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;