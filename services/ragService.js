const SQL = require("../sql"); // SESUAIKAN PATH KE MODUL KONEKSI DATABASE ANDA

// Catatan: Terdapat duplikasi fungsi get_budget_compliance, saya akan menganggap yang pertama sebagai versi yang benar.

/**
 * Menganalisis total pengeluaran Student untuk bulan berjalan berdasarkan alokasi 
 * (Needs, Wants, Education) dan membandingkannya dengan budget yang dialokasikan.
 * @param {string} studentId ID Siswa
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
                COALESCE(SUM(t.amount), 0) AS total_spent, -- Gunakan COALESCE untuk 0 jika tidak ada transaksi
                fa.total_allocation AS allocated_budget
            FROM funding_allocation fa
            JOIN funding f ON fa.funding_id = f.funding_id
            JOIN allocation_categories ac ON fa.category_id = ac.id
            LEFT JOIN transactions t ON t.student_id = f.student_id
                AND t.category_id = fa.category_id
                AND t.type = 'Expense'
                AND MONTH(t.transaction_date) = ? 
                AND YEAR(t.transaction_date) = ?
            WHERE f.student_id = ? 
                AND ac.allocation_type IN ('Needs', 'Wants', 'Education')
                AND f.status = 'Active' -- Hanya ambil funding yang aktif
            GROUP BY ac.allocation_type, fa.total_allocation
            ORDER BY ac.allocation_type;
        `;
        // PERHATIAN: Perbaiki urutan parameter di sini. Query butuh (Bulan, Tahun, StudentId)
        const result = await SQL.Query(query, [currentMonth, currentYear, studentId]); 
        const results = result.data;
        
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
 * @param {string} studentId ID Siswa
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
            dateFilter = `t.transaction_date BETWEEN '${lastMonthStart.toISOString().split('T')[0]} 00:00:00' AND '${lastMonthEnd.toISOString().split('T')[0]} 23:59:59'`;
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
                ac.category_name AS category_name, 
                SUM(t.amount) AS total_spent
            FROM transactions t
            JOIN allocation_categories ac ON t.category_id = ac.id
            WHERE t.student_id = ? 
              AND t.type = 'Expense' 
              AND ${dateFilter} 
            GROUP BY ac.category_name
            ORDER BY total_spent DESC
            LIMIT 5;
        `;

        const result = await SQL.Query(query, [studentId]);
        const results = result.data;
        
        // Mengembalikan hasil mentah (JSON) ke Gemini
        return { success: true, period: periodDescription, data: results }; 

    } catch (error) {
        console.error("Error in get_top_spending_categories:", error);
        return { success: false, message: "Gagal mengambil kategori pengeluaran teratas." };
    }
}

// --------------------------------------------------------------------------------------

/**
 * Membandingkan pengeluaran aktual Student dengan rencana anggaran (budget_plan).
 * @param {string} studentId ID Siswa
 * @param {string} [month_year] Bulan dan Tahun (YYYY-MM). Default: bulan saat ini.
 * @returns {Promise<object>} Data perbandingan dalam format JSON.
 */
async function compare_spending_vs_plan(studentId, month_year) {
    try {
        // Tentukan Bulan/Tahun saat ini atau dari parameter
        const date = month_year ? new Date(month_year) : new Date();
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // getMonth() dimulai dari 0

        // Query: Menggabungkan data PLAN (budget_plan) dan ACTUAL (transactions) berdasarkan kategori dan bulan
        const query = `
            SELECT
                ac.category_name,
                -- Rencana (Plan)
                COALESCE(SUM(bp.amount * bp.quantity), 0) AS total_planned,
                -- Aktual (Actual Spending)
                COALESCE(SUM(t.amount), 0) AS total_actual
            FROM allocation_categories ac
            -- Gabungkan dengan data Rencana Budget (Budget Plan)
            LEFT JOIN budget_plan bp ON ac.id = bp.category_id 
                AND bp.planner_id = ? 
                AND bp.month = ? 
                AND bp.year = ?
            -- Gabungkan dengan data Transaksi Aktual (Expense)
            LEFT JOIN transactions t ON ac.id = t.category_id 
                AND t.student_id = ? 
                AND t.type = 'Expense' 
                AND MONTH(t.transaction_date) = ? 
                AND YEAR(t.transaction_date) = ?
            WHERE bp.planner_id IS NOT NULL OR t.student_id IS NOT NULL -- Pastikan hanya kategori yang ada rencana/pengeluaran yang muncul
            GROUP BY ac.category_name
            HAVING total_planned > 0 OR total_actual > 0
            ORDER BY ac.category_name;
        `;
        
        // Gunakan parameter yang berulang sesuai urutan di query
        const params = [studentId, month, year, studentId, month, year];
        const result = await SQL.Query(query, params);
        const results = result.data;

        if (results.length === 0) {
            return { 
                success: true, 
                message: `Tidak ada data rencana anggaran atau pengeluaran yang tercatat untuk ${year}-${month}.` 
            };
        }

        return { 
            success: true,
            analysis_period: `${year}-${month.toString().padStart(2, '0')}`,
            comparison_data: results
        };

    } catch (error) {
        console.error("Error executing compare_spending_vs_plan:", error);
        return { success: false, message: "Gagal mengambil data perbandingan rencana dan pengeluaran." };
    }
}

// --------------------------------------------------------------------------------------

/**
 * Memberikan informasi real-time mengenai saldo dompet Student dan status drip/funding aktif.
 * @param {string} studentId ID Siswa
 * @returns {Promise<object>} Status dompet dan drip dalam format JSON.
 */
async function check_wallet_and_drip_status(studentId) {
    try {
        // Query: Mengambil Saldo, Funding Aktif, Drip terakhir, dan Total dana bulanan.
        const query = `
            SELECT
                -- Saldo
                (SELECT balance FROM accounts_student WHERE id = ?) AS current_balance,
                -- Detail Funding Aktif
                F.total_period_fund,
                F.status AS funding_status,
                -- Detail Drip
                SC.last_drip_date,
                SC.total_drip_count,
                (SELECT GROUP_CONCAT(DISTINCT drip_frequency) FROM funding_allocation WHERE funding_id = F.funding_id) AS drip_frequency
            FROM funding F
            LEFT JOIN smart_contracts SC ON F.funding_id = SC.funding_id
            WHERE F.student_id = ? 
                AND F.status = 'Active'
            LIMIT 1;
        `;
        
        const result = await SQL.Query(query, [studentId, studentId]);
        const results = result.data;

        if (results.length === 0 || !results[0].current_balance) {
            return { 
                success: false, 
                message: "Data akun atau perjanjian pendanaan aktif tidak ditemukan." 
            };
        }
        
        // Memastikan hasil digabungkan dengan saldo
        const combinedData = {
            current_balance: results[0].current_balance,
            funding_details: results[0].funding_status ? results[0] : null // Sertakan detail funding jika ada
        };

        return { success: true, data: combinedData };

    } catch (error) {
        console.error("Error executing check_wallet_and_drip_status:", error);
        return { success: false, message: "Gagal mengambil data saldo dan status pendanaan." };
    }
}

// --------------------------------------------------------------------------------------

// 3. Export Semua Fungsi yang Sudah Didefinisikan
module.exports = {
    get_budget_compliance,
    get_top_spending_categories,
    compare_spending_vs_plan, // <-- BARU
    check_wallet_and_drip_status // <-- BARU
};