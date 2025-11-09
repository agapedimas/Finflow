-- ROLES
CREATE TABLE IF NOT EXISTS `roles` 
    (
        `id` int(11) NOT NULL AUTO_INCREMENT,
        `name` varchar(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `name` (`name`)
    ) 
ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;

    -- Add default roles
    INSERT IGNORE INTO `roles` (name) VALUES ('admin'), ('user');


-- ACCOUNTS
CREATE TABLE IF NOT EXISTS `accounts` 
    (
        `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `username` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `nickname` text COLLATE utf8mb4_bin, 
        `url` varchar(1000) CHARACTER SET ascii COLLATE ascii_bin, 
        `password` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, 
        `role` varchar(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `avatarversion` int UNSIGNED NOT NULL DEFAULT 1,
            PRIMARY KEY (`id`), 
            UNIQUE KEY `username` (`username`),
            CONSTRAINT `fk_role_user` 
                FOREIGN KEY (`role`) REFERENCES `roles`(`name`) 
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


-- AUDIT LOG
CREATE TABLE IF NOT EXISTS `auditlog` 
    (
        `id` int(11) NOT NULL AUTO_INCREMENT, 
        `user` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `from` tinytext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin, 
        `to` tinytext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin, 
        `reference` varchar(128) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL, 
        `type` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `time` varchar(25) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
            PRIMARY KEY (`id`), 
            CONSTRAINT `fk_auditlog_user` 
                FOREIGN KEY (`user`) REFERENCES `accounts`(`id`) 
                ON DELETE CASCADE
                ON UPDATE CASCADE
    ) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=155;