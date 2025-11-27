CREATE TABLE IF NOT EXISTS `chat_history` (
    `student_id` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `content` TEXT NOT NULL, 
    PRIMARY KEY (`student_id`),

    FOREIGN KEY (`student_id`) 
        REFERENCES `accounts_student`(`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;



