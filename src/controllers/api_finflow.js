const SQL = require("../../sql");
const Authentication = require("../../authentication");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const GeminiModule = require("../../gemini");

GeminiModule.Initialize();

/**
 * @param {string} prompt - Instruksi untuk AI
 * @param {object} fileObj - Objek file hasil saveBufferToTemp { path, mimeType, name }
 * @param {string} role - 'OCR' | 'AUDITOR' | 'COACH'
 */
async function askGemini(prompt, fileObj = null, role = 'COACH') {
    try {
        // 1. PILIH MODEL (Berdasarkan urutan di settings.json teman)
        // Index 0: gemini-2.5-flash (Thinking) -> Cocok untuk AUDITOR (Analisis mendalam)
        // Index 2: gemini-2.0-flash (Cepat)    -> Cocok untuk OCR & COACH
        let modelIndex = 2; 
        if (role === 'AUDITOR') modelIndex = 0;
        
        // 2. PANGGIL MODUL TEMAN
        // Chat.Send(message, modelIndex, history, file)
        const response = await GeminiModule.Chat.Send(
            prompt, 
            modelIndex, 
            [], // History kosong karena ini "One-Shot Request"
            fileObj 
        );

        // 3. AMBIL HASIL TEKS
        const text = response.text;

        // 4. AUTO-CLEAN JSON (Jika mode OCR/AUDITOR)
        // AI sering menambahkan ```json di awal dan ``` di akhir. Kita harus buang.
        if (role === 'AUDITOR' || role === 'OCR') {
            try {
                const cleanText = text.replace(/```json|```/g, '').trim();
                return JSON.parse(cleanText);
            } catch (err) {
                console.error("[AI JSON ERROR] Gagal parse:", text);
                // Return null atau objek error agar controller di bawahnya tau
                return null;
            }
        }

        // Jika mode COACH, kembalikan teks biasa
        return text;

    } catch (error) {
        console.error(`[GEMINI WRAPPER ERROR] Role: ${role}`, error);
        return null;
    }
}

// [BARU] Helper: Simpan Buffer (dari req.files) ke File Fisik
function saveBufferToTemp(buffer, mimetype) {
    // 1. Tentukan ekstensi file (jpg/png)
    const ext = mimetype.split('/')[1] || 'jpg';
    
    // 2. Buat nama file unik
    const fileName = `scan_${Date.now()}.${ext}`;
    const dirPath = path.join(__dirname, "../../temp");
    const filePath = path.join(dirPath, fileName);

    // Pastikan folder temp ada
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);

    // 3. Tulis buffer langsung ke disk (Cepat!)
    fs.writeFileSync(filePath, buffer);

    // Return format object untuk modul Gemini teman Anda
    return {
        path: filePath,
        mimeType: mimetype,
        name: fileName
    };
}

// CONFIG BLOCKCHAIN
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
// Wallet Admin (Signer). Backend bertindak sebagai Admin yang memegang Private Key
const adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
// ABI Sederhana (Hanya fungsi yang kita butuhkan: transfer)
const tokenAbi = [
    "function transfer(address to, uint256 amount) public returns (bool)",
    "function balanceOf(address owner) view returns (uint256)"
];

// Instance Contract
const tokenContract = new ethers.Contract(process.env.TOKEN_CONTRACT_ADDRESS, tokenAbi, adminWallet);
const VAULT_ADDRESS = process.env.VAULT_WALLET_ADDRESS;

// HELPERS
const success = (res, data, msg = "Success") => res.json({ success: true, message: msg, data });
const error = (res, msg, code = 500) => res.status(code).json({ success: false, message: msg });
const generateId = (prefix) => `${prefix}_${Date.now().toString(36)}`;
const generateToken = () => Math.random().toString(36).substr(2) + Date.now().toString(36);

// Hitung selisih minggu antara dua tanggal 
const calculateWeeks = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Hitung selisih milidetik
    const diffTime = Math.abs(end - start);
    // Konversi ke hari (1000ms * 60s * 60m * 24h)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Konversi ke minggu (pembulatan ke bawah, minimal 1 minggu biar gak error bagi 0)
    const weeks = Math.max(1, Math.floor(diffDays / 7));
    
    return weeks;
};

// Helper AI Check (mockup)
// Mengecek apakah proporsi budget sehat?
const aiCheckBudgetHealth = (total, needs, wants, edu) => {
    const wantsRatio = wants / total;

    if (wantsRatio > 0.3) { // Rule: Wants maks 30%
        return {
            approved: false,
            reason: "Proporsi 'Wants' terlalu besar (>30%). Kurangi jatah hura-hura, alihkan ke Needs atau Education."
        };
    }

    if((needs + wants + edu) !== total) {
        return {
            approved: false,
            reason: "Total alokasi tidak sama dengan total dana yang tersedia."
        }
    }
    return { approved: true, reason: "Rencana keuangan sehat dan disetujui AI."};
}


// -- MIDDLEWARE AUTH --
// Fungsi ini dipasang di Router untuk melindungi API
const requireAuth = async (req, res, next) => {
    // 1. Cek apakah ada session?
    if (!req.session || !req.session.account) {
        return res.status(401).json({ success: false, message: "Unauthorized: Silakan Login Dulu" });
    }

    // 2. Ambil ID Session
    const sessionId = req.session.account;

    try {
        // 3. Cek ke Database Authentication (Sesuai file authentication.js Anda)
        const authQ = "SELECT user FROM authentication WHERE id = ?";
        const authRes = await SQL.Query(authQ, [sessionId]);

        if(!authRes.data || authRes.data.length === 0){
            return res.status(401).json({ success: false, message: "Session Expired" });
        }

        const userId = authRes.data[0].user;

        // 4. Ambil Data User Lengkap
        const userQ = "SELECT * FROM accounts WHERE id = ?";
        const userRes = await SQL.Query(userQ, [userId]);

        if (!userRes.data || userRes.data.length === 0) {
            return res.status(401).json({ success: false, message: "User tidak ditemukan" });
        }

        // 5. TEMPELKAN USER KE REQUEST (Magic Moment)
        // Agar controller di bawahnya tidak perlu cari user lagi
        req.currentUser = userRes.data[0];
        
        next(); // Lanjut ke Controller Asli
    } catch (e) {
        return res.status(500).json({ success: false, message: "Auth Error" });
    }
}
module.exports = {
    requireAuth,

    registerFunder: async (req, res) => {
        try {
            // Input dari Frontend Funder
            const { email, wallet_address, full_name, org_name, bank_name, bank_account, phonenumber } = req.body;

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
                (id, username, displayname, email, wallet_address, organization_name, bank_name, bank_account_number, phonenumber, role, created) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ScholarshipFunder', NOW())
            `;
            await SQL.Query(q1, [newId, username, full_name, email, wallet_address, org_name, bank_name, bank_account, phonenumber]);

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

    createInvite: async (req, res) => {
        try {
            const { invitee_email, role_target } = req.body;

            // Cek Pengundang
            const inviter = req.currentUser;
            if(!inviter) return error(res, "Unauthorized", 401);

            const token = generateToken();

            // Simpan Undangan
            const qInvite = `INSERT INTO invitations (token, inviter_id, invitee_email, role, status) VALUES (?, ?, ?, ?, 'pending')`;
            await SQL.Query(qInvite, [token, inviter.id, invitee_email, role_target]);

            // Generate Magic Link (Sesuaikan port frontend)
            const link = `http://localhost:1111/signup/web3auth?token=${token}&type=${role_target}`;

            return success(res, { link: link, token: token }, "Undangan Berhasil Dibuat");
        } catch (e) {
            return error(res, "Gagal membuat undangan");
        }
    },

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
            const qAccount = `INSERT INTO accounts (id, username, displayname, email, wallet_address, bank_name, bank_account_number, phonenumber, role, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Student', NOW())`;
            await SQL.Query(qAccount, [newId, username, full_name, email, wallet_address, bank_name, bank_account, phonenumber]);

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
            const qAccount = `INSERT INTO accounts (id, username, displayname, email, wallet_address, phonenumber, role, created) VALUES (?, ?, ?, ?, ?, ?, ?, 'Parent', NOW())`;
            await SQL.Query(qAccount, [newId, username, full_name, email, wallet_address, phonenumber]);

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
    // MODULE 2: FUNDING AGREEMENT (Kesepakatan Awal)
    // ============================================================

    // 1. Funder Memulai (Set Dana Pokok)
    initiateFunding: async (req, res) => {
        try {
            const { student_email, total_amount, start_date, end_date, period_name } = req.body;

            const funder = req.currentUser;
            if(!funder) return error(res, "Funder tidak ditemukan", 404);

            // Cari Student by Email (Karena Funder input email)
            const sRes = await SQL.Query("SELECT id FROM accounts WHERE email=?", [student_email]);
            const student = sRes.data?.[0];
            if(!student) return error(res, "Student tidak ditemukan", 404);

            // Buat ID Funding Baru
            const fundingId = generateId("fund");

            // Simpan ke DB 
            // Kita simpan dulu uangnya di database (belum ke smart contract di tahap ini, simulasi hold)
            const q = `
                INSERT INTO funding 
                (funding_id, funder_id, student_id, total_period_fund, start_date, end_date, status) 
                VALUES (?, ?, ?, ?, ?, ?, 'Open_For_Parent')
            `;

            // Note: periode_name bisa disimpan jika tabel funding diupdate kolomnya,
            // atau kita anggap start_date sebagai penanda periode
            await SQL.Query(q, [fundingId, funder.id, student.id, total_amount, start_date, end_date]);

            return success(res, { funding_id: fundingId, status: 'Open_For_Parent' }, "Inisiasi Sukses. Menunggu Topup Parent.");
        } catch (e) {
            return error(res, "Gagal inisiasi funding")
        }
    },

    // 2. Parent Melihat & Topup (Opsional)
    parentTopup: async (req, res) => {
        try {
            const { amount, is_final } = req.body;

            // Cari Parent
            const parent = req.currentUser;
            if (!parent) return error(res, "Parent not found", 404);

            // Cari Student Anak-nya 
            // Kita cari student mana yang punya parent_id = parent.id
            // Note: Kalo parent punya > 1 anak gimana?
            const sRes = await SQL.Query("SELECT id FROM accounts WHERE parent_id=?", [parent.id]);
            const student = sRes.data?.[0];
            if (!student) return error(res, "Anda belum terhubung dengan student manapun", 404);

            // Cari Funding yang statusnya 'Open_For_Parent'
            const fRes = await SQL.Query("SELECT funding_id, total_monthly_fund FROM funding WHERE student_id=? AND status='Open_For_Parent'", [student.id]);
            const funding = fRes.data?.[0];
            
            if (!funding) return error(res, "Tidak ada sesi topup aktif", 404);

            // Update Dana
            const newTotal = Number(funding.total_period_fund) + Number(amount);
            await SQL.Query("UPDATE funding SET total_period_fund = ? WHERE funding_id = ?", [newTotal, funding.funding_id]);

            // JIKA PARENT SUDAH SELESAI (Klik "Finalize Topup")
            // Lempar bola ke Student (Status: Waiting_Allocation)
            if (is_final) {
                await SQL.Query("UPDATE funding SET status = 'Waiting_Allocation' WHERE funding_id = ?", [funding.funding_id]);
                
                // Notif ke Student
                const notifTitle = "Dana siap diatur";
                const notifMsg = `Orang tua sudah menyelesaikan top-up. Total dana tersedia: Rp ${newTotal}. Silakan buat Budget Plan sekarang.`;

                await SQL.Query(
                    "INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'Info')",
                    [student.id, notifTitle, notifMsg]
                );
            }

            return success(res, { new_total: newTotal }, "Topup Berhasil");
        } catch (e) {
            return error(res, "Gagal melakukan topup");
        }
    },

    // 3. Student Buat Plan & AI Validasi
    finalizeAgreement: async (req, res) => {
        try {
            const { alloc_needs, alloc_wants, alloc_edu } = req.body;

            const student = req.currentUser;
            if (!student) return error(res, "User not found", 404);

            const fRes = await SQL.Query("SELECT funding_id, total_period_fund, funder_id, start_date, end_date FROM funding WHERE student_id=? AND status='Waiting_Allocation'", [student.id]);
            const funding = fRes.data?.[0];
            if (!funding) return error(res, "Tidak ada dana yang perlu diatur", 400);
    

            const totalDana = Number(funding.total_period_fund);
            const inputTotal = Number(alloc_needs) + Number(alloc_wants) + Number(alloc_edu);
            
            // --- AI VALIDATION ---
            const aiCheck = aiCheckBudgetHealth(totalDana, Number(alloc_needs), Number(alloc_wants), Number(alloc_edu));

            // Jika AI menolak proses Berhenti disini
            if (!aiCheck.approved) return error(res, aiCheck.reason, 400);

            // Logic Hitung Drip Mingguan
            const totalWeeks = calculateWeeks(funding.start_date, funding.end_date);

            // Hitung jatah per minggu (Needs + Wants dibagi jumlah minggu)
            const dripNeeds = Math.floor(Number(alloc_needs) / totalWeeks);
            const dripWants = Math.floor(Number(alloc_wants) / totalWeeks);

            // Drip Amount total yang akan ditransfer smart contract tiap minggu
            // Sisa koma pembagian dibiarkan mengendap atau bisa dimasukkan ke minggu terakhir

            // --- SETUP DATABASE ---
            // Insert Allocations untuk Drip (Needs & Wants)
            const qAllocDrip = `
                INSERT INTO funding_allocation (allocation_id, funding_id, category_id, total_allocation, drip_frequency, drip_amount, remaining_drip_count)
                VALUES
                (?, ?, 1, ?, 'Weekly', ?, ?) -- Needs,
                (?, ?, 0, ?, 'Weekly', ?, ?) -- Wants
           `; 

            await SQL.Query(qAllocDrip, [
                generateId('alloc_n'), funding.funding_id, alloc_needs, dripNeeds, totalWeeks,
                generateId('alloc_w'), funding.funding_id, alloc_wants, dripWants, totalWeeks
            ]);

            // Insert Allocation untuk Vault (Education)
            const qAllocVault = `
                INSERT INTO funding_allocation (allocation_id, funding_id, category_id, total_allocation, drip_frequency, drip_amount, total_withdrawn) 
                VALUES (?, ?, 2, ?, 'Locked', 0, 0)
            `;

            // alloc_edu masuk ke 'total_allocation', drip_amount = 0
            await SQL.Query(qAllocVault, [generateId('alloc_e'), funding.funding_id, alloc_edu]);

            // UPDATE STATUS -> READY_TO_FUND (Bukan Active)
            // Ini menandakan ke Funder bahwa: "Plan sudah OK, Uang siap diterima."
            await SQL.Query("UPDATE funding SET status = 'Ready_To_Fund' WHERE funding_id = ?", [funding.funding_id]);

            // KIRIM NOTIFIKASI KE FUNDER
            // Agar Funder tahu dia harus bayar
            await SQL.Query(
                "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Plan Disetujui AI ✅', 'Student telah menyusun anggaran dan disetujui AI. Silakan lakukan pembayaran untuk mengaktifkan beasiswa.', 'Info')",
                [funding.funder_id]
            );

            // [BARU] Notif ke Parent (Jika ada)
            if (student.parent_id) {
                await SQL.Query(
                    "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Update Beasiswa 📝', 'Anak Anda telah menyelesaikan rencana anggaran. Silakan cek dashboard.', 'Info')",
                    [student.parent_id]
                );
            }

            return success(res, { 
                status: "Ready_To_Fund", 
                ai_message: aiCheck.reason,
                next_step: "Menunggu Pembayaran Funder"
            }, "Plan Disetujui AI. Menunggu Funder Transfer.");

        } catch (e) {
            console.error(e);
            return error(res, "Gagal finalisasi agreement");
        }
    },

    // CONFIRM TRANSFER (Crowdfunding + Batch Support)
    // Bisa dipakai oleh Funder (Bayar Full/Sisa) atau Parent (Bayar Sebagian)
    confirmTransfer: async (req, res) => {
        try {
            // Input fleksibel:
            // 1. funding_ids: Array ID yang mau dibayar
            // 2. amount_paid: Nominal (Opsional). Jika kosong/null, dianggap LUNAS (Full Payment).
            const {  funding_ids, amount_paid } = req.body;

            if (!Array.isArray(funding_ids) || funding_ids.length === 0) {
                return error(res, "Funding IDs harus array dan tidak boleh kosong", 400);
            }

            // Ambil Data Funding yang mau dibayar
            // Status bisa 'Ready_To_Fund' (Belum ada dana) atau 'Partially_Funded' (Sudah ada dana sebagian)
            const placeholders = funding_ids.map(() => '?').join(',');
            const qCheck = `
                SELECT funding_id, total_period_fund, collected_amount, student_id 
                FROM funding 
                WHERE funding_id IN (${placeholders}) 
                AND status IN ('Ready_To_Fund', 'Partially_Funded')
            `;
            
            const fRes = await SQL.Query(qCheck, funding_ids);
            const fundingsToProcess = fRes.data || [];

            if (fundingsToProcess.length === 0) {
                return error(res, "Tidak ada tagihan aktif yang bisa dibayar.", 404);
            }

            let processedCount = 0;
            let totalMoneyReceived = 0;
            let lastTxHash = null;

            for (const fund of fundingsToProcess) {
                const totalTarget = Number(fund.total_period_fund);
                const currentCollected = Number(fund.collected_amount || 0);
                const remaining = totalTarget - currentCollected;

                // Tentukan berapa yang dibayar kali ini
                let payNow = 0;
                if (amount_paid) {
                    // Jika user input nominal spesifik (misal Parent bayar 1 Juta)
                    payNow = Number(amount_paid);
                } else {
                    // Jika kosong (Funder klik "Bayar"), asumsikan MELUNASI sisanya
                    payNow = remaining;
                }

                // --- LOGIC BLOCKCHAIN (THE ENGINE) ---
                // Kita melakukan transfer di setiap loop atau diakumulasi?
                // Agar hemat gas, idealnya diakumulasi. Tapi agar tercatat per anak, kita loop.
                // Skenario: Admin "memindahkan" token dari Treasury ke Vault seolah-olah Funder yang setor.
                try {
                    console.log(`[BLOCKCHAIN] Mengirim ${payNow} FIDR ke Vault...`);
                    
                    // Logika: Admin Transfer Token ke Vault Address
                    // Seolah-olah Funder yang setor (Strategi Treasury Pool)
                    
                    // Konversi angka ke BigInt (Ethers butuh BigInt/String untuk angka besar)
                    // Karena decimals kita 0, 1 Rupiah = 1 Unit Token. Aman.
                    const amountInWei = ethers.BigNumber.from(payNow.toString()); 
                    // Note: Jika pakai ethers v6: ethers.parseUnits(payNow.toString(), 0)

                    // KIRIM TRANSAKSI!
                    const tx = await tokenContract.transfer(VAULT_ADDRESS, payNow.toString());
                    
                    console.log(`[BLOCKCHAIN] Tx Sent! Hash: ${tx.hash}`);
                    lastTxHash = tx.hash;

                    // (Opsional) Tunggu 1 blok konfirmasi agar aman
                    // await tx.wait(); 
                    
                    // Simpan Hash ke Database (Tabel Transactions) sebagai bukti
                    // Kita catat ini sebagai "Deposit"
                    const txId = generateId('depo');
                    await SQL.Query(`
                        INSERT INTO transactions 
                        (transaction_id, student_id, amount, type, blockchain_tx_hash, raw_description, transaction_date) 
                        VALUES (?, ?, ?, 'Income', ?, 'Deposit Beasiswa ke Vault', NOW())
                    `, [txId, fund.student_id, payNow, lastTxHash]);

                } catch (bcError) {
                    console.error("[BLOCKCHAIN CRITICAL ERROR]", bcError);
                    // Dalam production, kita harus stop proses disini. 
                    // Untuk hackathon, kita log error tapi lanjut update DB (Fallback).
                }

                // Update Collected
                const newCollected = currentCollected + payNow;
                totalMoneyReceived += payNow;

                // Tentukan Status Baru
                let newStatus = 'Partially_Funded'; // Default
                if (newCollected >= totalTarget) {
                    newStatus = 'Active'; // Lunas!
                }

                // Update Database
                await SQL.Query(
                    "UPDATE funding SET collected_amount = ?, status = ? WHERE funding_id = ?", 
                    [newCollected, newStatus, fund.funding_id]
                );

                // Notifikasi jika Lunas
                if (newStatus === 'Active') {
                    // Notif ke Student
                    await SQL.Query(
                        "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Dana Terkumpul! 💰', 'Selamat! Dana beasiswa kamu sudah penuh dan aktif.', 'Success')",
                        [fund.student_id]
                    );
                    // Notif ke Funder
                    await SQL.Query(
                        "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Beasiswa Aktif ✅', 'Dana telah dikunci. Smart Contract aktif.', 'Success')",
                        [fund.funder_id]
                    );

                    // [BARU] Cari Parent & Kirim Notif
                    const pRes = await SQL.Query("SELECT parent_id FROM accounts WHERE id=?", [fund.student_id]);
                    const parentId = pRes.data?.[0]?.parent_id;

                    if (parentId) {
                        await SQL.Query(
                            "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Beasiswa Aktif 🎉', 'Dana pendidikan anak Anda telah terkunci aman di Smart Contract.', 'Success')",
                            [parentId]
                        );
                    }
                }

                processedCount++;
            }

            return success(res, { 
                processed: processedCount, 
                total_received: totalMoneyReceived,
                tx_hash: blockchainTxHash,
                status_message: "Transfer Sukses & Tercatat di Blockchain"
            }, "Transfer Berhasil");

        } catch (e) {
            console.error(e);
            return error(res, "Gagal proses transfer");
        }
    },

    getBudgets: async (req, res) => {
        try {
            const user = req.currentUser;
            
            // 1. Ambil Plan Item
            const q = `SELECT * FROM budget_plan WHERE planner_id = ? AND month = MONTH(NOW()) AND year = YEAR(NOW())`;
            const items = await SQL.Query(q, [user.id]);

            // 2. Ambil Total Allocated (Total Drip + Vault bulan ini)
            // Asumsi: Ambil dari funding_allocation / 1 bulan
            // Untuk MVP, kita hitung sum dari plan items saja atau hardcode dari funding
            const totalAllocated = 6000000 / 6; // Simulasi (Total/6 bulan)

            // 3. Format Stuffs
            const stuffs = items.data.map(item => ({
                id: item.id,
                name: item.item_name,
                amount: Number(item.price),
                quantity: Number(item.quantity),
                status: item.status, // pending, approved, rejected
                feedback: item.ai_feedback,
                categoryId: item.category_id.toString()
            }));

            // Format Final
            const monthlyPlan = {
                month: new Date().toLocaleString('default', { month: 'long' }), // "November"
                year: new Date().getFullYear(),
                allocated: totalAllocated,
                stuffs: stuffs
            };

            return success(res, monthlyPlan);

        } catch (e) { return error(res, "Gagal budget"); }
    },

    // EXECUTION WEEKLY DRIP (Backend membagikan token dari Vault ke Student)
    // Dipanggil via tombol "Simulasi MInggu ke - X" oleh Admin
    // Ada notifikasi Funder Warning kalo sisa drip dah dikit
    // Sebagai trigger untuk analisis weekly report juga
    triggerWeeklyDrip: async (req, res) => {
        try {
            // 1. Cari Jadwal Drip Aktif
            const q = `
                SELECT 
                    f.funding_id, f.funder_id, f.student_id, a.wallet_address, a.displayname,
                    fa.allocation_id, fa.drip_amount, fa.remaining_drip_count, fa.category_id
                FROM funding_allocation fa
                JOIN funding f ON fa.funding_id = f.funding_id
                JOIN accounts a ON f.student_id = a.id
                WHERE f.status = 'Active' 
                AND fa.drip_frequency = 'Weekly' 
                AND fa.remaining_drip_count > 0
            `;
            
            const drips = await SQL.Query(q);
            if (drips.data.length === 0) return success(res, { processed: 0 }, "Tidak ada jadwal drip minggu ini");

            let successCount = 0;

            // 2. Loop Eksekusi per Student
            for (const item of drips.data) {
                const amount = Math.floor(Number(item.drip_amount));
                if (amount <= 0) continue;

                try {
                    console.log(`[DRIP] Processing ${item.displayname}...`);

                    // --- A. BLOCKCHAIN TRANSFER ---
                    // (Gunakan wallet Vault)
                    // const tokenVault = new ethers.Contract(process.env.TOKEN_CONTRACT_ADDRESS, tokenAbi, vaultWallet);
                    // const tx = await tokenVault.transfer(item.wallet_address, amount.toString());
                    
                    // Simulasi Hash untuk demo jika blockchain off
                    const txHash = "0x_simulated_drip_" + Date.now(); 

                    // --- B. DATABASE UPDATE (Saldo & History) ---
                    await SQL.Query("UPDATE funding_allocation SET remaining_drip_count = remaining_drip_count - 1 WHERE allocation_id = ?", [item.allocation_id]);
                    await SQL.Query("UPDATE accounts_student SET balance = balance + ? WHERE id = ?", [amount, item.student_id]);
                    
                    const txId = generateId('drip');
                    await SQL.Query(`
                        INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description, blockchain_tx_hash, transaction_date)
                        VALUES (?, ?, ?, 'Drip_In', ?, 'Pencairan Mingguan', ?, NOW())
                    `, [txId, item.student_id, amount, item.category_id, txHash]);

                    // ============================================================
                    // 🔥 UPDATE: PROACTIVE REPORT (SAVE TO DB) 🔥
                    // ============================================================
                    
                    // 1. Hitung Pengeluaran Minggu Lalu
                    const expenseQ = `
                        SELECT SUM(amount) as total_spent 
                        FROM transactions 
                        WHERE student_id = ? 
                        AND type = 'Expense' 
                        AND transaction_date >= DATE(NOW()) - INTERVAL 7 DAY
                    `;
                    const expRes = await SQL.Query(expenseQ, [item.student_id]);
                    const lastWeekSpent = Number(expRes.data?.[0]?.total_spent || 0);
                    
                    // 2. Analisa AI
                    const limit = Number(item.drip_amount);
                    const ratio = lastWeekSpent / limit;
                    const sisaSaldo = limit - lastWeekSpent;

                    let healthStatus = 'Good';
                    let reportBody = `Hai ${item.displayname}! Minggu ini kamu mencatat pengeluaran Rp ${lastWeekSpent.toLocaleString('id-ID')} dari target Rp ${limit.toLocaleString('id-ID')}.\n\n`;

                    if (ratio < 0.5) {
                        healthStatus = 'Excellent';
                        reportBody += `✅ Hebat: Kamu hemat sekali! Masih sisa banyak (Rp ${sisaSaldo.toLocaleString('id-ID')}). Tabung sisanya ya!\n`;
                    } else if (ratio <= 1.0) {
                        healthStatus = 'Good';
                        reportBody += `✅ Bagus: Pengeluaranmu pas sesuai budget. Pertahankan disiplin ini.\n`;
                    } else {
                        healthStatus = 'Warning';
                        reportBody += `⚠️ Perhatian: Kamu boros minggu lalu (Over budget). Coba kurangi jajan minggu ini.\n`;
                    }

                    reportBody += `\nDana baru Rp ${limit.toLocaleString('id-ID')} sudah cair. Semangat!`;

                    // 3. SIMPAN KE TABEL REPORT (Bukan Notifikasi)
                    await SQL.Query(
                        "INSERT INTO weekly_reports (student_id, total_spent, budget_limit, health_status, ai_message, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
                        [item.student_id, lastWeekSpent, limit, healthStatus, reportBody]
                    );

                    // 4. Kirim Notifikasi PENDEK saja (Pancingan)
                    await SQL.Query(
                        "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Rapor Mingguan Siap 📊', 'Evaluasi keuanganmu minggu ini sudah terbit. Cek Dashboard sekarang!', 'Info')",
                        [item.student_id]
                    );
                    // ============================================================

                    // --- C. CEK SALDO FUNDER (Warning Logic) ---
                    const sisaMinggu = Number(item.remaining_drip_count) - 1;
                    if (sisaMinggu <= 2) {
                        await SQL.Query(
                            "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Saldo Menipis 📉', 'Sisa dana beasiswa tinggal 2 minggu. Mohon siapkan top-up.', 'Urgent')",
                            [item.funder_id]
                        );
                    }

                    successCount++;

                } catch (bcError) {
                    console.error(`[DRIP ERROR] Gagal ke ${item.student_id}:`, bcError);
                }
            }

            return success(res, { processed: successCount }, "Weekly Drip & Report Selesai");

        } catch (e) { 
            console.error(e);
            return error(res, "Gagal memproses drip"); 
        }
    },

    // EXECUTION URGENT FUND (Readjustment Logic)
    requestUrgent: async (req, res) => {
        try {
            const { amount, reason, proof_image_url } = req.body;

            // 1. Validasi User & Data
            const user = req.currentUser;
            if (!user) return error(res, "User not found", 404);

            // 2. MOCK AI VALIDATION
            // Cek apakah alasan mengandung kata kunci darurat (sakit, kecelakaan, buku, dll)
            // Dan wajib ada gambar
            if (!proof_image_url) return error(res, "Bukti foto wajib diupload!", 400);
            
            const validKeywords = ['sakit', 'obat', 'rumah sakit', 'kecelakaan', 'hilang', 'rusak', 'darurat'];
            const isReasonValid = validKeywords.some(word => reason.toLowerCase().includes(word));
            
            if (!isReasonValid) {
                return error(res, "AI menolak: Alasan tidak terdeteksi sebagai keadaan darurat. Gunakan dana Wants.", 403);
            }

            // 3. HITUNG READJUSTMENT (Matematika Potong Gaji)
            // Ambil data Wants (Category 0) untuk dipotong
            const allocQuery = `
                SELECT fa.allocation_id, fa.drip_amount, fa.remaining_drip_count 
                FROM funding_allocation fa
                JOIN funding f ON fa.funding_id = f.funding_id
                WHERE f.student_id = ? AND fa.category_id = 0 AND f.status = 'Active'
            `;
            const allocRes = await SQL.Query(allocQuery, [user.id]);
            const alloc = allocRes.data?.[0];

            if (!alloc || alloc.remaining_drip_count <= 0) {
                return error(res, "Tidak ada sisa budget 'Wants' masa depan untuk dipotong.", 400);
            }

            const reqAmount = Number(amount);
            const sisaMinggu = Number(alloc.remaining_drip_count);
            
            // Cek limit (Max bisa ambil semua sisa Wants masa depan)
            const maxAvailable = Number(alloc.drip_amount) * sisaMinggu;
            if (reqAmount > maxAvailable) {
                return error(res, `Dana tidak cukup. Maksimal pinjaman dari pos Wants: Rp ${maxAvailable}`, 400);
            }

            // Hitung potongan per minggu
            const deductionPerWeek = Math.ceil(reqAmount / sisaMinggu);
            const newDripAmount = Number(alloc.drip_amount) - deductionPerWeek;

            // 4. EKSEKUSI DATABASE & BLOCKCHAIN
            
            // A. Update Drip Amount Masa Depan (PENGURANGAN)
            await SQL.Query("UPDATE funding_allocation SET drip_amount = ? WHERE allocation_id = ?", [newDripAmount, alloc.allocation_id]);

            // B. Transfer Token Sekarang (Urgent)
            const tx = await tokenContract.transfer(user.wallet_address, reqAmount.toString());

            // C. Catat Transaksi
            await SQL.Query(`
                INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description, is_urgent_withdrawal, urgency_reason, proof_image_url, blockchain_tx_hash, transaction_date)
                VALUES (?, ?, ?, 'Drip_In', 1, 'Dana Darurat (Advance)', TRUE, ?, ?, ?, NOW())
            `, [generateId('urgent'), user.id, reqAmount, reason, proof_image_url, tx.hash]);

            // D. Update Saldo Student Lokal
            await SQL.Query("UPDATE accounts_student SET balance = balance + ? WHERE id = ?", [reqAmount, user.id]);

            // [BARU] Notif Bahaya ke Parent
            if (user.parent_id) {
                const msgParent = `Anak Anda (${user.displayname}) baru saja menarik Dana Darurat Rp ${Number(amount).toLocaleString()} dengan alasan: "${reason}".`;
                
                await SQL.Query(
                    "INSERT INTO notifications (user_id, title, message, type) VALUES (?, '⚠️ Penarikan Darurat', ?, 'Urgent')",
                    [user.parent_id, msgParent]
                );
            }

            return success(res, {
                received: reqAmount,
                deduction_per_week: deductionPerWeek,
                remaining_wants_drip: newDripAmount,
                tx_hash: tx.hash
            }, "Dana Darurat Cair. Budget mingguan telah disesuaikan.");

        } catch (e) { return error(res, "Gagal request urgent"); }
    },

    // Execution Education Fund 
    // Pre Approval (VDC)
    requestEduPreApproval: async (req, res) => {
        try {
            // [FIX] Ambil User dari Session Middleware
            const user = req.currentUser; 
            
            // Kita tidak butuh wallet_address dari body lagi
            const { amount, url_item, vendor_info } = req.body;
            
            // Validasi Input
            if (!url_item || !amount) return error(res, "Data request tidak lengkap", 400);

            // Mock AI Logic: Cek apakah URL valid
            if (!url_item.includes('http')) return error(res, "URL Item tidak valid", 400);

            // [FEATURE] Custom VDC Name
            // Karena kita tau siapa usernya, kita bisa cetak nama dia di kartu!
            const cardHolder = user.displayname ? user.displayname.toUpperCase() : "FINFLOW STUDENT";

            // Generate Mock VDC
            const vdcData = {
                card_number: "4000 1234 " + Math.floor(1000 + Math.random() * 9000) + " " + Math.floor(1000 + Math.random() * 9000),
                cvv: Math.floor(100 + Math.random() * 900),
                expiry: "12/28",
                holder_name: cardHolder, // <--- Nama Asli Student
                limit: Number(amount),
                status: "ACTIVE_ONE_TIME"
            };

            // (Opsional) Simpan log request pre-approval ke DB jika perlu audit trail
            // await SQL.Query("INSERT INTO edu_requests ...")

            return success(res, vdcData, "Pre-Approval Disetujui AI. Silakan gunakan VDC ini.");

        } catch (e) {
            console.error(e);
            return error(res, "Gagal pre-approval");
        }
    },

    // POST-APPROVAL (Reimburse / Real Transfer)
    requestEduReimburse: async (req, res) => {
        try {
            const { amount, description, proof_image_url } = req.body;

            // Validasi User
            const user = req.currentUser;
            if (!user) return error(res, "User not found", 404);

            // Cek Saldo Vault (Category 2 = Education)
            const vaultQ = `
                SELECT fa.allocation_id, fa.total_allocation, fa.total_withdrawn 
                FROM funding_allocation fa
                JOIN funding f ON fa.funding_id = f.funding_id
                WHERE f.student_id = ? AND fa.category_id = 2 AND f.status = 'Active'
            `;
            const vault = (await SQL.Query(vaultQ, [user.id])).data?.[0];
            
            if (!vault) return error(res, "Tidak ada dana pendidikan aktif", 400);
            if ((Number(vault.total_allocation) - Number(vault.total_withdrawn)) < amount) {
                return error(res, "Saldo pendidikan tidak cukup", 400);
            }

            // AI SCAN STRUK (MOCK)
            if (!proof_image_url) return error(res, "Bukti struk wajib!", 400);

            // BLOCKCHAIN TRANSFER
            const tx = await tokenContract.transfer(user.wallet_address, amount.toString());

            // UPDATE DATABASE
            await SQL.Query("UPDATE funding_allocation SET total_withdrawn = total_withdrawn + ? WHERE allocation_id = ?", [amount, vault.allocation_id]);
            
            // CATAT TRANSAKSI
            await SQL.Query(`
                INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description, proof_image_url, is_verified_by_ai, blockchain_tx_hash, transaction_date)
                VALUES (?, ?, ?, 'Expense', 2, ?, ?, TRUE, ?, NOW())
            `, [generateId('edu'), user.id, amount, description, proof_image_url, tx.hash]);

            // UPDATE SALDO STUDENT (Karena reimburse = uang masuk ke rekening pribadi mengganti uang talangan)
            await SQL.Query("UPDATE accounts_student SET balance = balance + ? WHERE id = ?", [amount, user.id]);

            // [FIX] Menggunakan Template Literal (Backticks) + Format Rupiah
            const formattedAmount = Number(amount).toLocaleString('id-ID'); // Biar jadi "150.000"
            const notifMessage = `Dana pendidikan sebesar Rp ${formattedAmount} telah dicairkan ke rekening Anda.`;

            await SQL.Query(
                "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Reimburse Sukses 📚', ?, 'Success')",
                [user.id, notifMessage] 
            );

            return success(res, { tx_hash: tx.hash }, "Reimburse Disetujui & Ditransfer");

        } catch (e) { return error(res, "Gagal reimburse"); }
    },


    // EXECUTION WITHDRAWAL (Student menukar Token jadi Rupiah)
    // Frontend mengirim Hash bukti transfer token dari Student -> Admin
    requestWithdraw: async (req, res) => {
        try {
            const { amount, tx_hash } = req.body;

            // 1. Validasi User
            const user = req.currentUser;
            if (!user) return error(res, "User not found", 404);

            console.log(`[WITHDRAW] Menerima klaim hash: ${tx_hash} sebesar Rp ${amount}`);

            // 2. Update Database
            // Kurangi saldo virtual (karena token sudah dikirim keluar)
            await SQL.Query("UPDATE accounts_student SET balance = balance - ? WHERE id = ?", [amount, user.id]);

            // Catat Transaksi
            const txId = generateId('wd');
            await SQL.Query(`
                INSERT INTO transactions (transaction_id, student_id, amount, type, raw_description, blockchain_tx_hash, transaction_date)
                VALUES (?, ?, ?, 'Expense', 'Penarikan ke Bank ${user.bank_name}', ?, NOW())
            `, [txId, user.id, amount, tx_hash]);

            // 3. Notifikasi
            await SQL.Query(
                "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Penarikan Berhasil 🏦', 'Dana sedang diproses ke rekening bank Anda.', 'Info')",
                [user.id]
            );

            return success(res, { 
                status: "Success", 
                bank_dest: `${user.bank_name} - ${user.bank_account_number}`
            }, "Penarikan diproses.");

        } catch (e) { return error(res, "Gagal withdraw"); }
    },


    // Funder Monitoring (Dashboard Funder/Parent)
    // Input: wallet_address (Funder), student_id (Target Anak)
    getFunderMonitoring: async (req, res) => {
        try {
            const { student_id } = req.query;
            
            if (req.currentUser.wallet_address || !student_id) return error(res, "Wallet dan Student ID wajib diisi", 400);

            // 1. IDENTIFIKASI VIEWER (Siapa yang sedang login?)
            const viewer = req.currentUser;
            if (!viewer) return error(res, "Akun viewer tidak ditemukan", 404);

            // 2. IDENTIFIKASI STUDENT (Siapa targetnya?)
            const sRes = await SQL.Query("SELECT id, parent_id FROM accounts WHERE id=?", [student_id]);
            const student = sRes.data?.[0];
            if (!student) return error(res, "Student target tidak ditemukan", 404);

            // 3. AMBIL DATA FUNDING (Beasiswa Aktif)
            const fRes = await SQL.Query("SELECT * FROM funding WHERE student_id=? AND status='Active'", [student_id]);
            const funding = fRes.data?.[0];

            if (!funding) return error(res, "Belum ada beasiswa aktif untuk student ini", 404);

            // 4. CEK HAK AKSES (AUTHORIZATION CHECK)
            // Apakah Viewer adalah Funder?
            const isFunder = (funding.funder_id === viewer.id);
            
            // Apakah Viewer adalah Parent?
            const isParent = (student.parent_id === viewer.id);

            // Jika bukan keduanya, TENDANG!
            if (!isFunder && !isParent) {
                return error(res, "Akses Ditolak! Anda bukan Funder maupun Orang Tua dari mahasiswa ini.", 403);
            }

            // -------------------------------------------------------
            // JIKA LOLOS, LANJUT AMBIL DATA STATISTIK
            // -------------------------------------------------------

            // A. Data Drip (Uang Saku Cair)
            const dripTotalRes = await SQL.Query(`
                SELECT SUM(amount) as total_drip 
                FROM transactions 
                WHERE student_id = ? AND type = 'Drip_In'
            `, [student_id]);
            const totalDripSent = Number(dripTotalRes.data?.[0]?.total_drip || 0);

            // B. Data Edukasi (Total Terpakai dari Vault)
            const eduRes = await SQL.Query(`
                SELECT SUM(amount) as total_edu
                FROM transactions 
                WHERE student_id = ? AND category_id = 2 AND type = 'Expense'
            `, [student_id]);
            const totalEduUsed = Number(eduRes.data?.[0]?.total_edu || 0);

            // C. Analisa Kesehatan Keuangan (Logic Sederhana)
            const urgentCountRes = await SQL.Query(`
                SELECT COUNT(*) as count FROM transactions 
                WHERE student_id = ? AND is_urgent_withdrawal = 1
            `, [student_id]);
            const urgentCount = Number(urgentCountRes.data?.[0]?.count || 0);

            let healthStatus = "Sehat ✅";
            let healthDesc = "Penggunaan dana wajar sesuai rencana.";
            
            if (urgentCount > 0) {
                healthStatus = "Perhatian ⚠️";
                healthDesc = `Student telah melakukan ${urgentCount}x penarikan darurat. Mohon dicek.`;
            }

            // D. Log Transaksi (Hanya Edu & Urgent demi Privasi)
            const logQuery = `
                SELECT transaction_date, amount, type, category_id, raw_description, is_urgent_withdrawal, is_verified_by_ai, proof_image_url, blockchain_tx_hash
                FROM transactions 
                WHERE student_id = ? 
                AND (category_id = 2 OR is_urgent_withdrawal = 1) 
                ORDER BY transaction_date DESC
            `;
            const logs = await SQL.Query(logQuery, [student_id]);

            const formattedLogs = logs.data.map(tx => ({
                date: new Date(tx.transaction_date).toISOString().split('T')[0],
                type: tx.is_urgent_withdrawal ? "DARURAT" : "EDUCATION",
                nominal: tx.amount,
                status: "Sukses",
                ai_audit: tx.is_urgent_withdrawal ? "Valid: Alasan Darurat" : "Valid: Barang Edukasi",
                proof_url: tx.proof_image_url || "#",
                tx_hash: tx.blockchain_tx_hash || "#"
            }));

            // E. Pesan Khusus untuk Viewer
            const roleName = isFunder ? "Pemberi Beasiswa" : "Orang Tua";
            const welcomeMsg = `${roleName}, dari total dana Rp ${Number(funding.total_period_fund).toLocaleString()} sejauh ini:`;

            // F. Response JSON Final
            return success(res, {
                viewer_role: isFunder ? 'funder' : 'parent',
                message_header: welcomeMsg,
                summary: {
                    total_fund: Number(funding.total_period_fund),
                    disbursed_drip: totalDripSent,
                    used_education: totalEduUsed,
                    // Sisa = Total - (Yang sudah di-drip + Yang sudah dipakai beli barang)
                    remaining_fund: Number(funding.total_period_fund) - totalDripSent - totalEduUsed, 
                    health_status: healthStatus,
                    health_desc: healthDesc
                },
                logs: formattedLogs
            }, "Data Monitoring Siap");

        } catch (e) {
            console.error("Monitoring Error:", e);
            return error(res, "Gagal memuat data monitoring");
        }
    },

    // ============================================================
    // MODULE 4: TRANSACTIONS (Action & Vision)
    // Mencatat Pengeluaran, Menyimpan URL foto struk (untuk fitur AI Vision)
    // Mengurangi saldo balance user secara otomatis
    // ============================================================

    // A. SMART SCAN (OCR Service) - Auto fill Form
    // Frontend memanggil ini saat user upload foto di menu "Catat Pengeluaran"
    // ============================================================
    // MODULE 4: OCR SCAN (BUFFER / MULTIPART VERSION)
    // ============================================================
    scanReceipt: async (req, res) => {
        let tempFile = null;
        try {
            // 1. Cek apakah file ada di req.files?
            if (!req.files || !req.files.receipt_image) {
                return error(res, "No file uploaded", 400);
            }

            const uploadedFile = req.files.receipt_image;

            // 2. Simpan Buffer ke Temp (Helper ini harus ada di file yang sama)
            console.log("[OCR] Processing uploaded file...");
            tempFile = saveBufferToTemp(uploadedFile.data, uploadedFile.mimetype);
            
            // 3. Siapkan Prompt Khusus OCR
            const prompt = `
                ROLE: High-Precision OCR Machine.
                TASK: Analyze receipt image.
                
                OUTPUT JSON STRUCTURE:
                {
                    "merchant": "Store Name",
                    "date": "YYYY-MM-DD",
                    "time": "HH:MM" (Transaction time in 24h format e.g. 14:30. If not found, return null),
                    "items": [
                        {
                            "name": "Item Name",
                            "price": Number (Individual price * qty),
                            "category_id": Number (Guess: 1=Needs, 0=Wants, 2=Education)
                        }
                    ]
                }
                Return ONLY raw JSON.
            `;

            // 4. Panggil Modul Gemini Teman Anda
            // Parameter: (Prompt, IndexModel, History, FileObject)
            // Index 2 biasanya model Flash (Cepat). Pastikan settings.json teman Anda punya model Flash di index 2.
            const response = await GeminiModule.Chat.Send(prompt, 2, [], tempFile);

            // 5. Hapus File Temp
            try { fs.unlinkSync(tempFile.path); } catch(e){}

            // 6. Parse Hasil JSON dari AI
            let resultData = {};
            try {
                const cleanText = response.text.replace(/```json|```/g, '').trim();
                resultData = JSON.parse(cleanText);
            } catch (parseError) {
                // Fallback jika AI mengoceh teks biasa
                resultData = { raw_text: response.text, merchant: "Manual Check Needed", amount: 0 };
            }

            return success(res, resultData, "Scan Berhasil");

        } catch (e) {
            if(tempFile) try { fs.unlinkSync(tempFile.path); } catch(err){}
            console.error(e);
            return error(res, "Gagal scan receipt");
        }
    },

    // B. SAVE TRANSACTION (Simpan ke Database)
    // Dipanggil setelah user review hasil scan, atau input manual
    // Ada logic cek untuk pola berbahaya
    addTransaction: async (req, res) => {
        try {
            const user = req.currentUser; 
            const { amount, category_id, description, merchant_name, transaction_date, proof_image_url } = req.body;

            // [FIX 1] VALIDASI ANGKA KETAT
            // Pastikan amount benar-benar angka valid
            let expenseAmount = parseInt(amount);
            if (isNaN(expenseAmount) || expenseAmount <= 0) {
                return error(res, "Nominal transaksi tidak valid", 400);
            }

            // [FIX 2] FORMAT TANGGAL MYSQL (YYYY-MM-DD HH:MM:SS)
            // Mengubah '2025-11-27T06:52:00.000Z' menjadi '2025-11-27 06:52:00'
            let finalDate;
            try {
                const d = transaction_date ? new Date(transaction_date) : new Date();
                // Trik konversi ISO ke MySQL format:
                finalDate = d.toISOString().slice(0, 19).replace('T', ' ');
            } catch (e) {
                // Fallback jika tanggal error
                finalDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
            }

            // 1. Ambil Saldo Terbaru
            const balanceRes = await SQL.Query("SELECT balance FROM accounts_student WHERE id = ?", [user.id]);
            
            if (!balanceRes.data || balanceRes.data.length === 0) {
                return error(res, "Akun student belum diinisialisasi (Hubungi Admin)", 404);
            }

            const currentBalance = Number(balanceRes.data[0].balance); // Pastikan jadi Number

            // Validasi Kecukupan Saldo
            if (currentBalance < expenseAmount) {
                return error(res, `Saldo tidak mencukupi! (Sisa: ${currentBalance.toLocaleString()})`, 400);
            }

            // 2. Simpan Transaksi
            const txId = generateId('tx');
            
            const qInsert = `
                INSERT INTO transactions 
                (transaction_id, student_id, amount, type, category_id, merchant_name, raw_description, proof_image_url, is_verified_by_ai, transaction_date) 
                VALUES (?, ?, ?, 'Expense', ?, ?, ?, ?, FALSE, ?)
            `;
            
            await SQL.Query(qInsert, [
                txId, 
                user.id, 
                expenseAmount, 
                category_id, 
                merchant_name || '', 
                description, 
                proof_image_url || null, 
                finalDate // <--- Tanggal yang sudah bersih
            ]);

            // 3. Update Saldo (Hitung Matematika)
            const newBalance = currentBalance - expenseAmount;
            
            // [SAFETY CHECK] Pastikan hasil pengurangan valid sebelum update DB
            if (isNaN(newBalance)) {
                throw new Error("Calculation Error: Result is NaN");
            }

            await SQL.Query("UPDATE accounts_student SET balance = ? WHERE id = ?", [newBalance, user.id]);
            // ============================================================
            // 🔥 AI COACH QUICK SCAN (LOGIC PENDETEKSI BAHAYA) 🔥 - GANTI PAKE GEMINI
            // ============================================================
            
            // A. Ambil Data Pendukung (Budget Mingguan & Sisa Hari)
            const today = new Date();
            const dayOfWeek = today.getDay(); // 0=Minggu, 1=Senin
            const daysUntilDrip = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7;
            
            // Ambil total jatah drip mingguan (Needs + Wants) dari tabel allocation
            const allocQ = `
                SELECT SUM(drip_amount) as weekly_limit 
                FROM funding_allocation fa 
                JOIN funding f ON fa.funding_id = f.funding_id
                WHERE f.student_id = ? AND f.status = 'Active' AND fa.drip_frequency = 'Weekly'
            `;
            const allocRes = await SQL.Query(allocQ, [user.id]);
            const weeklyLimit = Number(allocRes.data?.[0]?.weekly_limit || 0);

            if (weeklyLimit > 0) {
                let warningTitle = "";
                let warningMsg = "";
                
                // RULE 1: Transaksi Jumbo (>30% Budget Mingguan)
                if (expenseAmount > (weeklyLimit * 0.3)) {
                    warningTitle = "⚠️ Pembelian Besar Terdeteksi";
                    warningMsg = `Waduh, kamu baru saja menghabiskan 30% jatah mingguanmu untuk satu barang. Pastikan sisa ${daysUntilDrip} hari kedepan aman ya!`;
                }

                // RULE 2: Boros di Awal Minggu (>50% habis di 3 hari pertama)
                // Asumsi Senin=1, Selasa=2, Rabu=3. Jika hari ini <= Rabu DAN Saldo < 50%
                // Kita cek sisa saldo vs limit.
                // Sisa saldo < 50% limit mingguan? (Asumsi saldo utamanya berasal dari drip)
                else if (dayOfWeek >= 1 && dayOfWeek <= 3 && newBalance < (weeklyLimit * 0.5)) {
                    warningTitle = "⚠️ Rem Sedikit!";
                    warningMsg = "Baru awal minggu tapi uangmu sudah sisa setengah. Tahan jajan dulu sampai weekend!";
                }

                // RULE 3: Survival Mode (Sisa uang < Biaya Makan Minimum)
                const minMakan = 15000 * daysUntilDrip;
                if (newBalance < minMakan) {
                    warningTitle = "🚨 BAHAYA KELAPARAN";
                    warningMsg = `Sisa uangmu (Rp ${newBalance}) kurang dari estimasi makan (Rp ${minMakan}). STOP JAJAN SEKARANG. Fokus beli nasi saja.`;
                }

                // Jika ada warning, Simpan ke Notifikasi
                if (warningTitle !== "") {
                    await SQL.Query(
                        "INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'Warning')",
                        [user.id, warningTitle, warningMsg]
                    );
                }
            }
            // ============================================================

            return success(res, { tx_id: txId, new_balance: newBalance }, "Transaksi Tersimpan");

        } catch (e) {
            console.error(e);
            return error(res, "Gagal menyimpan transaksi " + e.message);
        }
    },

    // ============================================================
    // MODULE 6: INSIGHTS & VISUALIZATION (Dashboard Data)
    // ============================================================
    getTransactionYears: async (req, res) => {
        try {
            const user = req.currentUser;

            // Query untuk mengambil tahun-tahun unik dari history transaksi
            const q = `
                SELECT DISTINCT YEAR(transaction_date) as year 
                FROM transactions 
                WHERE student_id = ? 
                ORDER BY year DESC
            `;
            
            const result = await SQL.Query(q, [user.id]);

            // Mapping hasil DB [{year: 2025}, {year: 2024}] menjadi [2025, 2024]
            let years = result.data.map(row => row.year);

            // Fallback: Jika belum ada transaksi, minimal kembalikan tahun sekarang
            if (years.length === 0) {
                years = [new Date().getFullYear()];
            }

            // Return Array langsung (sesuai ekspektasi frontend Anda)
            return res.json(years);

        } catch (e) {
            console.error(e);
            // Return tahun ini sebagai safety net
            return res.json([new Date().getFullYear()]);
        }
    },
    
    getInsights: async (req, res) => {
        try {
            if (!req.currentUser.wallet_address) return error(res, "Wallet address required", 400);

            // Validasi User: Memastikan wallet terdaftar
            const user = req.currentUser;
            if (!user) return error(res, "User not found", 404);

            // Ambil data Statistik secara Paralel
            // Menggnakan Promise.all karena query query ini tidak saling tunggu
            const [balanceData, spendingData, trendData, historyData] = await Promise.all([
                _getBalanceInfo(user.id),       // Saldo & Sisa Hari
                _getSpendingBreakdown(user.id), // Data Pie Chart
                _getWeeklyTrend(user.id),       // Data Bar Chart
                _getTransactionHistory(user.id) // Data List
            ]);

            // Jalankan Logika AI (Pure Logic, no DB)
            const aiAnalysis = _analyzeHealth(balanceData.current_balance, balanceData.days_until_drip);

            // Susun Response
            return success(res, {
                summary: {
                    balance: balanceData.current_balance,
                    days_until_drip: balanceData.days_until_drip,
                    health_indicator: aiAnalysis.status // 'green' / 'yellow' / 'red'
                },
                charts: {
                    pie: spendingData, 
                    bar: trendData 
                },
                ai_coach: {
                    message: aiAnalysis.message
                },
                history: historyData
            }, "Data Insight Siap");

        } catch (e) {
            console.error("[INSIGHT ERROR]", e);
            return error(res, "Gagal memuat insight");
        }
    },

    // Fetch Weekly Report Untuk Card Dashboard
    getWeeklyReport: async (req, res) => {
        try {        
            const user = req.currentUser;
            if (!user) return error(res, "User not found", 404);

            // Ambil Laporan TERBARU (Paling akhir dibuat)
            const q = `
                SELECT * FROM weekly_reports 
                WHERE student_id = ? 
                ORDER BY created_at DESC 
                LIMIT 1
            `;
            const report = await SQL.Query(q, [user.id]);

            if (report.data.length === 0) {
                return success(res, null, "Belum ada laporan mingguan.");
            }

            return success(res, report.data[0], "Laporan dimuat");

        } catch (e) { return error(res, "Gagal ambil laporan"); }
    },

    getTransactionHistory: async (req, res) => {
        try {
            const user = req.currentUser;
            const { month, year } = req.query;

            let q = `
                SELECT 
                    transaction_id, raw_description, amount, transaction_date, 
                    category_id, type, proof_image_url, 
                    is_verified_by_ai, is_urgent_withdrawal, urgency_reason
                FROM transactions 
                WHERE student_id = ?
            `;
            const params = [user.id];

            if (month && year) {
                q += ` AND MONTH(transaction_date) = ? AND YEAR(transaction_date) = ?`;
                const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
                const monthNum = isNaN(month) ? monthMap[month.toLowerCase()] : month;
                params.push(monthNum, year);
            }

            q += ` ORDER BY transaction_date DESC`;
            const history = await SQL.Query(q, params);
            
            // [CLEAN MAPPING] DB (Snake) -> JSON (Camel)
            const formattedData = history.data.map(tx => {
                // Normalisasi Tipe
                let typeJs = 'expense';
                if (tx.type === 'Income') typeJs = 'income';
                if (tx.type === 'Drip_In') typeJs = 'dripIn'; 

                return {
                    id: tx.transaction_id,
                    // Ubah ke UNIX Timestamp (Angka) sesuai request dummy
                    transactionDate: new Date(tx.transaction_date).getTime(), 
                    type: typeJs,
                    rawDescription: tx.raw_description,
                    isVerifiedByAI: Boolean(tx.is_verified_by_ai),
                    isUrgentWithdrawal: Boolean(tx.is_urgent_withdrawal),
                    urgencyReason: tx.urgency_reason,
                    amount: Number(tx.amount),
                    categoryId: tx.category_id ? tx.category_id.toString() : null
                };
            });

            return success(res, formattedData);

        } catch (e) { return error(res, "Gagal load history"); }
    },

    getWalletData: async (req, res) => {
        try {
            const user = req.currentUser;
            
            // 1. Ambil Saldo Total (Uang Fisik di Akun)
            const bRes = await SQL.Query("SELECT balance FROM accounts_student WHERE id=?", [user.id]);
            const totalBalance = Number(bRes.data?.[0]?.balance || 0);

            // 2. Hitung Arus Kas per Kategori (Cashflow Calculation)
            // Rumus: Total Masuk (Drip) - Total Keluar (Expense) = Sisa Uang di Tangan
            const qFlow = `
                SELECT 
                    category_id, 
                    SUM(CASE WHEN type = 'Drip_In' OR type = 'Income' THEN amount ELSE 0 END) as total_in,
                    SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END) as total_out
                FROM transactions 
                WHERE student_id = ?
                GROUP BY category_id
            `;
            
            const flowData = await SQL.Query(qFlow, [user.id]);

            // 3. Mapping Data
            const flowMap = {};
            flowData.data.forEach(row => {
                // Hitung Net Balance (Sisa Amplop)
                const net = Number(row.total_in) - Number(row.total_out);
                // Pastikan tidak negatif (opsional, tapi aman untuk UI)
                flowMap[row.category_id] = Math.max(0, net);
            });

            // 4. Struktur Kategori Default
            // Kita gabungkan dengan nama kategori master
            const defaultCats = [
                { id: 0, name: "Wants" },
                { id: 1, name: "Needs" },
                { id: 2, name: "Education" }
            ];

            const allocations = defaultCats.map(cat => ({
                categoryId: cat.id.toString(),
                categoryName: cat.name,
                // Ambil sisa uang dari map, atau 0 jika belum ada transaksi
                balance: flowMap[cat.id] || 0 
            }));

            // [NOTE] Khusus Education: 
            // Karena Edu dananya di Vault (bukan di wallet student), biasanya balancenya 0 atau minus (reimburse).
            // Tapi jika ada sisa 'Drip_In' yang dialokasikan ke Edu, akan muncul disini.

            return success(res, {
                balance: totalBalance, // Saldo Total semua amplop
                allocations: allocations // Rincian isi per amplop
            });

        } catch (e) { 
            console.error(e);
            return res.status(500).json({ success: false, message: "Gagal hitung cashflow" }); 
        }
    },

    // API Categories List (Sesuai DUMMY_CATEGORIES)
    getCategories: async (req, res) => {
        // Hardcode sesuai dummy agar cepat
        return success(res, [
            { id: "0", name: "Wants", balance: 0 }, // Balance dummy 0 untuk list dropdown
            { id: "1", name: "Needs", balance: 0 },
            { id: "2", name: "Education", balance: 0 }
        ]);
    },

    getExpensesData: async (req, res) => {
        try {
            const user = req.currentUser;
            
            // [FIX] Gunakan YEARWEEK(date, 1) agar Senin dianggap awal minggu
            const q = `
                SELECT DAYOFWEEK(transaction_date) as day_idx, SUM(amount) as total
                FROM transactions
                WHERE student_id = ? 
                AND type = 'Expense' 
                AND YEARWEEK(transaction_date, 1) = YEARWEEK(NOW(), 1)
                GROUP BY DAYOFWEEK(transaction_date)
            `;
            const dbData = await SQL.Query(q, [user.id]);
            
            // Mapping ke Array (Senin=0 di UI Anda, Minggu=6)
            // Logic dummy: summary: [senin, selasa, ..., minggu]
            let summary = [0, 0, 0, 0, 0, 0, 0]; 
            let total = 0;

            dbData.data.forEach(row => {
                // MySQL: 1=Minggu, 2=Senin. UI: 0=Senin.
                let jsIndex = row.day_idx === 1 ? 6 : row.day_idx - 2;
                summary[jsIndex] = Number(row.total);
                total += Number(row.total);
            });

            return success(res, {
                total: total,
                summary: summary
            });

        } catch (e) { return error(res, "Gagal expenses"); }
    },

    getFeedbackData: async (req, res) => {
        try {
            const user = req.currentUser;
            
            // 1. Ambil Data Konteks (Saldo, Waktu, dan Breakdown Pengeluaran)
            // Kita butuh data ini agar AI tidak halusinasi
            const [balanceInfo, spendingData] = await Promise.all([
                _getBalanceInfo(user.id),       
                _getSpendingBreakdown(user.id)  
            ]);

            // 2. SIAPKAN PROMPT AI
            const prompt = `
                ROLE: Financial Coach for a student named ${user.displayname}.
                CONTEXT:
                - Current Balance: IDR ${balanceInfo.current_balance.toLocaleString()}
                - Days until next allowance: ${balanceInfo.days_until_drip} days
                - Spending Breakdown this week: ${JSON.stringify(spendingData)}
                
                TASK:
                Analyze their financial health. 
                - If balance is low (< 30k * days_left), set severity 'danger'.
                - If spending on 'Wants' is high, scold them gently.
                - If healthy, praise them.
                
                OUTPUT JSON ONLY:
                {
                    "severity": "normal" | "caution" | "danger",
                    "content": "Your short advice here (max 20 words, use emoji)"
                }
            `;

            // 3. PANGGIL GEMINI (Mode: AUDITOR)
            // Menggunakan helper askGemini yang sudah kita buat
            let aiResult = await askGemini(prompt, null, 'AUDITOR');

            // 4. FALLBACK (Jika AI Gagal/Error)
            // Kita gunakan logika matematika sederhana jika AI mati
            if (!aiResult || !aiResult.severity) {
                console.log("[AI FEEDBACK FAIL] Switch to manual logic");
                const manualCheck = _analyzeHealth(balanceInfo.current_balance, balanceInfo.days_until_drip);
                
                // Map status manual ('red') ke format frontend ('danger')
                const mapColor = { 'green': 'normal', 'yellow': 'caution', 'red': 'danger' };
                aiResult = {
                    severity: mapColor[manualCheck.status],
                    content: manualCheck.message
                };
            }

            return success(res, {
                isAvailable: true,
                severity: aiResult.severity,
                content: aiResult.content
            });

        } catch (e) { 
            console.error(e);
            return success(res, { isAvailable: false }); 
        }
    },



    // ============================================================
    // MODULE 7: AI CHATBOT (RAG Context Provider)
    // Frontend kirim pesan
    // Backend mengambil Context Data dari database
    // Backend mengirim Pesan User + Context Data ke Logic RAG
    // Balasan disimpan di chat history
    // ============================================================


    // ============================================================
    // MODULE 8: NOTIFICATION SYSTEM (POLLING)
    // ============================================================
    getUnreadNotifications: async (req, res) => {
        try {
            const user = req.currentUser;
            if (!user) return success(res, []);

            // Ambil notif yang belum dibaca (is_read = 0)
            const q = "SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC";
            const notifs = await SQL.Query(q, [user.id]);

            // Opsional: Langsung tandai terbaca agar tidak muncul berulang kali
            if (notifs.data.length > 0) {
                const ids = notifs.data.map(n => n.id).join(',');
                await SQL.Query(`UPDATE notifications SET is_read = 1 WHERE id IN (${ids})`);
            }

            return success(res, notifs.data || []);

        } catch (e) { return error(res, "Gagal ambil notif"); }
    },

    // ============================================================
    // MODULE 8: NOTIFICATION HISTORY (Inbox Lonceng)
    // ============================================================
    getNotificationHistory: async (req, res) => {
        try {
            const user = req.currentUser;
            
            const q = `SELECT id, title, message, type, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`;
            const dbData = await SQL.Query(q, [user.id]);

            // [CLEAN MAPPING]
            const formattedData = dbData.data.map(n => ({
                id: n.id.toString(),
                title: n.title,
                message: n.message,
                isRead: Boolean(n.is_read), // CamelCase
                type: n.type.toLowerCase(), // Lowercase
                createdAt: new Date(n.created_at).getTime() // UNIX Timestamp
            }));

            // Auto read (Optional)
            await SQL.Query("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [user.id]);

            return success(res, formattedData); // Kirim Array object

        } catch (e) { return error(res, "Gagal load notifikasi"); }
    },

    // Halaman Home: Get Current Program Info
    getCurrentProgram: async (req, res) => {
        try {
            const user = req.currentUser;
            const q = `
                SELECT f.funder_id, f.program_name, f.end_date, a.organization_name, a.displayname
                FROM funding f
                JOIN accounts a ON f.funder_id = a.id
                WHERE f.student_id = ? AND f.status IN ('Active', 'Ready_To_Fund', 'Partially_Funded')
                LIMIT 1
            `;
            const result = await SQL.Query(q, [user.id]);
            const program = result.data?.[0];

            if (!program) {
                // Return null atau default object sesuai kebutuhan frontend handling
                return success(res, { isJoined: false });
            }

            const finalName = program.program_name || `Beasiswa ${program.organization_name || program.displayname}`;

            return success(res, {
                isJoined: true,
                funderId: program.funder_id,
                displayName: finalName,
                activeUntil: new Date(program.end_date).getTime() // UNIX Timestamp
            });

        } catch (e) { return error(res, "Gagal info program"); }
    },

}

// ============================================================
// PRIVATE HELPER FUNCTIONS (Logika Terpisah)
// Taruh ini di bagian paling bawah file (di luar module.exports)
// ============================================================

// Info Saldo & Waktu
async function _getBalanceInfo(userId) {
    const res = await SQL.Query("SELECT balance FROM accounts_student WHERE id=?", [userId]);
    const balance = Number(res.data?.[0]?.balance || 0);

    // Hitung hari menuju Senin
    const today = new Date();
    const day = today.getDay(); 
    const daysLeft = day === 1 ? 7 : (8 - day) % 7;

    return { current_balance: balance, days_until_drip: daysLeft };
}

// Data Pie Chart (Grouping Kategori)
async function _getSpendingBreakdown(userId) {
    const query = `
        SELECT category_id, SUM(amount) as total 
        FROM transactions 
        WHERE student_id = ? AND type = 'Expense'
        AND MONTH(transaction_date) = MONTH(NOW()) 
        AND YEAR(transaction_date) = YEAR(NOW())
        GROUP BY category_id
    `;
    const res = await SQL.Query(query, [userId]);
    
    let map = { needs: 0, wants: 0, education: 0 };
    res.data.forEach(r => {
        if (r.category_id === 1) map.needs = Number(r.total);
        if (r.category_id === 0) map.wants = Number(r.total);
        if (r.category_id === 2) map.education = Number(r.total);
    });
    return map;
}

// Data Bar Chart (Tren Mingguan)
async function _getWeeklyTrend(userId) {
    const query = `
        SELECT DAYNAME(transaction_date) as day, SUM(amount) as total
        FROM transactions
        WHERE student_id = ? AND type = 'Expense' AND transaction_date >= DATE(NOW()) - INTERVAL 7 DAY
        GROUP BY DAYNAME(transaction_date)
    `;
    const res = await SQL.Query(query, [userId]);
    return res.data || [];
}

// List History
async function _getTransactionHistory(userId) {
    const query = `
        SELECT transaction_id, raw_description, amount, transaction_date, category_id, type 
        FROM transactions 
        WHERE student_id = ? 
        ORDER BY transaction_date DESC LIMIT 10
    `;
    const res = await SQL.Query(query, [userId]);
    return res.data || [];
}

// Otak AI (Pure Logic)
function _analyzeHealth(balance, daysLeft) {
    const dailyCost = 30000;
    const safeLimit = daysLeft * dailyCost;

    if (balance < safeLimit) {
        return { 
            status: 'red', 
            message: `⚠️ Sisa uang (Rp ${balance.toLocaleString()}) KURANG dari estimasi makan (${daysLeft} hari). Hemat segera!`
        };
    } 
    if (balance < (safeLimit + 50000)) {
        return { 
            status: 'yellow', 
            message: "Waspada. Uang pas-pasan. Stop jajan kopi mahal minggu ini."
        };
    }
    return { 
        status: 'green', 
        message: "Keuangan sehat! Pertahankan gaya hidup hemat ini."
    };
}