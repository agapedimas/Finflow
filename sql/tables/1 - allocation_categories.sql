-- CATEGORIES (Master Data untuk Kategori Transaksi)
CREATE TABLE IF NOT EXISTS `allocation_categories` (
    `id` INT UNSIGNED PRIMARY KEY, 
    `category_name` VARCHAR(50) UNIQUE NOT NULL, 
    `allocation_type` ENUM('Needs', 'Wants', 'Education', 'Personal') NOT NULL, -- Menambahkan tipe alokasi di sini
    
    UNIQUE KEY `uk_category_name` (`category_name`)
) 
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;