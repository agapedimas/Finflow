// DUMMIES

// api/notifications/history
const DUMMY_NOTIFICATIONS = [
    {
        "id": "1",
        // "studentId": "student_01",  -> yg ini gaperlu ya
        "title": "Uang Masuk 💸",
        "message": "Drip mingguan Rp 750.000 berhasil dicairkan.",
        "isRead": false,
        "type": "success" || "warning", // tolong di lowercase aja, ikutin konvensi js
        "createdAt": 1763798016000 // timestamp sql '2025-11-22 14:53:36' tolong diubah jadi UNIX timestamp, pake `new Date("2025-11-22 14:53:36") * 1` aja
    },
    {
        "id": "2",
        // "studentId": "student_01",  -> yg ini gaperlu ya
        "title": "Uang Keluar Lagi Jir 💸",
        "message": "Drip mingguan Rp 2.750.000 berhasil dipinjolkan.",
        "isRead": true,
        "type": "warning", // tolong di lowercase aja, ikutin konvensi js
        "createdAt": 1763193216000 // timestamp sql '2025-11-22 14:53:36' tolong diubah jadi UNIX timestamp, pake `new Date("2025-11-22 14:53:36") * 1` aja
    },
    {
        "id": "3",
        // "studentId": "student_01",  -> yg ini gaperlu ya
        "title": "Uang Keluar Lagi Jir 3 💸",
        "message": "Drip mingguan Rp 2.350.000 berhasil dicairkan.",
        "isRead": true,
        "type": "success", // tolong di lowercase aja, ikutin konvensi js
        "createdAt": 1763193216000 // timestamp sql '2025-11-22 14:53:36' tolong diubah jadi UNIX timestamp, pake `new Date("2025-11-22 14:53:36") * 1` aja
    }
]

const DUMMY_CURRENTPROGRAM = {
    "isJoined": true,
    "funderId": "fund1",
    "displayName": "Djarum Super",
    "activeUntil": 1767225600000
}

const DUMMY_WALLET = {
    "balance": 3400000,
    "allocations": [
        {
            "categoryId": "0",
            "categoryName": "Education",
            "balance": 2500000 
        },
        {
            "categoryId": "1",
            "categoryName": "Wants",
            "balance": 500000 
        },
        {
            "categoryId": "2",
            "categoryName": "Needs",
            "balance": 400000 
        }
    ]
}

const DUMMY_RECOMMENDATIONS = [
    {
        "id": "1",
        "text": "Plan your budget before the October ends.",
        "cta": "Go",
        "url": "/client/budgetplan/"
    },
    {
        "id": "2",
        "text": "Overbudget? Ask assistant with no worries.",
        "cta": "Ask",
        "url": "/client/assistant/"
    },
    {
        "id": "3",
        "text": "Need comfy food? Find places to eat.",
        "cta": "Check",
        "url": "https://maps.google.com"
    },
    {
        "id": "4",
        "text": "Activate 2FA to enhance security.",
        "cta": "Begin",
        "url": "/client/settings"
    }
]

const DUMMY_EXPENSES = {      
    "total": 1960545.23,           
    "summary": [450123, 250000.23, 120322, 384200, 393000, 213900, 249000]
}

const DUMMY_FEEDBACK = {
    "isAvailable": true,
    "severity": "caution" || "danger" || "normal",
    "content": "You're spending money too much today! Consider to readjust your budget." || "You're doing great! Keep up the good work."
}

const DUMMY_CATEGORIES = [
    {
        "id": "0",
        "name": "Wants",
        "balance": 2500000
    },
    {
        "id": "1",
        "name": "Needs",
        "balance": 500000 
    },
    {
        "id": "2",
        "name": "Education",
        "balance": 400000 
    }
]

const DUMMY_YEARS = [2024, 2025]

// api/transactions/?month=...&year=...
const DUMMY_MONTHLY_REPORT = [
    {
        "id": "tx_budi_edu",
        //"studentId": student_01 -> ini gausah ya
        "transactionDate": 1763139600000, // timestamp sql '2025-11-22 14:53:36' tolong diubah jadi UNIX timestamp, pake `new Date("2025-11-22 14:53:36") * 1` aja
        "type": "expense" || "income" || "dripIn", // penulisan kapital ikutin konvensi js aja
        "rawDescription": "Beli Buku Coding",
        "isVerifiedByAI": true,
        "isUrgentWithdrawal": false,
        "urgencyReason": null,
        "amount": 150000.00,
        "categoryId": "0"
    },
    {
        "id": "tx_budi_in",
        //"studentId": student_01 -> ini gausah ya
        "transactionDate": 1763139600000, // timestamp sql '2025-11-22 14:53:36' tolong diubah jadi UNIX timestamp, pake `new Date("2025-11-22 14:53:36") * 1` aja
        "type": "dripIn", // penulisan kapital ikutin konvensi js aja
        "rawDescription": "Minggu 1: Needs + Wants",
        "isVerifiedByAI": true,
        "isUrgentWithdrawal": false,
        "urgencyReason": null,
        "amount": 750000.00,
        "categoryId": null
    },
    {
        "id": "tx_budi_out1",
        //"studentId": student_01 -> ini gausah ya
        "transactionDate": 1763119600000, // timestamp sql '2025-11-22 14:53:36' tolong diubah jadi UNIX timestamp, pake `new Date("2025-11-22 14:53:36") * 1` aja
        "type": "expense", // penulisan kapital ikutin konvensi js aja
        "rawDescription": "Makan Siang Warteg",
        "isVerifiedByAI": false,
        "isUrgentWithdrawal": false,
        "urgencyReason": null,
        "amount": 25000.00,
        "categoryId": "1"
    },
    {
        "id": "tx_siti_urgent",
        //"studentId": student_02 -> ini gausah ya
        "transactionDate": 1762139600000, // timestamp sql '2025-11-22 14:53:36' tolong diubah jadi UNIX timestamp, pake `new Date("2025-11-22 14:53:36") * 1` aja
        "type": "dripIn", // penulisan kapital ikutin konvensi js aja
        "rawDescription": "Dana Darurat: Sakit Gigi",
        "isVerifiedByAI": true,
        "isUrgentWithdrawal": true,
        "urgencyReason": "Sakit gigi butuh ke dokter segera",
        "amount": 500000.00,
        "categoryId": "1"
    }
]

const DUMMY_ALLOCATIONS_FUNDER = {
    "name": "Djarum Super",
    "total": 3400000,
    "allocations": [
        {
            "categoryId": "0",
            "categoryName": "Education",
            "total": 2500000 
        },
        {
            "categoryId": "1",
            "categoryName": "Wants",
            "total": 500000 
        },
        {
            "categoryId": "2",
            "categoryName": "Needs",
            "total": 400000 
        }
    ]
}
const DUMMY_ALLOCATIONS_PARENT = {
    "name": "Agus Parent",
    "total": 3410000,
    "allocations": [
        {
            "categoryId": "0",
            "categoryName": "Education",
            "total": 2500000 
        },
        {
            "categoryId": "1",
            "categoryName": "Wants",
            "total": 500000 
        },
        {
            "categoryId": "2",
            "categoryName": "Needs",
            "total": 400000 
        }
    ]
}

const DUMMY_MONTHLY_PLAN = {
    "month": "November",      
    "year": 2025,             
    "allocated": 2000000,
    "categories": [
        {
            "categoryId": "0",
            "categoryName": "Education",
            "total": 2500000 
        },
        {
            "categoryId": "1",
            "categoryName": "Wants",
            "total": 500000 
        },
        {
            "categoryId": "2",
            "categoryName": "Needs",
            "total": 400000 
        }
    ],
    "stuffs": [
        {
            "id": "ggasfakjfha",
            "name": "Bawang",
            "amount": 15000,
            "quantity": 2,
            "status": "pending",
            "feedback": null,
            "categoryId": "1"
        },
        {
            "id": "ggasfakjfha",
            "name": "Makan siang",
            "amount": 25000,
            "quantity": 20,
            "status": "approved",
            "feedback": "Sangat bagus untuk kebutuhan sehari-hari",
            "categoryId": "1"
        },
        {
            "id": "ggasfakjfha",
            "name": "Bayar SKS",
            "amount": 150000,
            "quantity": 1,
            "status": "rejected",
            "feedback": "Harga melebihi 50% total budget bulanan kamu.",
            "categoryId": "0"
        },
    ]
};

const DUMMY_PROGRAMS = [
    {
        "name": "Program Beasiswa Semester Ganjil 25-26",
        "fundingId": "fund_budi",
        "funderId": "funder_01",
        "totalPeriodFund": 6000000.00,
        "startDate": "2025-01-01",
        "endDate": "2026-01-02",
        "status": "Active",
        "collectedAmount": 0,
        "joinedStudents": [
            {
                "id": "student-12345",
                "name": "Budi Santoso"
            }
        ]
    }
]