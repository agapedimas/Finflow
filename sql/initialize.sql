-- =======================================================
-- 1. SETUP AWAL DAN PERINTAH CLEANUP
-- =======================================================
SET time_zone = '+07:00';
SET FOREIGN_KEY_CHECKS = 0; 

-- 1. INSERT KATEGORI
INSERT IGNORE INTO allocation_categories (id, category_name) VALUES 
(0, 'Wants'), (1, 'Needs'), (2, 'Education');

-- 2. INSERT USERS (4 Karakter Utama)
-- Funder
INSERT INTO accounts (id, username, displayname, email, wallet_address, invite_code) VALUES 
('funder_01', 'yayasan_finflow', 'Yayasan Finflow', 'admin@finflow.id', '0x_FUNDER_WALLET', 'INV_FUNDER_001');
INSERT INTO accounts_funder (id, type) VALUES ('funder_01', 0);

-- Student 1 (Budi - The Good One)
INSERT INTO accounts (id, username, displayname, email, wallet_address, invite_code) VALUES 
('student_01', 'budi_santoso', 'Budi Santoso', 'budi@student.com', '0x_BUDI_WALLET', 'INV_BUDI_001');
INSERT INTO accounts_student (id, balance) VALUES ('student_01', 2500000.00);

-- Student 2 (Siti - The Edge Case)
INSERT INTO accounts (id, username, displayname, email, wallet_address, invite_code) VALUES 
('student_02', 'siti_aminah', 'Siti Aminah', 'siti@student.com', '0x_SITI_WALLET', 'INV_SITI_001');
INSERT INTO accounts_student (id, balance) VALUES ('student_02', 150000.00); -- Saldo Kritis!

-- Parent (Pak Santoso - Ayah Budi)
INSERT INTO accounts (id, username, displayname, email, wallet_address) VALUES 
('parent_01', 'santoso_ayah', 'Pak Santoso', 'santoso@parent.com', '0x_PARENT_WALLET');
-- LINK Parent ke Budi
UPDATE accounts SET parent_id = 'parent_01' WHERE id = 'student_01';

-- Set password dummy '123456' (Harusnya di-hash, tapi untuk dummy plain dulu ok)
UPDATE accounts SET password = '123456' WHERE id = 'funder_01';
UPDATE accounts SET password = '123456' WHERE id = 'student_01';

-- 3. INSERT FUNDING & RULES
-- Funding Budi (6 Juta)
INSERT INTO funding (funding_id, funder_id, student_id, total_monthly_fund, start_date, status) VALUES 
('fund_budi', 'funder_01', 'student_01', 6000000, '2025-01-01', 'Active');

-- Rules Budi (Drip Mingguan)
INSERT INTO funding_allocation (allocation_id, funding_id, category_id, monthly_budget, drip_frequency, drip_amount, remaining_drip_count) VALUES 
('alloc_budi_1', 'fund_budi', 1, 2000000, 'Weekly', 500000, 20), -- Needs
('alloc_budi_2', 'fund_budi', 0, 1000000, 'Weekly', 250000, 20), -- Wants
('alloc_budi_3', 'fund_budi', 2, 3000000, 'Locked', 0, 0);       -- Edu (Vault)

-- Funding Siti (4 Juta)
INSERT INTO funding (funding_id, funder_id, student_id, total_monthly_fund, start_date, status) VALUES 
('fund_siti', 'funder_01', 'student_02', 4000000, '2025-01-01', 'Active');

-- Rules Siti
INSERT INTO funding_allocation (allocation_id, funding_id, category_id, monthly_budget, drip_frequency, drip_amount, remaining_drip_count) VALUES 
('alloc_siti_1', 'fund_siti', 1, 2000000, 'Weekly', 500000, 18);


-- 4. INSERT TRANSACTIONS (History)
-- Budi: Income Drip (Uang Masuk)
INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description, is_verified_by_ai) VALUES 
('tx_budi_in', 'student_01', 750000, 'Drip_In', NULL, 'Minggu 1: Needs + Wants', TRUE);

-- Budi: Expense (Makan - Normal)
INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description) VALUES 
('tx_budi_out1', 'student_01', 25000, 'Expense', 1, 'Makan Siang Warteg');

-- Budi: Expense (Buku - AI Verified)
INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description, is_verified_by_ai, proof_image_url) VALUES 
('tx_budi_edu', 'student_01', 150000, 'Expense', 2, 'Beli Buku Coding', TRUE, 'http://img.url/struk_buku.jpg');

-- Siti: URGENT WITHDRAWAL (Dana Darurat)
INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description, is_urgent_withdrawal, urgency_reason, is_verified_by_ai) VALUES 
('tx_siti_urgent', 'student_02', 500000, 'Drip_In', 1, 'Dana Darurat: Sakit Gigi', TRUE, 'Sakit gigi butuh ke dokter segera', TRUE);


-- 5. INSERT BUDGET PLAN (AI Scenarios)
-- Budi: Approved
INSERT INTO budget_plan (id, planner_id, item_name, category_id, price, quantity, month, year, status, ai_feedback) VALUES 
('plan_budi_1', 'student_01', 'Course Udemy', 2, 150000, 1, 11, 2025, 'approved', 'Sangat bagus untuk skill.');

-- Siti: REJECTED (Edge Case)
INSERT INTO budget_plan (id, planner_id, item_name, category_id, price, quantity, month, year, status, ai_feedback) VALUES 
('plan_siti_1', 'student_02', 'Tas Branded', 0, 2000000, 1, 11, 2025, 'rejected', 'Ditolak. Harga melebihi 50% total budget bulanan kamu.');


-- 6. INSERT NOTIFICATIONS (Loneng)
-- Notif Sukses
INSERT INTO notifications (user_id, title, message, type) VALUES 
('student_01', 'Uang Masuk 💸', 'Drip mingguan Rp 750.000 berhasil dicairkan.', 'Success');

-- Notif Warning (Siti Boros)
INSERT INTO notifications (user_id, title, message, type) VALUES 
('student_02', '⚠️ Bahaya!', 'Kamu sudah menghabiskan 80% dana dalam 3 hari. Rem sedikit ya!', 'Warning');


-- 7. INSERT CHAT HISTORY
INSERT INTO chat_history (student_id, content) VALUES 
('student_01', '[{"role": "user", "parts": [{"text": "Halo Finflow, uangku aman?"}]}, {"role": "model", "parts": [{"text": "Halo Budi! Aman sekali. Kamu baru pakai 5% budget."}]}]');

SET FOREIGN_KEY_CHECKS = 1;