const SQL = require("../../sql");
const Authentication = require("../../authentication");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const GeminiModule = require("../../gemini");
const BlockchainService = require("./blockchainService");

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
            
            // Insert Data Funder
            const q1 = `
                INSERT INTO accounts 
                (id, username, displayname, phonenumber, email, wallet_address, role, organization_name, bank_name, bank_account_number, created) 
                VALUES (?, ?, ?, ?, ?, ?, 'ScholarshipFunder', ?, ?, ?, NOW())
            `;
            const phone = phonenumber || "-";

            await SQL.Query(q1, [newId, username, full_name, phone, email, wallet_address, org_name, bank_name, bank_account]);

            // Insert ke tabel detail 
            await SQL.Query("INSERT INTO accounts_funder (id) VALUES (?)", [newId]);

            // C. Auto Login (Session)
            const sessionId = await Authentication.Add(newId, req.ip, true);
            if(req.session) { req.session.account = sessionId; req.session.is_privy = true; }

            return success(res, { id: newId, role: 'funder' }, "Funder Berhasil Terdaftar");
            
        } catch (e) {
            console.error(e);
            return error(res, "Gagal Register Funder");
        }
    },


    registerStudent: async (req, res) => {
        try {
            // [UPDATE] Menerima phonenumber
            const { email, wallet_address, full_name, bank_name, bank_account, phonenumber } = req.body;

            if (!email || !wallet_address || !full_name) {
                return error(res, "Data pendaftaran tidak lengkap", 400);
            }

            // Cek Duplikasi
            const checkWallet = await SQL.Query("SELECT id FROM accounts WHERE wallet_address = ?", [wallet_address]);
            if (checkWallet.data.length > 0) return error(res, "Wallet ini sudah terdaftar.", 400);

            const checkEmail = await SQL.Query("SELECT id FROM accounts WHERE email = ?", [email]);
            if (checkEmail.data.length > 0) return error(res, "Email ini sudah digunakan.", 400);

            const newId = generateId('student');
            const username = email.split('@')[0];
            const phone = phonenumber || "-";

            // [UPDATE] Insert ke ACCOUNTS dengan ROLE dan PHONENUMBER
            // Role sesuai ENUM: 'Student'
            const qAccount = `
                INSERT INTO accounts 
                (id, username, displayname, phonenumber, email, wallet_address, role, bank_name, bank_account_number, created) 
                VALUES (?, ?, ?, ?, ?, ?, 'Student', ?, ?, NOW())
            `;
            
            await SQL.Query(qAccount, [newId, username, full_name, phone, email, wallet_address, bank_name, bank_account]);

            // Insert ke Role Student (Saldo Awal 0)
            await SQL.Query("INSERT INTO accounts_student (id, balance) VALUES (?, 0)", [newId]);

            // Auto Login
            const sessionId = await Authentication.Add(newId, req.ip, true);
            if(req.session) { req.session.account = sessionId; req.session.is_privy = true; }

            return success(res, { id: newId, role: 'student' }, "Registrasi Mahasiswa Berhasil");
        } catch (e) {
            return error(res, "Gagal Registrasi Student");
        }
    },


    login: async (req, res) => {
        try {
            const { wallet_address } = req.body;
            const checkRes = await SQL.Query("SELECT * FROM accounts WHERE wallet_address = ?", [wallet_address]);
            let user = checkRes.data?.[0];

            if (!user) return error(res, "Akun tidak ditemukan. Harap daftar terlebih dahulu.", 404);

            // [UPDATE] Mapping Role dari Database ke Frontend
            // DB: 'ScholarshipFunder' -> Frontend: 'funder'
            // DB: 'Student'           -> Frontend: 'student'
            let frontendRole = 'unknown';
            
            if (user.role === 'ScholarshipFunder') frontendRole = 'funder';
            else if (user.role === 'Student') frontendRole = 'student';

            // Buat Session
            const sessionId = await Authentication.Add(user.id, req.ip, true);
            if (req.session) { req.session.account = sessionId; req.session.is_privy = true; }

            return success(res, { 
                ...user, 
                role: frontendRole 
            }, "Login Berhasil");
        } catch (e) {
            return error(res, "Login Error");
        }
    },


    // ============================================================
    // MODULE 2: FUNDING AGREEMENT (Kesepakatan Awal)
    // ============================================================

    // Funder membuat program baru
    createProgram: async (req, res) => {
        try {
            const { program_name, total_amount, start_date, end_date} = req.body;
            const funder = req.currentUser;

            if (!funder) return error(res, 'Unauthorized', 401);
            if (!program_name || !total_amount) return error(res, "Nama Program & Nominal Wajib Diisi", 400);

            const programId = generateId('prog');

            const q = `
                INSERT INTO scholarship_programs 
                (id, funder_id, program_name, total_period_fund, start_date, end_date, status) 
                VALUES (?, ?, ?, ?, ?, ?, 'Open')
            `;

            await SQL.Query(q, [programId, funder.id, program_name, total_amount, start_date, end_date]);

            return success(res, {
                program_id: programId,
                program_name: program_name
            }, "Program Beasiswa Berhasil Dibuat");

        } catch (e) {
            console.error(e);
            return error(res, "Gagal membuat program");
        }
    },

    // Add Student To Program
    addStudentToProgram: async (req, res) => {
        try {
            const { program_id, student_email } = req.body;
            const funder = req.currentUser;

            // A. Validasi Program
            // Pastikan program ini milik Funder yang sedang login
            const progRes = await SQL.Query("SELECT * FROM scholarship_programs WHERE id = ? AND funder_id = ?", [program_id, funder.id]);
            const program = progRes.data?.[0];

            if (!program) return error(res, "Program tidak ditemukan atau Anda bukan pemiliknya", 404);

            if (program.status !== 'Open') {
                return error(res, "Program ini sudah ditutup atau selesai. Tidak bisa menambah mahasiswa baru.", 400);
            }

            // B. Cari Student
            const sRes = await SQL.Query("SELECT id, displayname FROM accounts WHERE email=?", [student_email]);
            const student = sRes.data?.[0];
            
            if (!student) return error(res, "Email mahasiswa belum terdaftar di Finflow.", 404);

            // C. Cek Duplikasi (Apakah student ini sudah ada di program ini?)
            const checkDup = await SQL.Query("SELECT funding_id FROM funding WHERE program_id = ? AND student_id = ?", [program_id, student.id]);
            if (checkDup.data.length > 0) return error(res, "Mahasiswa ini sudah terdaftar di program ini.", 400);


            // D. Insert ke Tabel Funding
            // Kita copy 'total_period_fund' dari Program Master ke data Student
            // Status langsung 'Ready_To_Fund' (Siap dibayar)
            const fundingId = generateId('fund');
            
            const qFund = `
                INSERT INTO funding 
                (funding_id, program_id, student_id, status) 
                VALUES (?, ?, ?, 'Ready_To_Fund')
            `;
            
            
            await SQL.Query(qFund, [fundingId, program_id, student.id]);

            // E. Notifikasi ke Student
            await SQL.Query(
                "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Selamat! Anda Terpilih 🎓', ?, 'Success')",
                [student.id, `Anda telah ditambahkan ke program ${program.program_name}. Menunggu aktivasi dana.`]
            );

            return success(res, { 
                funding_id: fundingId, 
                student_name: student.displayname 
            }, "Mahasiswa berhasil ditambahkan.");

        } catch (e) {
            console.error(e);
            return error(res, "Gagal menambahkan mahasiswa");
        }
    },

    getStudentsFromProgram: async (req, res) => {
        const programId = req.params.id;

        const students = await SQL.Query(
            "SELECT a.id AS student_id, a.displayname AS student_name, a.email FROM funding f JOIN accounts a ON f.student_id = a.id WHERE f.program_id = ?", 
            [programId]);

        for (const student of students.data || []) {
            student.id = student.student_id;
            student.name = student.student_name;
            delete student.student_id;
            delete student.student_name;
        }

        if (students.success)
            res.send(students.data);
        else
            res.status(500).send();
    },

    getMyPrograms: async (req, res) => {
        try {
            const funder = req.currentUser;

            // 1. Ambil Semua Program milik Funder ini
            const qProg = "SELECT * FROM scholarship_programs WHERE funder_id = ?";
            const programs = await SQL.Query(qProg, [funder.id]);
            
            const resultList = [];

            // 2. Loop setiap program untuk cari Student-nya
            for (const prog of programs.data) {
                
                // Query Funding (Detail Student)
                const qFund = `
                    SELECT f.funding_id, f.status, f.student_id, a.displayname 
                    FROM funding f
                    JOIN accounts a ON f.student_id = a.id
                    WHERE f.program_id = ?
                `;
                const funds = await SQL.Query(qFund, [prog.id]);
                
                // Mapping Student
                const joinedStudents = funds.data.map(f => ({
                    id: f.student_id,
                    name: f.displayname,
                    fundingId: f.funding_id
                }));

                // Tentukan Status Program
                // (Karena status ada di level funding/student, kita ambil sampel dari student pertama)
                // Jika belum ada student, status default 'Ready_To_Fund'
                const programStatus = prog.status;
                
                // Tentukan Funding ID Utama
                // (Untuk UI Funder yang berbasis Program, kita gunakan ID Program sebagai identifier utama,
                //  tapi kita tetap sertakan sample funding_id jika diperlukan logika detail)
                const mainFundingId = funds.data.length > 0 ? funds.data[0].funding_id : prog.id;

                // Susun Objek sesuai Request
                resultList.push({
                    name: prog.program_name,
                    
                    // Kita gunakan ID Program sebagai ID unik di list ini agar tidak duplikat
                    programId: prog.id, 
                    // (Atau jika Anda ingin ID Funding spesifik student pertama: mainFundingId)
                    
                    funderId: prog.funder_id,
                    totalPeriodFund: Number(prog.total_period_fund),
                    
                    startDate: new Date(prog.start_date).toISOString().split('T')[0],
                    endDate: new Date(prog.end_date).toISOString().split('T')[0],
                    
                    status: programStatus,
                    joinedStudents: joinedStudents
                });
            }

            return success(res, resultList, "Data Program Berhasil Dimuat");

        } catch (e) { 
            console.error(e);
            return error(res, "Gagal memuat daftar program"); 
        }
    },

    initiateFunding: async (req, res) => {
        try {
            const { student_email, total_amount, start_date, end_date, program_name } = req.body;

            const funder = req.currentUser;
            if (!funder) return error(res, "Unauthorized: Silakan login sebagai Funder", 401);

            // Cari Student by Email (Karena Funder input email)
            const sRes = await SQL.Query("SELECT id FROM accounts WHERE email=?", [student_email]);
            const student = sRes.data?.[0];
            if(!student) return error(res, "Student tidak ditemukan", 404);

            const roleCheck = await SQL.Query("SELECT id FROM accounts_student WHERE id=?", [student.id]);
            if (roleCheck.data.length === 0) {
                return error(res, "Email tersebut terdaftar, tapi bukan sebagai Mahasiswa.", 400);
            }

            const programId = generateId('prog');
            const finalProgName = program_name || `Beasiswa ${funder.displayname} 2025`;

            const qProg = `
                INSERT INTO scholarship_programs 
                (id, funder_id, program_name, start_date, end_date, total_period_fund) 
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            await SQL.Query(qProg, [programId, funder.id, finalProgName, start_date, end_date, total_amount]);

            // Buat ID Funding Baru
            const fundingId = generateId("fund");

            // Simpan ke DB 
            // Kita simpan dulu uangnya di database (belum ke smart contract di tahap ini, simulasi hold)
            const qFund = `
                INSERT INTO funding 
                (funding_id, program_id, student_id, status, collected_amount) 
                VALUES (?, ?, ?, 'Ready_To_Fund', 0)
            `;
            await SQL.Query(qFund, [fundingId, programId, student.id]);

            // NOTIFIKASI KE STUDENT
            await SQL.Query(
                "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Anda Terpilih! 🎓', ?, 'Success')",
                [student.id, `Selamat! Anda telah didaftarkan ke program ${finalProgName}. Menunggu pencairan dana dari Funder.`]
            );

            return success(res, { 
                funding_id: fundingId, 
                program_id: programId,
                student_name: student.displayname 
            }, "Program Berhasil Dibuat. Silakan Lakukan Pembayaran.");
        } catch (e) {
            return error(res, "Gagal inisiasi funding")
        }
    },

    getMonthlyBudgetPlan: async (req, res) => {
        try {
            const user = req.currentUser;
            const { month, year } = req.query; // e.g., month=jan, year=2025

            // 1. Konversi Bulan (jan -> 1)
            const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
            const monthNum = isNaN(month) ? monthMap[month.toLowerCase()] : month;

            if (!monthNum || !year) return error(res, "Bulan & Tahun wajib diisi", 400);

            // 2. Ambil Item Budget (Detail)
            const qItems = `
                SELECT * FROM budget_plan 
                WHERE planner_id = ? AND month = ? AND year = ?
            `;
            const itemsRes = await SQL.Query(qItems, [user.id, monthNum, year]);

            // 3. Hitung Summary per Kategori (Untuk 3 Kartu Atas)
            let catSummary = {
                '0': { categoryName: 'Wants', total: 0 },
                '1': { categoryName: 'Needs', total: 0 },
                '2': { categoryName: 'Education', total: 0 }
            };
            
            let totalAllocated = 0;

            // Mapping Items ke format Frontend ('stuffs')
            const stuffs = itemsRes.data.map(item => {
                const totalItemPrice = Number(item.amount) * Number(item.quantity);
                
                // Tambahkan ke summary jika status approved
                if (item.status === 'approved') {
                    if(catSummary[item.category_id]) {
                        catSummary[item.category_id].total += totalItemPrice;
                    }
                    totalAllocated += totalItemPrice;
                }

                return {
                    id: item.id,
                    name: item.item_name,          // Map: item_name -> name
                    amount: Number(item.amount),    // Map: price -> amount (Harga Satuan)
                    quantity: Number(item.quantity),
                    status: item.status,
                    feedback: item.ai_feedback,
                    categoryId: item.category_id.toString()
                };
            });

            // Format Categories Array
            const categoriesArr = Object.keys(catSummary).map(key => ({
                categoryId: key,
                categoryName: catSummary[key].categoryName,
                total: catSummary[key].total
            }));

            // 4. Return JSON Sesuai DUMMY_MONTHLY_PLAN
            return success(res, {
                month: month,
                year: year,
                allocated: totalAllocated,
                categories: categoriesArr, // Array untuk kartu atas
                stuffs: stuffs             // Array untuk list bawah
            });

        } catch (e) {
            console.error(e);
            return error(res, "Gagal memuat budget plan");
        }
    },

    addBudgetItem: async (req, res) => {
        try {
            const user = req.currentUser;
            const { name, amount, quantity, categoryId, month, year } = req.body;

            if (!name || !amount || !quantity || !month || !year) {
                return error(res, "Data item tidak lengkap", 400);
            }

            const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
            const monthNum = isNaN(month) ? monthMap[month.toLowerCase()] : month;

            // A. Cari Funding ID Aktif milik Student
            // Item ini harus "nempel" ke program beasiswa yang sedang berjalan
            const fundRes = await SQL.Query(
                `SELECT f.funding_id, sp.total_period_fund 
                FROM funding f
                JOIN scholarship_programs sp ON f.program_id = sp.id
                WHERE f.student_id = ? 
                AND f.status IN ('Waiting_Allocation', 'Ready_To_Fund', 'Active') 
                LIMIT 1`,
                [user.id]
            );
            const funding = fundRes.data?.[0];
            
            if (!funding) return error(res, "Tidak ada program beasiswa aktif untuk membuat rencana.", 404);

            // B. AI VALIDATION (The Auditor)
            const totalCost = Number(amount) * Number(quantity);
            const categoryName = categoryId == 0 ? "Wants" : (categoryId == 1 ? "Needs" : "Education");

            const prompt = `
                ROLE: You are a strict but fair Financial Auditor for an Indonesian Scholarship Program called Finflow.
                YOUR GOAL: Validate a single budget item proposed by a student.
                
                --- INPUT DATA ---
                Item Name: "${name}"
                Category: ${categoryName}
                Unit Price: IDR ${Number(amount).toLocaleString('id-ID')}
                Quantity: ${quantity}
                Total Line Cost: IDR ${totalCost.toLocaleString('id-ID')}
                Student's Total Scholarship Fund: IDR ${Number(funding.total_period_fund).toLocaleString('id-ID')}
                
                --- ANALYSIS RULES (LOGIC CHAIN) ---
                1. **Check Categorization:**
                   - Is the item suitable for the selected category?
                   - Example: "Netflix" in Education -> REJECT. "Rice" in Needs -> APPROVE.
                
                2. **Check Unit Price Reality (Standard Indonesian Prices):**
                   - Is the 'Unit Price' reasonable for a SINGLE unit of this item?
                   - Example: "Lunch" @ 20.000 is OK. "Lunch" @ 500.000 is REJECT (Too expensive for one meal).
                   - Exception: If the name implies a bundle (e.g., "Monthly Catering"), a high unit price is acceptable.
                
                3. **Check Quantity Logic:**
                   - Is the quantity reasonable for a monthly/semester plan?
                   - Example: "Toothpaste" Qty 2 is OK. "Toothpaste" Qty 50 is REJECT (Hoarding/Reselling risk).
                   - Example: "Lunch" Qty 30 (for a month) is OK. "Laptop" Qty 2 is SUSPICIOUS (Why 2?).
                
                4. **Check Total Impact:**
                   - Is the 'Total Line Cost' a rational portion of their scholarship?
                   - Example: If Total Scholarship is 6 Million, and they want to buy a 5 Million Bag (Wants) -> REJECT.
                
                --- OUTPUT REQUIREMENT ---
                Respond ONLY in JSON format without markdown code blocks.
                Language for 'feedback': Indonesian (Bahasa Indonesia yang sopan tapi tegas).
                
                JSON Format:
                {
                    "status": "approved" OR "rejected",
                    "feedback": "Alasan singkat dan jelas (maksimal 2 kalimat)."
                }
            `;

            let aiCheck = await askGemini(prompt, null, 'AUDITOR');


            // [DEBUG] LIHAT HASIL MENTAH AI DI TERMINAL
            console.log("🔍 RAW AI RESULT:", JSON.stringify(aiCheck, null, 2));

            // --- 3. NORMALISASI HASIL AI (PENTING!) ---
            let finalStatus = 'pending';
            let finalFeedback = 'Menunggu validasi manual.';

            if (aiCheck) {
                // Handle key sensitif (Status vs status)
                const rawStatus = aiCheck.status || aiCheck.Status || "";
                
                // Paksa jadi lowercase & trim spasi
                const normalizedStatus = rawStatus.toLowerCase().trim();
                
                // Validasi apakah nilai sesuai ENUM MySQL?
                if (['approved', 'rejected'].includes(normalizedStatus)) {
                    finalStatus = normalizedStatus;
                    finalFeedback = aiCheck.feedback || aiCheck.Feedback || "Tanpa alasan.";
                } else {
                    console.warn("⚠️ AI mengembalikan status aneh:", rawStatus);
                    // Jika AI jawab aneh (misal "Review"), kita anggap pending
                    finalStatus = 'pending'; 
                }
            } else {
                console.warn("⚠️ AI Check Gagal/Null -> Fallback ke Pending");
            }

            console.log(`📝 FINAL STATUS DB: ${finalStatus}`);

            // --- 4. INSERT DATABASE ---
            const itemId = generateId('item');
            const qInsert = `
                INSERT INTO budget_plan 
                (id, planner_id, funding_id, item_name, category_id, amount, quantity, month, year, status, ai_feedback) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await SQL.Query(qInsert, [
                itemId, user.id, funding.funding_id, 
                name, categoryId, amount, quantity, monthNum, year, 
                finalStatus, // Gunakan status yang sudah dinormalisasi
                finalFeedback
            ]);

            return success(res, { 
                item_id: itemId, 
                status: finalStatus, 
                feedback: finalFeedback 
            }, "Item ditambahkan");

        } catch (e) {
            console.error(e);
            return error(res, "Gagal menambah item");
        }
    },

    editBudgetItem: async (req, res) => {
        try {
            const user = req.currentUser;
            const { id, name, amount, quantity, categoryId } = req.body; 

            // 1. Cek Validitas Item & Ambil Total Period Fund
            // Kita perlu JOIN 3 Tabel: budget_plan -> funding -> scholarship_programs
            const qCheck = `
                SELECT bp.*, sp.total_period_fund 
                FROM budget_plan bp
                JOIN funding f ON bp.funding_id = f.funding_id
                JOIN scholarship_programs sp ON f.program_id = sp.id
                WHERE bp.id = ? AND bp.planner_id = ?
            `;
            
            const check = await SQL.Query(qCheck, [id, user.id]);
            
            if (check.data.length === 0) return error(res, "Item tidak ditemukan", 404);
            
            const currentItem = check.data[0];

            // 2. RE-VALIDASI AI (Panggil Gemini Lagi)
            const totalCost = Number(amount) * Number(quantity);
            const categoryName = categoryId == 0 ? "Wants" : (categoryId == 1 ? "Needs" : "Education");

            const prompt = `
                ROLE: Financial Auditor. RE-VALIDATION REQUEST.
                
                CONTEXT: Student is editing a budget item.
                PREVIOUS ITEM: "${currentItem.item_name}" (IDR ${currentItem.amount})
                
                NEW PROPOSAL:
                - Item Name: "${name}"
                - Category: ${categoryName}
                - Unit Price: IDR ${Number(amount).toLocaleString('id-ID')}
                - Quantity: ${quantity}
                - Total Line Cost: IDR ${totalCost.toLocaleString('id-ID')}
                - Student Total Scholarship: IDR ${Number(currentItem.total_period_fund).toLocaleString('id-ID')}
                
                RULES:
                Validate this update strictly. 
                Check if the price is reasonable and category is correct.
                
                OUTPUT JSON: { "status": "approved" | "rejected", "feedback": "Reason in Indonesian" }
            `;

            // Panggil AI
            let aiCheck = await askGemini(prompt, null, 'AUDITOR');
            
            // Fallback jika AI mati
            if (!aiCheck) {
                aiCheck = { status: 'pending', feedback: 'AI sibuk. Item disimpan sebagai pending.' };
            }

            // 3. UPDATE DATABASE
            const qUpdate = `
                UPDATE budget_plan 
                SET item_name=?, amount=?, quantity=?, category_id=?, status=?, ai_feedback=?
                WHERE id=?
            `;
            
            await SQL.Query(qUpdate, [
                name, 
                amount, 
                quantity, 
                categoryId, 
                aiCheck.status,   
                aiCheck.feedback, 
                id
            ]);

            return success(res, { 
                id: id,
                status: aiCheck.status, 
                feedback: aiCheck.feedback 
            }, "Item diperbarui dan divalidasi ulang.");

        } catch (e) {
            console.error(e);
            return error(res, "Gagal edit item");
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

    // 4. CONFIRM TRANSFER (Funder Bayar Lunas di Awal)
    // 4. CONFIRM TRANSFER (Funder Bayar Lunas di Awal)
    // 4. CONFIRM TRANSFER (Funder Bayar Lunas di Awal)
    confirmTransfer: async (req, res) => {
        try {
            const { funding_ids } = req.body; // Array ID

            if (!Array.isArray(funding_ids) || funding_ids.length === 0) {
                return error(res, "Pilih minimal satu program", 400);
            }

            const placeholders = funding_ids.map(() => '?').join(',');
            
            // Query Check
            const qCheck = `SELECT f.funding_id, p.total_period_fund, f.student_id, p.funder_id FROM funding f JOIN scholarship_programs p ON f.program_id = p.id WHERE f.funding_id IN (${placeholders}) AND f.status = 'Ready_To_Fund'`;
            
            const result = await SQL.Query(qCheck, funding_ids);

            if (!result || !result.data) {
                console.error("SQL Error di confirmTransfer:", result);
                return error(res, "Terjadi kesalahan database saat verifikasi pembayaran.", 500);
            }

            const funds = result.data;

            if (funds.length === 0) return error(res, "Tidak ada tagihan aktif atau status sudah berubah", 404);

            let totalPaid = 0;

            for (const fund of funds) {
                const amount = Number(fund.total_period_fund);
                
                // 1. UPDATE DATABASE
                await SQL.Query(
                    "UPDATE funding SET status = 'Waiting_Allocation' WHERE funding_id = ?", 
                    [fund.funding_id]
                );
                
                // 2. NOTIFIKASI [PERBAIKAN DISINI]
                // Format Rupiah
                const fmtAmount = amount.toLocaleString('id-ID');
                
                // Susun pesan di Javascript dulu (Lebih Aman)
                const notifMessage = `Funder telah menyetor dana Rp ${fmtAmount}. Buat Budget Plan sekarang.`;

                // Masukkan pesan yang sudah jadi ke database
                await SQL.Query(
                    "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Dana Masuk! 💰', ?, 'Success')", 
                    [fund.student_id, notifMessage]
                );

                totalPaid += amount;
            }

            return success(res, { 
                total_paid: totalPaid,
                status: "Waiting_Allocation"
            }, "Pembayaran Sukses. Mahasiswa telah dinotifikasi.");

        } catch (e) { 
            console.error(e);
            return error(res, "Gagal transfer: " + e.message); 
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
                amount: Number(item.amount),
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
    // Dipanggil oleh Scheduler (Cron Job) setiap menit/jam
    // EXECUTION WEEKLY DRIP (Aggregated Version)
    triggerWeeklyDrip: async (req, res) => {
        try {
            console.log("[SCHEDULER] 🔍 Memeriksa jadwal drip...");

            // 1. Ambil SEMUA data alokasi yang valid
            // Kita perlu mengambil semuanya dulu, nanti dikelompokkan per mahasiswa di Javascript
            const q = `
                SELECT 
                    f.student_id, 
                    sp.funder_id,
                    a.wallet_address, 
                    a.displayname,
                    fa.allocation_id, 
                    fa.drip_amount, 
                    fa.remaining_drip_count,
                    fa.category_id
                FROM funding_allocation fa
                JOIN funding f ON fa.funding_id = f.funding_id
                JOIN scholarship_programs sp ON f.program_id = sp.id
                JOIN accounts a ON f.student_id = a.id
                WHERE f.status = 'Active' 
                AND fa.drip_frequency = 'Weekly' 
                AND fa.remaining_drip_count > 0
            `;
            
            const rawData = await SQL.Query(q);
            if (!rawData || rawData.data.length === 0) {
                return success(res, { processed: 0 }, "Tidak ada jadwal drip.");
            }

            // 2. GROUPING DATA PER STUDENT (Aggregation)
            // Kita ubah list baris menjadi Object per student
            // Format: { 'student_id': { totalAmount: 500000, items: [row1, row2], wallet: '0x...' } }
            let studentGroups = {};

            for (const row of rawData.data) {
                const sId = row.student_id;
                
                if (!studentGroups[sId]) {
                    studentGroups[sId] = {
                        student_id: sId,
                        wallet: row.wallet_address,
                        name: row.displayname,
                        funder_id: row.funder_id,
                        totalAmount: 0,
                        allocations: [] // Menyimpan daftar alokasi yang harus diupdate
                    };
                }

                // Tambahkan nominal ke total
                const amount = Math.floor(Number(row.drip_amount));
                studentGroups[sId].totalAmount += amount;
                studentGroups[sId].allocations.push(row);
            }

            let successCount = 0;

            // 3. EKSEKUSI PER STUDENT (Satu Transaksi per Orang)
            for (const sId in studentGroups) {
                const group = studentGroups[sId];
                
                if (group.totalAmount <= 0 || !group.wallet) continue;

                try {
                    console.log(`[DRIP] Processing ${group.name} (Total: Rp ${group.totalAmount})...`);

                    // --- A. BLOCKCHAIN TRANSFER (SATU KALI SAJA) ---
                    // Mengirim total gabungan (Needs + Wants)
                    const txHash = await BlockchainService.executeDrip(group.wallet, group.totalAmount);
                    
                    if (!txHash) {
                        // console.log(`[DRIP SKIP] Blockchain menolak (TimeLock/Error).`);
                        continue; 
                    }

                    console.log(`[DRIP SUCCESS] Hash: ${txHash}`);

                    // --- B. DATABASE UPDATE (Looping per item alokasi) ---
                    // Kita update database untuk setiap kategori (Needs & Wants) secara terpisah
                    // meskipun transaksinya cuma sekali.
                    
                    for (const alloc of group.allocations) {
                        // 1. Kurangi Sisa Jatah per kategori
                        await SQL.Query("UPDATE funding_allocation SET remaining_drip_count = remaining_drip_count - 1 WHERE allocation_id = ?", [alloc.allocation_id]);
                        
                        // 2. Catat Transaksi per kategori (Agar report rapi)
                        // Kita pakai txHash yang sama untuk kedua transaksi
                        const amountPerCat = Math.floor(Number(alloc.drip_amount));
                        const txId = generateId('drip');
                        
                        await SQL.Query(`
                            INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description, blockchain_tx_hash, transaction_date)
                            VALUES (?, ?, ?, 'Drip_In', ?, 'Pencairan Mingguan', ?, NOW())
                        `, [txId, sId, amountPerCat, alloc.category_id, txHash]);
                    }

                    // 3. Update Saldo Wallet (Total)
                    await SQL.Query("UPDATE accounts_student SET balance = balance + ? WHERE id = ?", [group.totalAmount, sId]);

                    // --- C. REPORTING & NOTIFICATION (Satu kali per student) ---
                    
                    // Notifikasi Student
                    const fmtAmount = group.totalAmount.toLocaleString('id-ID');
                    // Ambil sisa minggu dari salah satu item (asumsi sinkron)
                    const sisaMinggu = group.allocations[0].remaining_drip_count - 1;

                    await SQL.Query(
                        "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Drip Mingguan Cair 💸', ?, 'Info')",
                        [sId, `Total uang saku Rp ${fmtAmount} (Needs+Wants) berhasil masuk.\nSisa jatah: ${sisaMinggu} minggu.`]
                    );

                    successCount++;

                } catch (bcError) {
                    console.error(`[DRIP ERROR] Gagal ke ${group.name}:`, bcError.message);
                }
            }

            return success(res, { processed: successCount }, "Weekly Drip Selesai");

        } catch (e) { 
            console.error(e);
            return error(res, "Gagal memproses drip: " + e.message); 
        }
    },

    // EXECUTION URGENT FUND (Readjustment Logic)
    // EXECUTION URGENT FUND (Readjustment Logic)
    requestUrgent: async (req, res) => {
        try {
            const user = req.currentUser;
            const { amount, reason, proof_image_url } = req.body;

            // 1. VALIDASI INPUT
            const reqAmount = parseInt(amount);
            if (!reqAmount || reqAmount <= 0) return error(res, "Nominal tidak valid.", 400);

            // 2. AI VALIDATION (AUDITOR)
            // (Kode AI Validator Anda yang lama sudah bagus, kita pertahankan)
            const prompt = `
                ROLE: Financial Auditor.
                TASK: Analyze urgent fund request.
                REASON: "${reason}"
                RULES: Valid if Medical, Accident, Essential breakdown. Invalid if Vacation, Concert.
                OUTPUT JSON: { "is_urgent": boolean, "reasoning": "string" }
            `;
            
            // Note: Untuk hackathon, jika integrasi gambar AI rumit, cukup kirim prompt teks dulu
            let aiCheck = await askGemini(prompt, null, 'AUDITOR');
            
            // Fallback jika AI error/null
            if (!aiCheck) aiCheck = { is_urgent: true, reasoning: "AI Offline, Auto-Approve for Demo" };

            if (!aiCheck.is_urgent) {
                 return error(res, "Ditolak AI: " + aiCheck.reasoning, 403);
            }
            
            // 3. CEK KETERSEDIAAN JATAH MASA DEPAN (Wants Category = 0)
            const allocQ = `
                SELECT fa.allocation_id, fa.drip_amount, fa.remaining_drip_count, f.funding_id
                FROM funding_allocation fa
                JOIN funding f ON fa.funding_id = f.funding_id
                WHERE f.student_id = ? AND fa.category_id = 0 AND f.status = 'Active'
            `;
            const allocRes = await SQL.Query(allocQ, [user.id]);
            const alloc = allocRes.data?.[0];

            if (!alloc || alloc.remaining_drip_count <= 0) {
                return error(res, "Tidak ada budget 'Wants' masa depan yang bisa dipotong.", 400);
            }

            // 4. HITUNG READJUSTMENT (POTONG GAJI)
            const sisaMinggu = Number(alloc.remaining_drip_count);
            const maxAvailable = Number(alloc.drip_amount) * sisaMinggu;

            if (reqAmount > maxAvailable) {
                return error(res, `Dana tidak cukup. Max pinjaman: Rp ${maxAvailable.toLocaleString('id-ID')}`, 400);
            }

            // Hitung potongan per minggu
            const deductionPerWeek = Math.ceil(reqAmount / sisaMinggu);
            const newDripAmount = Number(alloc.drip_amount) - deductionPerWeek;

            // ============================================================
            // 5. BLOCKCHAIN EXECUTION (REAL)
            // ============================================================
            let txHash = "";
            try {
                // Panggil fungsi releaseFund di BlockchainService
                // Fungsi ini mem-bypass TimeLock di Smart Contract
                txHash = await BlockchainService.releaseFund(
                    user.wallet_address,
                    reqAmount,
                    "Urgent: " + reason.substring(0, 20)
                );
                console.log(`[BC] Urgent Fund Released: ${txHash}`);
            } catch (bcError) {
                console.error("[BC ERROR]", bcError);
                return error(res, "Gagal mencairkan dana di Blockchain. Silakan coba lagi.");
            }

            // ============================================================
            // 6. UPDATE DATABASE
            // ============================================================
            
            // A. Update Drip Masa Depan (Potong Gaji)
            await SQL.Query("UPDATE funding_allocation SET drip_amount = ? WHERE allocation_id = ?", [newDripAmount, alloc.allocation_id]);

            // B. Catat Transaksi Masuk
            const txId = generateId('urgent');
            await SQL.Query(`
                INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description, is_urgent_withdrawal, urgency_reason, proof_image_url, blockchain_tx_hash, transaction_date)
                VALUES (?, ?, ?, 'Drip_In', 1, 'Dana Darurat (Advance)', TRUE, ?, ?, ?, NOW())
            `, [txId, user.id, reqAmount, reason, proof_image_url, txHash]);

            // C. Update Saldo Real di App (Virtual Balance)
            // Balance bertambah karena uang masuk
            await SQL.Query("UPDATE accounts_student SET balance = balance + ? WHERE id = ?", [reqAmount, user.id]);

            // D. Notifikasi Konsekuensi
            const fmtReq = reqAmount.toLocaleString('id-ID');
            const fmtPotong = deductionPerWeek.toLocaleString('id-ID');
            
            await SQL.Query(
                "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Dana Darurat Cair 🚑', ?, 'Warning')",
                [user.id, `Dana Rp ${fmtReq} cair. Jatah mingguan dipotong Rp ${fmtPotong} untuk ${sisaMinggu} minggu ke depan.`]
            );

            return success(res, {
                received: reqAmount,
                deduction_per_week: deductionPerWeek,
                new_wants_drip: newDripAmount,
                tx_hash: txHash
            }, "Permintaan Disetujui.");

        } catch (e) { 
            console.error(e);
            return error(res, "Gagal request urgent: " + e.message); 
        }
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
    // POST-APPROVAL (Reimburse / Real Transfer Education)
    requestEduReimburse: async (req, res) => {
        try {
            const { amount, description, proof_image_url } = req.body; // proof_image_url berisi Base64 string
            const reqAmount = parseInt(amount);

            // 1. VALIDASI USER & INPUT
            const user = req.currentUser;
            if (!user) return error(res, "User not found", 404);
            if (!reqAmount || reqAmount <= 0) return error(res, "Nominal tidak valid", 400);
            if (!description) return error(res, "Deskripsi pengeluaran wajib diisi", 400);

            // 2. CEK SALDO PENDIDIKAN DI DATABASE
            // Kategori 2 = Education
            const vaultQ = `
                SELECT fa.allocation_id, fa.total_allocation, fa.total_withdrawn 
                FROM funding_allocation fa
                JOIN funding f ON fa.funding_id = f.funding_id
                WHERE f.student_id = ? AND fa.category_id = 2 AND f.status = 'Active'
            `;
            const vaultRes = await SQL.Query(vaultQ, [user.id]);
            const vault = vaultRes.data?.[0];
            
            if (!vault) return error(res, "Tidak ada dana pendidikan aktif", 400);
            
            const sisaPendidikan = Number(vault.total_allocation) - Number(vault.total_withdrawn);
            if (sisaPendidikan < reqAmount) {
                return error(res, `Saldo pendidikan tidak cukup. Sisa: Rp ${sisaPendidikan.toLocaleString('id-ID')}`, 400);
            }

            // ============================================================
            // 3. IMAGE HANDLING (BASE64 -> FILE)
            // ============================================================
            let finalImageUrl = null;

            if (proof_image_url && proof_image_url.startsWith('data:image')) {
                try {
                    // A. Buat folder jika belum ada
                    const uploadDir = path.join(__dirname, "../../public/proofs"); // Sesuaikan path ke folder public Anda
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }

                    // B. Decode Base64
                    // Format base64: "data:image/png;base64,iVBORw0KGgo..."
                    const matches = proof_image_url.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
                    
                    if (matches && matches.length === 3) {
                        const ext = matches[1]; // png, jpg, jpeg
                        const data = matches[2]; // data biner
                        const buffer = Buffer.from(data, 'base64');

                        // C. Generate Nama File Unik
                        const filename = `edu_${user.id}_${Date.now()}.${ext}`;
                        const filePath = path.join(uploadDir, filename);

                        // D. Tulis File ke Disk
                        fs.writeFileSync(filePath, buffer);

                        // E. Set URL untuk Database
                        // URL ini nanti bisa diakses frontend via http://localhost:PORT/proofs/filename
                        finalImageUrl = `/proofs/${filename}`;
                    }
                } catch (errImg) {
                    console.error("Gagal save gambar:", errImg);
                    // Lanjut saja tanpa gambar daripada error total (Fallback)
                }
            }

            // ============================================================
            // 4. BLOCKCHAIN TRANSFER (REAL)
            // ============================================================
            let txHash = "";
            try {
                // Panggil fungsi releaseFund
                txHash = await BlockchainService.releaseFund(
                    user.wallet_address, 
                    reqAmount, 
                    "Edu Reimburse"
                );
                console.log(`[BC] Education Fund Released: ${txHash}`);
            } catch (bcErr) {
                console.error("[BC ERROR]", bcErr);
                return error(res, "Gagal pencairan di Blockchain: " + bcErr.message);
            }

            // ============================================================
            // 5. UPDATE DATABASE
            // ============================================================

            // A. Update Total Withdrawn (Agar sisa limit berkurang)
            await SQL.Query("UPDATE funding_allocation SET total_withdrawn = total_withdrawn + ? WHERE allocation_id = ?", [reqAmount, vault.allocation_id]);
            
            // B. Catat Transaksi Pengeluaran
            // Tipe 'Drip_In' (Uang masuk penggantian) atau 'Expense' (Pencatatan beli).
            // Kita catat sebagai Uang Masuk (Reimburse) agar saldo wallet bertambah.
            await SQL.Query(`
                INSERT INTO transactions (transaction_id, student_id, amount, type, category_id, raw_description, proof_image_url, is_verified_by_ai, blockchain_tx_hash, transaction_date)
                VALUES (?, ?, ?, 'Drip_In', 2, ?, ?, TRUE, ?, NOW())
            `, [
                generateId('edu'), 
                user.id, 
                reqAmount, 
                "Reimburse: " + description, 
                finalImageUrl, // Masukkan URL file yang sudah disimpan
                txHash
            ]);

            // C. Update Saldo Wallet App
            await SQL.Query("UPDATE accounts_student SET balance = balance + ? WHERE id = ?", [reqAmount, user.id]);

            // D. Notifikasi
            const formattedAmount = reqAmount.toLocaleString('id-ID'); 
            const notifMessage = `Dana pendidikan Rp ${formattedAmount} berhasil dicairkan untuk penggantian "${description}".`;

            await SQL.Query(
                "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Reimburse Sukses 📚', ?, 'Success')",
                [user.id, notifMessage] 
            );

            return success(res, { tx_hash: txHash }, "Reimburse Disetujui & Ditransfer");

        } catch (e) { 
            console.error(e);
            return error(res, "Gagal reimburse: " + e.message); 
        }
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
            

            // Jika bukan keduanya, TENDANG!
            if (!isFunder) {
                return error(res, "Akses Ditolak! Anda bukan Funder dari mahasiswa ini.", 403);
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
            const user = req.params.studentId || req.currentUser;

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
            const user = req.query.userId || req.currentUser;
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
            const user = req.params.studentId || req.currentUser;
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
            const user = req.params.studentId || req.currentUser;
            
            // 1. Ambil Saldo Total (Uang Fisik di Akun)
            const bRes = await SQL.Query("SELECT balance FROM accounts_student WHERE id=?", [user.id]);
            const totalBalance = Number(bRes.data?.[0]?.balance || 0);

            // 2. Hitung Saldo Per Kategori (Cashflow Calculation)
            // Rumus: (Total Masuk ke Kategori Ini) - (Total Keluar dari Kategori Ini)
            // Kita Join ke tabel allocation_categories agar kategori yang kosong tetap muncul
            const qCalc = `
                SELECT 
                    ac.id as cat_id, 
                    ac.category_name,
                    COALESCE(SUM(CASE WHEN t.type IN ('Drip_In', 'Income') THEN t.amount ELSE 0 END), 0) as total_in,
                    COALESCE(SUM(CASE WHEN t.type = 'Expense' THEN t.amount ELSE 0 END), 0) as total_out
                FROM allocation_categories ac
                LEFT JOIN transactions t ON ac.id = t.category_id AND t.student_id = ?
                GROUP BY ac.id, ac.category_name
                ORDER BY ac.id ASC
            `;

            const calcRes = await SQL.Query(qCalc, [user.id]);

            // 3. Format Output Sesuai DUMMY_WALLET
            const allocations = calcRes.data.map(row => {
                const netBalance = Number(row.total_in) - Number(row.total_out);
                
                return {
                    categoryId: row.cat_id.toString(), // String ID "0"
                    categoryName: row.category_name,   // "Wants"
                    balance: Math.max(0, netBalance)   // Pastikan tidak negatif
                };
            });

            // 4. Return JSON
            return success(res, {
                balance: totalBalance,
                allocations: allocations
            });

        } catch (e) {
            console.error(e);
            return error(res, "Gagal mengambil data wallet");
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
            const user = req.params.studentId || req.currentUser;
            
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
            const user = req.params.studentId || req.currentUser;
            
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
            const user = req.currentUser; // Ambil student dari session

            // Query untuk mencari program aktif yang diikuti student
            // Kita perlu JOIN ke tabel 'scholarship_programs' untuk ambil nama & tanggal
            const q = `
                SELECT p.funder_id, p.program_name, p.end_date
                FROM funding f
                JOIN scholarship_programs p ON f.program_id = p.id
                WHERE f.student_id = ? 
                AND f.status IN ('Ready_To_Fund', 'Waiting_Allocation', 'Partially_Funded', 'Active')
                ORDER BY p.end_date DESC 
                LIMIT 1
            `;
            
            const result = await SQL.Query(q, [user.id]);
            const program = result.data?.[0];

            // SKENARIO A: Belum Join Program Apapun
            if (!program) {
                return success(res, {
                    isJoined: false,
                    funderId: null,
                    displayName: null,
                    activeUntil: null
                });
            }

            // SKENARIO B: Sudah Join (Format sesuai Request)
            return success(res, {
                isJoined: true,
                funderId: program.funder_id,        // "fund1"
                displayName: program.program_name,  // "Djarum Super"
                activeUntil: new Date(program.end_date).getTime() // UNIX Timestamp (1767...)
            });

        } catch (e) {
            console.error(e);
            return error(res, "Gagal mengambil data program");
        }
    },

    // ============================================================
    // MODULE 3 EXTENSION: ACTIVATE BUDGET (Blockchain Trigger)
    // ============================================================
    activateBudgetPlan: async (req, res) => {
        try {
            const user = req.currentUser;
            
            // 1. Ambil Funding yang sedang menunggu
            const qFund = `
                SELECT f.funding_id, f.status, sp.total_period_fund, sp.start_date, sp.end_date, sp.funder_id
                FROM funding f
                JOIN scholarship_programs sp ON f.program_id = sp.id
                WHERE f.student_id = ? AND f.status = 'Waiting_Allocation'
            `;
            const fundRes = await SQL.Query(qFund, [user.id]);
            const funding = fundRes.data?.[0];

            if (!funding) {
                return error(res, "Tidak ada program beasiswa yang menunggu aktivasi (Status harus Waiting_Allocation).", 404);
            }

            // 2. Ambil SEMUA Item Budget
            const qItems = "SELECT * FROM budget_plan WHERE funding_id = ?";
            const itemsRes = await SQL.Query(qItems, [funding.funding_id]);
            const items = itemsRes.data;

            if (items.length === 0) return error(res, "Belum ada rencana anggaran yang dibuat.", 400);

            // 3. VALIDASI 1: Semua item harus APPROVED
            const pendingOrRejected = items.filter(i => i.status !== 'approved');
            if (pendingOrRejected.length > 0) {
                return error(res, `Masih ada ${pendingOrRejected.length} item yang belum disetujui.`, 400);
            }

            // 4. VALIDASI 2: Total Rencana == Total Dana
            const totalPlanned = items.reduce((sum, item) => sum + (Number(item.amount) * Number(item.quantity)), 0);
            const totalBudget = Number(funding.total_period_fund);

            if (Math.abs(totalPlanned - totalBudget) > 1000) {
                return error(res, `Total rencana (Rp ${totalPlanned.toLocaleString()}) TIDAK SAMA dengan dana beasiswa (Rp ${totalBudget.toLocaleString()}).`, 400);
            }

            // --- SETUP SISTEM & BLOCKCHAIN LOGIC ---
            
            // 5. Hitung Durasi Minggu
            const weeks = calculateWeeks(funding.start_date, funding.end_date);
            
            // 6. Pisahkan Dana
            let totalNeeds = 0;
            let totalWants = 0;
            let totalEdu = 0;

            items.forEach(item => {
                const val = Number(item.amount) * Number(item.quantity);
                if (item.category_id === 1) totalNeeds += val; 
                else if (item.category_id === 0) totalWants += val; 
                else if (item.category_id === 2) totalEdu += val; 
            });

            const dripNeeds = Math.floor(totalNeeds / weeks);
            const dripWants = Math.floor(totalWants / weeks);
            
            // [PERBAIKAN SCOPE]: Definisikan variabel ini DI LUAR blok try/catch
            const totalWeeklyDrip = dripNeeds + dripWants;

            // 7. SIMPAN ATURAN KONTRAK (Funding Allocation)
            await SQL.Query("DELETE FROM funding_allocation WHERE funding_id = ?", [funding.funding_id]);

            const qAllocDrip = `
                INSERT INTO funding_allocation (allocation_id, funding_id, category_id, total_allocation, drip_frequency, drip_amount, remaining_drip_count) 
                VALUES (?, ?, 1, ?, 'Weekly', ?, ?), (?, ?, 0, ?, 'Weekly', ?, ?)
            `;
            await SQL.Query(qAllocDrip, [
                generateId('an'), funding.funding_id, totalNeeds, dripNeeds, weeks,
                generateId('aw'), funding.funding_id, totalWants, dripWants, weeks
            ]);

            const qAllocVault = `
                INSERT INTO funding_allocation (allocation_id, funding_id, category_id, total_allocation, drip_frequency, drip_amount, total_withdrawn) 
                VALUES (?, ?, 2, ?, 'Locked', 0, 0)
            `;
            await SQL.Query(qAllocVault, [generateId('ae'), funding.funding_id, totalEdu]);

            // 8. AKTIFKAN PROGRAM (DB)
            await SQL.Query("UPDATE funding SET status = 'Active' WHERE funding_id = ?", [funding.funding_id]);

            // ============================================================
            // 9. BLOCKCHAIN ACTION (REAL INTEGRATION)
            // ============================================================
            let txHash = "";
            try {
                // Panggil Service Blockchain
                txHash = await BlockchainService.setupVaultPlan(
                    user.wallet_address,  
                    totalEdu,             
                    totalWeeklyDrip,      
                    weeks                 
                );
                
                console.log(`[BC] ✅ Plan Setup Success! Hash: ${txHash}`);

            } catch (bcError) {
                console.error("⚠️ Blockchain Setup Failed:", bcError.message);
                txHash = "failed_on_chain_db_ok"; 
            }
            // ============================================================

            // 10. Notifikasi DETAIL
            const fmtEdu = Number(totalEdu).toLocaleString('id-ID');
            const fmtDrip = Number(totalWeeklyDrip).toLocaleString('id-ID'); // Sekarang variabel ini dikenali
            const fmtTotal = Number(funding.total_period_fund).toLocaleString('id-ID');

            const msgStudent = `🎉 Beasiswa Aktif! Dana Total Rp ${fmtTotal} telah dikunci di Smart Contract. Dana Pendidikan: Rp ${fmtEdu} (Terkunci). Uang Saku Mingguan: Rp ${fmtDrip}.`;

            await SQL.Query(
                "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Kontrak Blockchain Aktif 🔗', ?, 'Success')",
                [user.id, msgStudent]
            );

            const msgFunder = `Student ${user.displayname} siap! Dana Rp ${fmtTotal} sudah diamankan di Smart Contract (Hash: ${txHash.substring(0, 10)}...).`;
            
            await SQL.Query(
                "INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Setup Berhasil ✅', ?, 'Success')",
                [funding.funder_id, msgFunder]
            );

            return success(res, { 
                status: "Active", 
                weekly_drip: totalWeeklyDrip, 
                tx_hash: txHash 
            }, "Aktivasi Berhasil!");

        } catch (e) {
            console.error(e);
            return error(res, "Gagal aktivasi budget plan: " + e.message);
        }
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