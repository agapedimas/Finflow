SET time_zone = '+07:00';

-- =======================================================
-- 4. SEED DATA (DATA UJI)
-- =======================================================

-- 4.1 Master Data: Kategori
-- Catatan: Menggunakan ID yang spesifik, pastikan ID ini tidak bentrok dengan ID kategori buatan user di masa depan.
INSERT IGNORE INTO `allocation_categories` (id, category_name, allocation_type) VALUES 
(1, 'Gaji Sampingan', 'Personal'),    -- Income Category
(100, 'Makanan', 'Needs'),
(101, 'Kebutuhan Harian', 'Needs'),
(200, 'Hiburan', 'Wants'),
(300, 'Course Online', 'Education');

-- 4.2 ACCOUNTS
-- Funder A: ID funder-12345
INSERT INTO accounts (id, username, displayname, password, phonenumber, email, created, role) VALUES
('funder-12345', 'funder.a', 'Bapak Funder', 'password_hash_funder', '08111234567', 'funder.a@mail.com', '2025-01-01 00:00:00', 'ScholarshipFunder');
INSERT INTO accounts_funder (id, type) VALUES ('funder-12345', 1);

INSERT INTO accounts (id, username, displayname, password, phonenumber, email, created, role) VALUES
('parent-12345', 'parent.a', 'Bapak Parent', 'password_hash_parent', '08111234567', 'parent.a@mail.com', '2025-01-01 00:00:00', 'Parent');
INSERT INTO accounts_funder (id, type) VALUES ('parent-12345', 1);

-- Student B: ID student-54321 (Student utama yang akan diuji)
INSERT INTO accounts (id, username, displayname, password, phonenumber, email, created, role) VALUES
('student-54321', 'student.b', 'Budi Santoso', 'password_hash_student', '08123456789', 'student.b@mail.com', '2025-01-01 00:00:00', 'Student');
INSERT INTO accounts_student (id, balance) VALUES ('student-54321', 1000000.00); -- Saldo Awal

-- 4.3 FUNDING dan FUNDING_ALLOCATION
-- Perjanjian antara Funder A dan Student B
INSERT INTO funding (funding_id, funder_id, student_id, total_monthly_fund, start_date, status) VALUES
('fund-001', 'funder-12345', 'student-54321', 5000000.00, '2025-10-01', 'Active');

-- Aturan Budget: Total 5.000.000 dialokasikan
INSERT INTO funding_allocation (allocation_id, funding_id, category_id, monthly_budget, drip_frequency, drip_amount) VALUES
('alloc-001-needs', 'fund-001', 101, 3000000.00, 'Monthly', 3000000.00), -- Kebutuhan Harian (Needs)
('alloc-001-wants', 'fund-001', 200, 1000000.00, 'Monthly', 1000000.00), -- Hiburan (Wants)
('alloc-001-edu', 'fund-001', 300, 1000000.00, 'Monthly', 1000000.00); -- Course Online (Education)

-- 4.4 TRANSACTIONS (Data Keuangan Uji - Asumsi Bulan Saat Ini adalah November 2025)

-- Pengeluaran NEEDS (ID Kategori 101)
INSERT INTO transactions (transaction_id, student_id, funding_id, transaction_date, amount, type, category_id, raw_description) VALUES
('trx-exp-N-001', 'student-54321', 'fund-001', '2025-11-02 12:30:00', 500000.00, 'Expense', 101, 'Belanja bulanan di Supermarket'), -- Needs
('trx-exp-N-002', 'student-54321', 'fund-001', '2025-11-05 10:00:00', 300000.00, 'Expense', 101, 'Bayar listrik kosan'), -- Needs
('trx-exp-N-003', 'student-54321', 'fund-001', '2025-10-15 10:00:00', 400000.00, 'Expense', 101, 'Belanja bulan lalu (Oktober)'); -- Needs

-- Pengeluaran WANTS (ID Kategori 200)
INSERT INTO transactions (transaction_id, student_id, funding_id, transaction_date, amount, type, category_id, raw_description) VALUES
('trx-exp-W-001', 'student-54321', 'fund-001', '2025-11-03 15:00:00', 150000.00, 'Expense', 200, 'Tiket bioskop nonton film baru'); -- Wants

-- Pengeluaran EDUCATION (ID Kategori 300)
INSERT INTO transactions (transaction_id, student_id, funding_id, transaction_date, amount, type, category_id, is_verified_by_ai, raw_description) VALUES
('trx-exp-E-001', 'student-54321', 'fund-001', '2025-11-04 09:00:00', 600000.00, 'Expense', 300, TRUE, 'Pembayaran Course Data Science'); -- Education

-- Pengeluaran/Pemasukan Personal (ID Kategori 1 dan 100)
INSERT INTO transactions (transaction_id, student_id, transaction_date, amount, type, category_id, raw_description) VALUES
('trx-inc-001', 'student-54321', '2025-11-01 10:00:00', 1000000.00, 'Income', 1, 'Pembayaran project freelance'), -- Income
('trx-exp-P-001', 'student-54321', '2025-11-05 08:00:00', 35000.00, 'Expense', 100, 'Kopi susu di Starbuck'); -- Personal Expense (Makanan)

-- 4.5 SMART_CONTRACTS
INSERT INTO smart_contracts (contract_id, funding_id, contract_address, usdc_token_address, last_drip_date, total_drip_count) VALUES
('sc-001', 'fund-001', '0x2A62961d6eF64C5A8c9aF9F2418eF83A0E5c4a52', '0x...TokenUSDC...', '2025-10-01', 1);

-- Mengaktifkan kembali Foreign Key Checks
SET FOREIGN_KEY_CHECKS = 1;