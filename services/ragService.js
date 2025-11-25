const SQL = require("../index"); // SESUAIKAN PATH KE MODUL KONEKSI DATABASE ANDA

/**
 * Menganalisis total pengeluaran Student untuk bulan berjalan berdasarkan alokasi 
 * (Needs, Wants, Education) dan membandingkannya dengan budget yang dialokasikan.
 * @param {number} studentId ID Siswa
 * @returns {Promise<object>} Hasil analisis budget dalam format JSON.
 */
async function get_budget_compliance(studentId) {
    try {
        // Mendapatkan bulan dan tahun saat ini
        const today = new Date();
        const currentMonth = today.getMonth() + 1; // getMonth() dimulai dari 0
        const currentYear = today.getFullYear();

        // Query untuk menghitung total pengeluaran (total_spent) per tipe alokasi
        // dan mengambil alokasi budget (allocated_budget) yang aktif.
        const query = `
            SELECT 
                ac.allocation_type, 
                SUM(t.amount) AS total_spent,
                -- Asumsi tabel active_allocations berisi budget aktif per tipe alokasi
                (
                    SELECT a.budget_amount 
                    FROM active_allocations a 
                    WHERE a.student_id = ? 
                      AND a.allocation_type = ac.allocation_type
                    LIMIT 1
                ) AS allocated_budget
            FROM transactions t
            JOIN allocation_categories ac ON t.category_id = ac.id
            WHERE t.student_id = ? 
              AND MONTH(t.transaction_date) = ? 
              AND YEAR(t.transaction_date) = ?
              AND t.type = 'DEBIT' -- Hanya menghitung pengeluaran
            GROUP BY ac.allocation_type;
        `;
        
        // Catatan: Pastikan urutan parameter sesuai dengan tanda tanya (?) di query.
        const [results] = await SQL.Execute(query, [studentId, studentId, currentMonth, currentYear]); 
        
        // Mengembalikan hasil mentah (JSON) ke Gemini untuk dirangkum
        return { success: true, analysis_period: `${currentYear}-${currentMonth}`, data: results }; 

    } catch (error) {
        console.error("Error in get_budget_compliance:", error);
        return { success: false, message: "Gagal mengambil data kepatuhan budget. Periksa skema tabel 'active_allocations'." };
    }
}

// --------------------------------------------------------------------------------------

/**
 * Mengidentifikasi kategori pengeluaran terbesar (Top 5) untuk periode waktu tertentu.
 * @param {number} studentId ID Siswa
 * @param {'current_month' | 'last_month' | 'last_30_days'} timeFrame Periode waktu yang diminta
 * @returns {Promise<object>} Kategori pengeluaran teratas dalam format JSON.
 */
async function get_top_spending_categories(studentId, timeFrame) {
    try {
        const today = new Date();
        let dateFilter;
        let periodDescription;

        // 1. Tentukan Rentang Tanggal berdasarkan timeFrame
        if (timeFrame === 'last_30_days') {
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setDate(today.getDate() - 30);
            dateFilter = `t.transaction_date >= '${thirtyDaysAgo.toISOString().split('T')[0]}'`;
            periodDescription = '30 Hari Terakhir';
        } else if (timeFrame === 'last_month') {
            const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
            dateFilter = `t.transaction_date BETWEEN '${lastMonthStart.toISOString().split('T')[0]}' AND '${lastMonthEnd.toISOString().split('T')[0]}'`;
            periodDescription = 'Bulan Lalu';
        } else { 
            // Default: current_month
            const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            dateFilter = `t.transaction_date >= '${monthStart.toISOString().split('T')[0]}'`;
            periodDescription = 'Bulan Berjalan';
        }

        // 2. Query: Menghitung pengeluaran per kategori, memfilter berdasarkan tanggal, dan mengambil 5 teratas
        const query = `
            SELECT 
                ac.name AS category_name, 
                SUM(t.amount) AS total_spent
            FROM transactions t
            JOIN allocation_categories ac ON t.category_id = ac.id
            WHERE t.student_id = ? 
              AND t.type = 'DEBIT' 
              AND ${dateFilter} 
            GROUP BY ac.name
            ORDER BY total_spent DESC
            LIMIT 5;
        `;

        const [results] = await SQL.Execute(query, [studentId]); 
        
        // Mengembalikan hasil mentah (JSON) ke Gemini
        return { success: true, period: periodDescription, data: results }; 

    } catch (error) {
        console.error("Error in get_top_spending_categories:", error);
        return { success: false, message: "Gagal mengambil kategori pengeluaran teratas." };
    }
}

// 3. Export Fungsi
module.exports = {
    get_budget_compliance,
    get_top_spending_categories
};