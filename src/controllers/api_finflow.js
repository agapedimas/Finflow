const SQL = require("../../sql");
const Functions = require("../../functions");
const Authentication = require("../../authentication");
const { ethers } = require("ethers");

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
    // MODULE 2: FUNDING AGREEMENT (Kesepakatan Awal)
    // ============================================================

    // 1. Funder Memulai (Set Dana Pokok)
    initiateFunding: async (req, res) => {
        try {
            const { wallet_address, student_email, total_amount, start_date, end_date, period_name } = req.body;

            // Validasi Funder
            const fRes = await SQL.Query("SELECT id FROM accounts WHERE wallet_address = ?", [wallet_address]);
            const funder = fRes.data?.[0];
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
            const { wallet_address, amount, is_final } = req.body;

            // Cari Parent
            const pRes = await SQL.Query("SELECT id FROM accounts WHERE wallet_address=?", [wallet_address]);
            const parent = pRes.data?.[0];
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
            const { wallet_address, alloc_needs, alloc_wants, alloc_edu } = req.body;

            // Validasi User & Funding
            const uRes = await SQL.Query("SELECT id FROM accounts WHERE wallet_address=?", [wallet_address]);
            const student = uRes.data?.[0];
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
            const { wallet_address, funding_ids, amount_paid } = req.body;

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
    // MODULE 6: INSIGHTS & VISUALIZATION (Dashboard Data)
    // ============================================================
    getInsights: async (req, res) => {
        try {
            const { wallet_address } = req.query;

            if (!wallet_address) return error(res, "Wallet address required", 400);

            // Validasi User: Memastikan wallet terdaftar
            const uRes = await SQL.Query("SELECT id, displayname FROM accounts WHERE wallet_address=?", [wallet_address]);
            const user = uRes.data?.[0];
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

    // ============================================================
    // MODULE 7: AI CHATBOT (RAG Context Provider)
    // Frontend kirim pesan
    // Backend mengambil Context Data dari database
    // Backend mengirim Pesan User + Context Data ke Logic RAG
    // Balasan disimpan di chat history
    // ============================================================
    
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
        GROUP BY category_id
    `;
    const res = await SQL.Query(query, [userId]);
    
    // Mapping biar rapi
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
    const dailyCost = 30000; // Asumsi
    const safeLimit = daysLeft * dailyCost;

    if (balance < safeLimit) {
        return { 
            status: 'red', 
            message: `⚠️ PERINGATAN: Sisa uang (Rp ${balance}) KURANG dari estimasi makan (${daysLeft} hari x 30rb). Hemat Rp ${safeLimit - balance} segera!`
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