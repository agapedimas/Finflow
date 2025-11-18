// controllers/transactionController.js
const transactionModel = require("../models/transactionModel");
// Impor modul Authentication untuk mengecek sesi
const Authentication = require("../authentication"); 

const createManual = async (req, res) => {
    try {
        // =======================================================
        // LANGKAH 1: OTENTIKASI
        // =======================================================
        const sessionId = req.session.account;
        const studentId = await Authentication.GetAccountId(sessionId);

        // Jika tidak ada ID akun yang valid dari sesi, tolak akses
        if (!studentId) {
            return res.status(403).json({ success: false, message: "Access denied. Please sign in." });
        }

        // =======================================================
        // LANGKAH 2: PROSES DATA (Seperti sebelumnya)
        // =======================================================
        const { amount, category, allocationType, type, description, fundingId } = req.body;
        
        // Cek data minimal yang wajib
        if (!amount || !category || !allocationType || !type) {
            return res.status(400).json({ success: false, message: "Missing required fields." });
        }

        // Kita gunakan studentId yang sudah diverifikasi dari sesi
        const result = await transactionModel.createManualTransaction({ 
            studentId, // ID yang aman dari sesi
            amount, 
            category, 
            allocationType, 
            type, 
            description, 
            fundingId 
        });

        if (result.success) {
            return res.status(201).json({ 
                success: true, 
                data: result.data, 
                message: "Pengeluaran berhasil dicatat." 
            });
        }

        return res.status(500).json({ success: false, message: "Failed to save transaction to database." });

    } catch (error) {
        console.error("Error in createManual:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

module.exports = {
    createManual,
};