const SQL = require("../../sql");
const Functions = require("../../functions");

// HELPERS
const success = (res, data, msg = "Success") => res.json({ success: true, message: msg, data });
const error = (res, msg, code = 500) => res.status(code).json({ success: false, message: msg });
const generateId = (prefix) => `${prefix}_${Date.now().toString(36)}`;
const generateInviteCode = () => 'INV-' + Math.random().toString(36).substr(2, 6).toUpperCase();

module.exports = {

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