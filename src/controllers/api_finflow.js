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

    addTransaction: async (req, res) => {
        try {
            const { wallet_address, amount, category_id, description, proof_image_url } = req.body;

            // 1. Cek User & Saldo
            const uRes = await SQL.Query("SELECT a.id, s.balance FROM accounts a JOIN accounts_student s ON a.id = s.id WHERE a.wallet_address=?", [wallet_address]);
            const user = uRes.data?.[0];

            console.log(uRes.data);
            
            if(!user) return error(res, "User not found", 404);
            if(Number(user.balance) < Number(amount)) return error(res, "Saldo tidak mencukupi!", 400);

            // 2. Mock AI Vision (Jika ada upload gambar)
            let is_verified = false;
            if(proof_image_url) {
                // Simulasi pemanggilan AI Vision untuk verifikasi struk
                // Dalam implementasi nyata, panggil layanan AI di sini
                is_verified = true; // Asumsikan selalu terverifikasi untuk demo
            }

            // 3. Database Transaction (Atomic Operation Simulation)
            // A. Catat History
            const txId = generateId("tx");
            const qTx = `
                INSERT INTO transactions 
                (transaction_id, student_id, amount, type, category_id, raw_description, proof_image_url, is_verified_by_ai, transaction_date) 
                VALUES (?, ?, ?, 'Expense', ?, ?, ?, ?, NOW())
            `;
            await SQL.Query(qTx, [txId, user.id, amount, category_id, description, proof_image_url, is_verified]);

            // B. Potong Saldo
            await SQL.Query("UPDATE accounts_student SET balance = balance - ? WHERE id=?", [amount, user.id]);

            return success(res, { tx_id: txId, new_balance: user.balance - amount }, "Transaksi Berhasil Disimpan");
        } catch (e) {
            console.error(e);
            return error(res, "Gagal memproses transaksi");
        }
    }

    // ============================================================
    // MODULE 7: AI CHATBOT (RAG Context Provider)
    // Frontend kirim pesan
    // Backend mengambil Context Data dari database
    // Backend mengirim Pesan User + Context Data ke Logic RAG
    // Balasan disimpan di chat history
    // ============================================================
}