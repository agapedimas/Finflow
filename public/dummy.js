// DUMMIES

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
        "name": "Education",
        "balance": 2500000 
    },
    {
        "id": "1",
        "name": "Wants",
        "balance": 500000 
    },
    {
        "id": "2",
        "name": "Needs",
        "balance": 400000 
    }
]

const DUMMY_YEARS = [2024, 2025]

const DUMMY_MONTHLY_REPORT = [
    {
        "id": "ggasfakjfha",
        "timestamp": 1763139600000,
        "isExpenses": true,
        "name": "Pembayaran Biaya SKS",
        "price": 1500000,
        "categoryId": "category2"
    },
    {
        "id": "aksfhawi2",
        "timestamp": 1763053200000,
        "isExpenses": false,
        "name": "Income from Parent",
        "price": 2000000,
        "categoryId": null
    },
    {
        "id": "smfnamsa2",
        "timestamp": 1763053200000,
        "isExpenses": true,
        "name": "Ayam Goreng",
        "price": 12500,
        "categoryId": "category1"
    },
    {
        "id": "ashjjasd",
        "timestamp": 1762880400000,
        "isExpenses": true,
        "name": "Bawang",
        "price": 25000,
        "categoryId": "category1"
    }
]

const DUMMY_MONTHLY_PLAN = {
    "month": "November",      
    "year": 2025,             
    "allocated": 2000000,  
    "stuffs": [
        {
            "id": "ggasfakjfha",
            "name": "Bawang",
            "price": 15000,
            "amount": 2,
            "categoryId": "1"
        },
        {
            "id": "ggasfakjfha",
            "name": "Makan siang",
            "price": 25000,
            "amount": 20,
            "categoryId": "1"
        },
        {
            "id": "ggasfakjfha",
            "name": "Bayar SKS",
            "price": 150000,
            "amount": 1,
            "categoryId": "0"
        },
    ]
};