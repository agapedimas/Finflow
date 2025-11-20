-- =======================================================
-- RESET DATA (Hapus data lama biar bersih saat testing)
-- =======================================================
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE chat_history;
TRUNCATE TABLE transactions;
TRUNCATE TABLE budget_plan;
TRUNCATE TABLE smart_contracts;
TRUNCATE TABLE funding_allocation;
TRUNCATE TABLE funding;
TRUNCATE TABLE accounts_funder;
TRUNCATE TABLE accounts_student;
TRUNCATE TABLE accounts;
TRUNCATE TABLE allocation_categories;
SET FOREIGN_KEY_CHECKS = 1;

-- =======================================================
-- 1. CATEGORIES (Master Data)
-- =======================================================
INSERT INTO allocation_categories (id, category_name) VALUES 
(0, 'Wants'),      -- Keinginan (Kopi, Nonton)
(1, 'Needs'),      -- Kebutuhan (Makan, Transport)
(2, 'Education');  -- Pendidikan (Buku, Kursus) - Vault

-- =======================================================
-- 2. ACCOUNTS (User Login via Privy)
-- =======================================================

-- A. FUNDER (Yayasan Finflow)
-- FIX: Menambahkan 'password' dan 'phonenumber'
INSERT INTO accounts (id, username, displayname, password, phonenumber, email, wallet_address, created) VALUES 
('funder_01', 'yayasan_finflow', 'Yayasan Finflow Indonesia', '123456', '08111111111', 'admin@finflow.id', '0x_funder_wallet_address_123', NOW());

INSERT INTO accounts_funder (id, type) VALUES ('funder_01', 0);

-- B. STUDENT 1 (Budi - The Good Student)
-- FIX: Menambahkan 'password' dan 'phonenumber'
INSERT INTO accounts (id, username, displayname, password, phonenumber, email, wallet_address, created) VALUES 
('student_01', 'budi_santoso', 'Budi Santoso', '123456', '08122222222', 'budi@student.com', '0x_budi_wallet_address_456', NOW());

INSERT INTO accounts_student (id, balance) VALUES ('student_01', 1500000.00);

-- C. STUDENT 2 (Siti - The Edge Case/Boros)
-- FIX: Menambahkan 'password' dan 'phonenumber'
INSERT INTO accounts (id, username, displayname, password, phonenumber, email, wallet_address, created) VALUES 
('student_02', 'siti_aminah', 'Siti Aminah', '123456', '08133333333', 'siti@student.com', '0x_siti_wallet_address_789', NOW());

INSERT INTO accounts_student (id, balance) VALUES ('student_02', 200000.00);

-- =======================================================
-- 3. FUNDING & CONTRACTS (Blockchain Simulation)
-- =======================================================

-- Setup Beasiswa Budi (6 Juta Rupiah)
INSERT INTO funding (funding_id, funder_id, student_id, total_monthly_fund, start_date, end_date, status) VALUES 
('fund_budi_01', 'funder_01', 'student_01', 6000000.00, '2025-01-01', '2025-06-30', 'Active');

-- Link ke Smart Contract (Polygon Amoy)
INSERT INTO smart_contracts (contract_id, funding_id, contract_address, usdc_token_address, is_locked_education) VALUES 
('sc_budi_01', 'fund_budi_01', '0xContractAddressBudiOnPolygon', '0xUSDCAddress', TRUE);

-- Aturan Alokasi Budi (Drip Weekly)
INSERT INTO funding_allocation (allocation_id, funding_id, category_id, monthly_budget, drip_frequency, drip_amount) VALUES 
('alloc_budi_needs', 'fund_budi_01', 1, 2000000.00, 'Weekly', 500000.00),
('alloc_budi_wants', 'fund_budi_01', 0, 1000000.00, 'Weekly', 250000.00),
('alloc_budi_edu',   'fund_budi_01', 2, 3000000.00, 'Locked', 0.00);


-- Setup Beasiswa Siti (4 Juta Rupiah)
INSERT INTO funding (funding_id, funder_id, student_id, total_monthly_fund, start_date, end_date, status) VALUES 
('fund_siti_01', 'funder_01', 'student_02', 4000000.00, '2025-01-01', '2025-06-30', 'Active');

INSERT INTO funding_allocation (allocation_id, funding_id, category_id, monthly_budget, drip_frequency, drip_amount) VALUES 
('alloc_siti_needs', 'fund_siti_01', 1, 2000000.00, 'Weekly', 500000.00);

-- =======================================================
-- 4. BUDGET_PLAN (Validasi AI)
-- =======================================================

INSERT INTO budget_plan (id, planner_id, item_name, category_id, price, quantity, month, year, status, ai_feedback) VALUES 
('plan_budi_1', 'student_01', 'Paket Data Belajar', 1, 100000.00, 1, 11, 2025, 'approved', 'Valid.'),
('plan_budi_2', 'student_01', 'Buku Ekonomi Makro', 2, 250000.00, 1, 11, 2025, 'approved', 'Valid.'),
('plan_budi_3', 'student_01', 'Langganan Spotify', 0, 55000.00, 1, 11, 2025, 'approved', 'Valid.'),
('plan_siti_1', 'student_02', 'Makan Siang Kantin', 1, 600000.00, 1, 11, 2025, 'approved', 'Valid.'),
('plan_siti_2', 'student_02', 'Tiket Konser VIP', 0, 1500000.00, 1, 11, 2025, 'rejected', 'Ditolak.');

-- =======================================================
-- 5. TRANSACTIONS (History Data)
-- =======================================================

-- A. PENERIMAAN DANA BUDI (Drip Weekly Needs + Wants)
INSERT INTO transactions (transaction_id, student_id, transaction_date, amount, type, category_id, is_verified_by_ai, raw_description, blockchain_tx_hash) VALUES 
('tx_in_01', 'student_01', '2025-11-01 08:00:00', 750000.00, 'Income', 1, TRUE, 'Pencairan Mingguan (Needs+Wants)', '0xTxHash123456'),
('tx_in_02', 'student_01', '2025-11-08 08:00:00', 750000.00, 'Income', 1, TRUE, 'Pencairan Mingguan (Needs+Wants)', '0xTxHash789012');

-- B. PENGELUARAN BUDI (Sehat)
INSERT INTO transactions (transaction_id, student_id, transaction_date, amount, type, category_id, raw_description) VALUES 
('tx_out_01', 'student_01', '2025-11-02 12:30:00', 25000.00, 'Expense', 1, 'Makan Siang Ayam Geprek'),
('tx_out_02', 'student_01', '2025-11-02 18:00:00', 15000.00, 'Expense', 1, 'Ojek Online ke Kampus'),
('tx_out_03', 'student_01', '2025-11-03 20:00:00', 30000.00, 'Expense', 0, 'Nongkrong Kopi Kenangan');

-- C. PENGELUARAN PENDIDIKAN (Dengan Bukti Struk & Validasi AI)
INSERT INTO transactions (transaction_id, student_id, transaction_date, amount, type, category_id, is_verified_by_ai, raw_description, proof_image_url) VALUES 
('tx_edu_01', 'student_01', '2025-11-05 10:00:00', 250000.00, 'Expense', 2, TRUE, 'Beli Buku Gramedia', 'https://dummyimage.com/600x800/000/fff&text=Struk+Buku+Ekonomi');

-- D. PENGELUARAN SITI (Boros -> Untuk trigger Notifikasi Warning)
INSERT INTO transactions (transaction_id, student_id, transaction_date, amount, type, category_id, raw_description) VALUES 
('tx_out_siti_1', 'student_02', '2025-11-01 10:00:00', 500000.00, 'Expense', 0, 'Belanja Skin Care (Boros)');
-- =======================================================
-- 6. CHAT HISTORY
-- =======================================================
INSERT INTO chat_history (student_id, content) VALUES 
('student_01', '[]');