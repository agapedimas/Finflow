const SQL = require("../../sql");
const Functions = require("../../functions");
const Authentication = require("../../authentication");
const { ethers } = require("ethers");

// HELPERS
const success = (res, data, msg = "Success") => res.json({ success: true, message: msg, data });
const error = (res, msg, code = 500) => res.status(code).json({ success: false, message: msg });
const generateId = (prefix) => `${prefix}_${Date.now().toString(36)}`;
const generateToken = () => Math.random().toString(36).substr(2) + Date.now().toString(36);

module.exports = {
    // ============================================================
    // 1. FUNDER REGISTRATION (Pendaftaran Mandiri)
    // Flow: Buka Web -> Login Privy -> isi Form -> Submit
    // ============================================================
    registerFunder: async (req, res) => {
        try {
            // Input dari Frontend Funder
            const { email, wallet_address, full_name, org_name, bank_name, bank_account } = req.body;

            if (!email || !wallet_address) return error(res, "Data tidak lengkap", 400);

            // Cek duplikasi
            const check = await SQL.Query("SELECT id FROM accounts WHERE wallet_address = ?", [wallet_address]);
            if (check.data.length > 0) return error(res, "User sudah terdaftar", 400);

            const newId = generateId('funder');
            const username = email.split('@')[0];
            const dummyPass = "WALLET_LOGIN_" + Date.now();
            
            // A. Insert Data Funder
            const q1 = `
                INSERT INTO accounts 
                (id, username, displayname, password, email, wallet_address, organization_name, bank_name, bank_account_number, created) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;
            await SQL.Query(q1, [newId, username, full_name, dummyPass, email, wallet_address, org_name, bank_name, bank_account]);

            // B. Set Role Funder
            await SQL.Query("INSERT INTO accounts_funder (id, type) VALUES (?, 0)", [newId]);

            // C. Auto Login (Session)
            const sessionId = await Authentication.Add(newId, req.ip, true);
            if(req.session) { req.session.account = sessionId; req.session.is_privy = true; }

            return success(res, { id: newId, role: 'funder' }, "Funder Berhasil Terdaftar");
            
        } catch (e) {
            console.error(e);
            return error(res, "Gagal Register Funder");
        }
    },

    // ============================================================
    // 2. INVITE SYSTEM (Membuat Link Undangan)
    // Flow: Funder -> Student, Student -> Parent
    // ============================================================
    createInvite: async (req, res) => {
        try {
            const { wallet_address, invitee_email, role_target } = req.body;

            // Cek Pengundang
            const uRes = await SQL.Query("SELECT id FROM accounts WHERE wallet_address = ?", [wallet_address]);
            const inviter = uRes.data?.[0];
            if(!inviter) return error(res, "Unauthorized", 401);

            const token = generateToken();

            // Simpan Undangan
            const qInvite = `INSERT INTO invitations (token, inviter_id, invitee_email, role, status) VALUES (?, ?, ?, ?, 'pending')`;
            await SQL.Query(qInvite, [token, inviter.id, invitee_email, role_target]);

            // Generate Magic Link (Sesuaikan port frontend)
            const mockLink = `http://localhost:3000/register?role=${role_target}&token=${token}`;

            return success(res, { link: mockLink, token: token }, "Undangan Berhasil Dibuat");
        } catch (e) {
            return error(res, "Gagal membuat undangan");
        }
    },

    // ============================================================
    // 3. STUDENT & PARENT REGISTRATION (via Invite)
    // Flow: Terima Link Undangan -> Isi Form -> Submit
    // ============================================================
    registerStudent: async (req, res) => {
        try {
            const { email, wallet_address, full_name, bank_name, bank_account, invite_token } = req.body;

            // Validasi Token
            const iRes = await SQL.Query("SELECT * FROM invitations WHERE token = ? AND status = 'pending'", [invite_token]);
            const invite = iRes.data?.[0];

            if(!invite) return error(res, "Token Invalid / Kadaluarsa", 400);
            if(invite.role !== 'student') return error(res, "Link salah sasaran", 403);

            // SECURITY: Cek Email Match
            if(email !== invite.invitee_email) {
                return error(res, `Akses Ditolak! Undangan ini untuk ${invite.invitee_email}, bukan ${email}`, 403);
            }

            const newId = generateId('student');
            const username = email.split('@')[0];
            const dummyPass = "WALLET_LOGIN_" + Date.now();

            // Buat Akun
            const qAccount = `INSERT INTO accounts (id, username, displayname, password, email, wallet_address, bank_name, bank_account_number, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`;
            await SQL.Query(qAccount, [newId, username, full_name, dummyPass, email, wallet_address, bank_name, bank_account]);

            await SQL.Query("INSERT INTO accounts_student (id, balance) VALUES (?, 0)", [newId]);

            // Matikan Token (Q: Buat apa ini?? Masi bingung)
            await SQL.Query("UPDATE invitations SET status = 'used' WHERE id = ?", [invite.id]);

            const sessionId = await Authentication.Add(newId, req.ip, true);
            if(req.session) { req.session.account = sessionId; req.session.is_privy = true; }

            return success(res, { id: newId, role: 'student' }, "Akun Student Aktif");
        } catch (e) {
            return error(res, "Gagal Aktivasi Student");
        }
    },

    // ============================================================
    // 4. PARENT REGISTRATION (via Invite)
    // Flow: Terima Link Undangan -> Isi Form -> Submit
    // ============================================================
    registerParent: async (req, res) => {
        try {
            const { email, wallet_address, full_name, invite_token } = req.body;

            const iRes = await SQL.Query("SELECT * FROM invitations WHERE token = ? AND status = 'pending'", [invite_token]);
            const invite = iRes.data?.[0];

            if(!invite) return error(res, "Token Invalid / Kadaluarsa", 400);

            // SECURITY: Cek Email Match
            if(email !== invite.invitee_email) {
                return error(res, `Email login tidak sesuai undangan!`, 403);
            }

            const newId = generateId('parent');
            const username = email.split('@')[0];
            const dummyPass = "WALLET_LOGIN_" + Date.now();

            // Buat Akun Parent
            const qAccount = `INSERT INTO accounts (id, username, displayname, password, email, wallet_address, created) VALUES (?, ?, ?, ?, ?, ?, NOW())`;
            await SQL.Query(qAccount, [newId, username, full_name, dummyPass, email, wallet_address]);

            await SQL.Query("INSERT INTO accounts_funder (id, type) VALUES (?, 1)", [newId]);

            // LINK PARENT - STUDENT (invite.inviter_id adalah student)
            await SQL.Query("UPDATE accounts SET parent_id = ? WHERE id = ?", [newId, invite.inviter_id]);
            
            // Matikan Token
            await SQL.Query("UPDATE invitations SET status = 'used' WHERE id = ?", [invite.id]);

            const sessionId = await Authentication.Add(newId, req.ip, true);
            if(req.session) { req.session.account = sessionId; req.session.is_privy = true; }

            return success(res, { id: newId, role: 'parent' }, "Akun Parent Aktif");
        } catch (e) {
            return error(res, "Gagal Aktivasi Parent");
        }
    },

    // ============================================================
    // LOGIN UMUM
    // ============================================================
    login: async (req, res) => {
        try {
            const { email, wallet_address } = req.body;
            const checkRes = await SQL.Query("SELECT * FROM accounts WHERE wallet_address = ?", [wallet_address]);
            let user = checkRes.data && checkRes.data[0];

            if (!user) return error(res, "Akun tidak ditemukan. Harap daftar melalui Link Undangan (Student/Parent) atau Register Funder.", 404);

            // Tentukan Role (Student, Funder, atau Parent)
            let role = 'unknown';

            // Cek apakah Student?
            const checkStudent = await SQL.Query("SELECT id FROM accounts_student WHERE id = ?", [user.id]);
            if (checkStudent.data.length > 0) {
                role = 'student';
            } else {
                // Cek apakah Funder/Parent?
                const checkFunder = await SQL.Query("SELECT type FROM accounts_funder WHERE id = ?", [user.id]);
                if (checkFunder.data.length > 0) {
                    const type = checkFunder.data[0].type;
                    // Type 0 = Funder, Type 1 = Parent
                    role = (type === 1) ? 'parent' : 'funder';
                }
            }

            const sessionId = await Authentication.Add(user.id, req.ip, true);
            if (req.session) { req.session.account = sessionId; req.session.is_privy = true; }

            return success(res, {
                ...user, 
                role: role // Frontend akan pakai ini buat redirect halaman
            }, "Login Berhasil");
        } catch (e) {
            return error(res, "Login Error");
        }
    },

    // ============================================================
    // MODULE 4: TRANSACTIONS (Action & Vision)
    // Mencatat Pengeluaran, Menyimpan URL foto struk (untuk fitur AI Vision)
    // Mengurangi saldo balance user secara otomatis
    // ============================================================

    // A. SMART SCAN (OCR Service) - Auto fill Form
    // Frontend memanggil ini saat user upload foto di menu "Catat Pengeluaran"
    // Outputnya hanya JSON data, BELUM disimpan ke database
    scanReceipt: async (req, res) => {
        try {
            const { image_url } = req.body;

            if(!image_url) return error(res, "Image URL required", 400);

            // AI LOGIC
            // Simulasi Output AI (Supaya Frontend bisa demo)
            // Di real implementation ini hasil return dari Gemini API
            const aiExtractedData = {
                amount: "150000",
                merchant: "Warung Tegal Bahari",
                date: new Date().toISOString().split('T')[0],
                category_id: 1,
                description: "Makan Siang Nasi Rames"
            }

            return success(res, aiExtractedData, "Scan Berhasil");
        } catch (e) {
            return error(res, "Gagal memindai struk");
        }
    },

    // B. SAVE TRANSACTION (Simpan ke Database)
    // Dipanggil setelah user review hasil scan, atau input manual
    addTransaction: async (req, res) => {
        try {
            const { wallet_address, amount, category_id, description, merchant_name, transaction_date, proof_image_url } = req.body;

            // 1. Cek User & Saldo
            const uRes = await SQL.Query("SELECT a.id, s.balance FROM accounts a JOIN accounts_student s ON a.id = s.id WHERE a.wallet_address=?", [wallet_address]);
            const user = uRes.data?.[0];

            if(!user) return error(res, "User not found", 404);

            // Validasi Saldo (hanya jika expense, bukan income)
            // Asumsi addTransaction ini khusus expense
            if(Number(user.balance) < Number(amount)) return error(res, "Saldo tidak mencukupi!", 400);

            // 2. Tentukan Tanggal (Pakai input user ATAU waktu sekarang)
            const finalDate = transaction_date ? transaction_date : new Date();

            // 2. Simpan Transaksi 
            const txId = generateId("tx");
            const qTx = `
                INSERT INTO transactions 
                (transaction_id, student_id, amount, type, category_id, merchant_name, raw_description, proof_image_url, is_verified_by_ai, transaction_date) 
                VALUES (?, ?, ?, 'Expense', ?, ?, ?, ?, FALSE, NOW())
            `;
            await SQL.Query(qTx, [txId, user.id, amount, category_id, merchant_name || '', description, proof_image_url || null, finalDate]);

            // 3. Potong Saldo Student
            await SQL.Query("UPDATE accounts_student SET balance = balance - ? WHERE id=?", [amount, user.id]);

            return success(res, { tx_id: txId, new_balance: user.balance - amount }, "Transaksi Berhasil Disimpan");
        } catch (e) {
            console.error(e);
            return error(res, "Gagal memproses transaksi");
        }
    },

    // ============================================================
    // MODULE 7: AI CHATBOT (RAG Context Provider)
    // Frontend kirim pesan
    // Backend mengambil Context Data dari database
    // Backend mengirim Pesan User + Context Data ke Logic RAG
    // Balasan disimpan di chat history
    // ============================================================
    
}