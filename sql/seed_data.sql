-- file ini berisi query INSERT untuk mengisi data awal pada database.

-- Hapus data yang ada untuk pengujian berulang
DELETE FROM smart_contracts;
DELETE FROM funding_allocation;
DELETE FROM funding;
DELETE FROM transactions;
DELETE FROM accounts;

-- =======================================================
-- 1. ACCOUNTS (1 Funder dan 1 Student)
-- =======================================================

-- Funder A: ID 12345 (Digunakan untuk membuat perjanjian dana)
INSERT INTO accounts (id, username, nickname, password, avatarversion) VALUES
('funder-12345', 'funder.a', 'Bapak Funder', '$2b$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 1);

-- Student B: ID 54321 (Student utama yang akan diuji)
INSERT INTO accounts (id, username, nickname, password, avatarversion) VALUES
('student-54321', 'student.b', 'Budi Santoso', '$2b$10$YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY', 1);

-- Catatan: Ganti nilai '$2b$10$...' dengan hash password yang benar untuk pengujian.

-- =======================================================
-- 2. FUNDING (Perjanjian Pendanaan Aktif)
-- =======================================================

-- Perjanjian antara Funder A dan Student B
INSERT INTO funding (funding_id, funder_id, student_id, total_monthly_fund, start_date, status) VALUES
('fund-001', 'funder-12345', 'student-54321', 5000000.00, '2025-10-01', 'Active');

-- =======================================================
-- 3. FUNDING_ALLOCATION (Aturan Budget Funder)
-- =======================================================

-- Total 5.000.000 dialokasikan
INSERT INTO funding_allocation (allocation_id, funding_id, category_type, monthly_budget, drip_frequency, drip_amount) VALUES
('alloc-001-needs', 'fund-001', 'Needs', 3000000.00, 'Monthly', 3000000.00), -- 60%
('alloc-001-wants', 'fund-001', 'Wants', 1000000.00, 'Monthly', 1000000.00), -- 20%
('alloc-001-edu', 'fund-001', 'Education', 1000000.00, 'Monthly', 1000000.00); -- 20%

-- =======================================================
-- 4. TRANSACTIONS (Data Keuangan)
-- =======================================================

-- Pemasukan (Gaji Personal - Tidak terkait Funder)
INSERT INTO transactions (transaction_id, student_id, transaction_date, amount, type, category, allocation_type, raw_description) VALUES
('trx-inc-001', 'student-54321', '2025-11-01 10:00:00', 1000000.00, 'Income', 'Gaji Sampingan', 'Personal', 'Pembayaran project freelance');

-- Pengeluaran NEEDS (Dana Funder)
INSERT INTO transactions (transaction_id, student_id, funding_id, transaction_date, amount, type, category, allocation_type, raw_description) VALUES
('trx-exp-001', 'student-54321', 'fund-001', '2025-11-02 12:30:00', 500000.00, 'Expense', 'Grocery', 'Needs', 'Belanja bulanan di Supermarket');

-- Pengeluaran WANTS (Dana Funder, sesuai Aturan: dialokasikan ke PERSONAL)
INSERT INTO transactions (transaction_id, student_id, funding_id, transaction_date, amount, type, category, allocation_type, raw_description) VALUES
('trx-exp-002', 'student-54321', 'fund-001', '2025-11-03 15:00:00', 150000.00, 'Expense', 'Hiburan', 'Personal', 'Tiket bioskop nonton film baru');

-- Pengeluaran EDUCATION (Dana Funder)
INSERT INTO transactions (transaction_id, student_id, funding_id, transaction_date, amount, type, category, allocation_type, raw_description, is_verified_by_ai) VALUES
('trx-exp-003', 'student-54321', 'fund-001', '2025-11-04 09:00:00', 600000.00, 'Expense', 'Edukasi', 'Education', 'Pembayaran Course Data Science', TRUE);

-- Pengeluaran PERSONAL (Dana Pribadi)
INSERT INTO transactions (transaction_id, student_id, transaction_date, amount, type, category, allocation_type, raw_description) VALUES
('trx-exp-004', 'student-54321', '2025-11-05 08:00:00', 35000.00, 'Expense', 'Makanan', 'Personal', 'Kopi susu di Starbuck');

-- =======================================================
-- 5. SMART_CONTRACTS (Hanya Sebagai Placeholder)
-- =======================================================
INSERT INTO smart_contracts (contract_id, funding_id, contract_address, usdc_token_address, last_drip_date, total_drip_count) VALUES
('sc-001', 'fund-001', '0x2A62961d6eF64C5A8c9aF9F2418eF83A0E5c4a52', '0x...TokenUSDC...', '2025-10-01', 1);