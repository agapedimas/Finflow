// Memastikan Anda mengimpor utilitas SQL dari index.js
const SQL = require("../index"); // Sesuaikan path jika index.js tidak di root
const crypto = require("crypto"); // Library bawaan Node.js untuk UUID

/**
 * Membuat ID Transaksi yang unik (sesuai format VARCHAR(128) di DB)
 * @returns {string} UUID V4 string
 */
const generateId = () => {
    return crypto.randomUUID();
};

/**
 * Menyimpan transaksi pengeluaran/pemasukan yang diinput manual oleh Student.
 * Ini mengimplementasikan flow B.4.1 (Menambahkan Pengeluaran Manual).
 * * @param {object} data - Data transaksi dari request body (Controller)
 * @param {string} data.studentId - ID Akun Student (accounts.id)
 * @param {number} data.amount - Nominal transaksi (e.g., 25000)
 * @param {string} data.category - Kategori detail (e.g., "Kopi Susu")
 * @param {string} data.allocationType - Jenis alokasi: Needs, Wants, Education, atau Personal
 * @param {string} data.type - Tipe transaksi: Income atau Expense
 * @param {string} data.description - Deskripsi singkat
 * @param {string} [data.fundingId] - (Opsional) ID Perjanjian Pendanaan jika terkait
 * @returns {Promise<{success: boolean, data: object|null}>}
 */
const createManualTransaction = async (data) => {
    const transactionId = generateId();
    const transactionDate = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format MySQL DATETIME

    // 1. Definisikan Query
    const query = `
        INSERT INTO transactions 
        (transaction_id, student_id, funding_id, transaction_date, amount, type, category, allocation_type, raw_description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // 2. Definisikan Values
    const values = [
        transactionId,
        data.studentId,
        data.fundingId || null, // Jika tidak ada fundingId, set NULL
        transactionDate,
        data.amount,
        data.type,
        data.category,
        data.allocationType,
        data.description
    ];

    // 3. Eksekusi Query menggunakan utilitas dari index.js
    const result = await SQL.Query(query, values);

    if (result.success && result.data.affectedRows === 1) {
        return { 
            success: true, 
            data: { 
                id: transactionId, 
                message: "Transaksi berhasil dicatat." 
            } 
        };
    }

    return { success: false, data: null };
};

module.exports = {
    createManualTransaction,
};