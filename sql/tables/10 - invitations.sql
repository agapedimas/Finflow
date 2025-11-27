CREATE TABLE IF NOT EXISTS `invitations` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `token` VARCHAR(100) NOT NULL UNIQUE,
    `inviter_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `invitee_email` VARCHAR(255) NOT NULL,
    `role` ENUM('student', 'parent') NOT NULL,
    `status` ENUM('pending', 'used') DEFAULT 'pending',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;