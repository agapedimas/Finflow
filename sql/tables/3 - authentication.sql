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