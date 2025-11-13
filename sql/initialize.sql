-- ACCOUNTS
CREATE TABLE IF NOT EXISTS `accounts` 
    (
        `id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `username` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `nickname` text COLLATE utf8mb4_bin, 
        `url` varchar(1000) CHARACTER SET ascii COLLATE ascii_bin, 
        `password` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, 
        `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, 
        `avatarversion` int UNSIGNED NOT NULL DEFAULT 1,
            PRIMARY KEY (`id`), 
            UNIQUE KEY `username` (`username`)
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