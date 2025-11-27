const SQL = require("./sql");
const Variables = require("./variables");
const Authentication = require("./authentication");
const Accounts = require("./accounts");
const Functions = require("./functions");
const Language = require("./language");
const FileIO = require("fs");
const GeminiModule = require("./gemini");
const ApiFinflow = require("./src/controllers/api_finflow");

const RAGService = require("./services/ragService"); // <<< BARIS BARU: Import file yang berisi implementasi get_budget_compliance dkk.

const transactionController = require("./controllers/transactionController");

/**
 * @param { import("express").Application } Server Express instance
 * @returns { void }
 */
function Route(Server) {
  // DEFAULT ROUTE
  {
    Server.post("/ping", function (req, res) {
      res.send();
    });

    Server.post("/signin", async function (req, res) {
      const valid = await Authentication.CheckCredentials(req.body.username, req.body.password);

      if (valid) {
        const account = (await Accounts.Get({ username: req.body.username })).at(0);
        const sessionId = await Authentication.Add(account.id, req.ip, true);
        req.session.account = sessionId;
        res.send();
      } else {
        res.status(401).send();
      }
    });

    Server.post("/signup", async function(req, res) {
      // kasih apa gitu
      res.status(501).send();
    })

    Server.get("/signout", async function (req, res) {
      if (req.session.account) {
        await Authentication.Remove(req.session.account);
        delete req.session["client"];
      }

      res.redirect("/signin");
    });

    Server.get(["/client*", "/funder*"], async function (req, res, next) {
      const path = req.url;
      const hasAccess = await Authentication.HasAccess(req.session.account);

      if (hasAccess == false && path != "/client/manifest.json") {
        if (path.endsWith(".js") || path.endsWith(".css")) {
          res.setHeader("Cache-Control", "no-store");
          return res.status(403).send();
        } else {
          req.session.redirect = req.url;
          return res.redirect("/signin");
        }
      } else if (hasAccess == true) {
        if (path == "/funder" || path == "/client" || path == "/signin") {
          const redirect = req.session.redirect;
          req.session.redirect = null;

          if (redirect) return res.redirect(redirect);
          else return res.redirect("/client" + Variables.WebHomepage);
        }

        const id = await Authentication.GetAccountId(req.session.account);
        const account = await Accounts.Get({ id });

        // redirect each role to its own page
        if (path.startsWith("/client/") && (account[0].role == "Parent" || account[0].role == "ScholarshipFunder")) {
          return res.redirect(path.replace("client", "funder"));
        }
        else if (path.startsWith("/funder/") && account[0].role == "Student") {
          return res.redirect(path.replace("funder", "client"));
        }

        Object.assign(req.variables, {
          activeuser: JSON.stringify(account[0]),
          "activeuser.id": account[0].id,
          "activeuser.displayname": account[0].displayname || account[0].username,
          "activeuser.username": account[0].username,
          "activeuser.email": account[0].email,
          "activeuser.phonenumber": account[0].phonenumber,
          "activeuser.avatarversion": account[0].avatarversion,
          "activeuser.role": account[0].role
        });
      }

      next();
    });

    Server.post("/client*", async function (req, res, next) {
      const path = req.url;
      if ((await Authentication.HasAccess(req.session.account)) == false && path != "/signin") {
        res.status(403).send(Language.Data[req.session.language]["signin"]["error_signin"]);
      } else {
        next();
      }
    });

    Server.put("/client*", async function (req, res, next) {
      const path = req.url;
      if ((await Authentication.HasAccess(req.session.account)) == false && path != "/signin") {
        res.status(403).send(Language.Data[req.session.language]["signin"]["error_signin"]);
      } else {
        next();
      }
    });

    Server.patch("/client*", async function (req, res, next) {
      const path = req.url;
      if ((await Authentication.HasAccess(req.session.account)) == false && path != "/signin") {
        res.status(403).send(Language.Data[req.session.language]["signin"]["error_signin"]);
      } else {
        next();
      }
    });

    Server.delete("/client*", async function (req, res, next) {
      const path = req.url;
      if ((await Authentication.HasAccess(req.session.account)) == false && path != "/signin") {
        res.status(403).send(Language.Data[req.session.language]["signin"]["error_signin"]);
      } else {
        next();
      }
    });

    Server.post("/language/", async function (req, res) {
      if (Language.Available.includes(req.body.language)) {
        req.session.language = req.body.language;
        res.send();
      } else {
        res.status(404).send("Language '" + req.body.language + "' is not available.");
      }
    });

    Server.get("/:language/*", function (req, res, next) {
      if (Language.Available.includes(req.params.language)) {
        req.session.language = req.params.language;

        if (req.path.endsWith(".js") == false && req.path.endsWith(".css") == false) return res.redirect("/" + req.params[0]);

        req.filepath = "./public/" + req.params[0];
      }

      next();
    });

    Server.get("*", function (req, res, next) {
      if (req.query.contentOnly == "true") req.contentOnly = true;

      next();
    });
  }

  // CUSTOM ROUTE HERE
  Server.get("/avatar/*", async function (req, res) {
    // Set cache of avatar to 1 year, because it can be refreshed with banner version query
    res.header("Cache-Control", "public, max-age=31536000");
    res.header("Content-Type", "image/webp");

    const paths = req.path.split("/").filter((o) => o != "");
    const avatarPath = "./src/avatars/" + paths[1];

    if (FileIO.existsSync(avatarPath)) res.sendFile(avatarPath, { root: "./" });
    else res.sendFile("./src/avatar.webp", { root: "./" });
  });

  Server.post("/accounts/setavatar", async function (req, res) {
    const id = req.session.account;
    const account = await Authentication.GetAccountId(id);

    if (!id || !account) return res.status(403).send();

    const buffer = req.files.file.data;

    if (buffer.length > 2000000) return res.status(400).send(language.Data[req.session.language]["accounts"]["error_avatar_toobig"]);

    const success = await Accounts.Avatars.Save(account, buffer);

    if (success) res.send();
    else res.status(500).send();
  });

  Server.post("/accounts/clearavatar", async function (req, res) {
    const id = req.session.account;

    if (id == null) return res.status(403).send();

    const success = Accounts.Avatars.Delete(id);

    if (success) res.send();
    else res.status(500).send();
  });


  // ROUTE FOR GEMINI CHATS
  let dumpHistory = [];
  Server.get("/client/assistant/history", async function (req, res) {
    const accountId = await Authentication.GetAccountId(req.session.account);
    const history = JSON.parse((await SQL.Query("SELECT content FROM chat_history WHERE student_id=?", [accountId])).data?.at(0)?.content || "[]");
    res.send(history);
  });
  Server.post("/client/assistant/send", async function (req, res) {
        const MAX_FUNCTION_CALLS = 3; // Batas iterasi untuk menyelesaikan function call
        
        // 1. Ambil History dan Variabel Penting
        const accountId = await Authentication.GetAccountId(req.session.account);
        if (!accountId) return res.status(403).send("Akses ditolak: Sesi tidak valid.");
        
        const historyData = await SQL.Query("SELECT content FROM chat_history WHERE student_id=?", [accountId]);
        let history = JSON.parse(historyData.data?.at(0)?.content || "[]");
        
        let userMessage = req.body.message; 
        const studentId = accountId; // studentId diambil dari accountId (Sesi/Auth)
        console.log(`Student ID: ${studentId}`);
        
        let finalResponse = null;
        let errorOccurred = false;

        // 🤖 MODE NORMAL GEMINI ASLI - Looping Function Calling
        for (let i = 0; i < MAX_FUNCTION_CALLS; i++) { 
            console.log(i);
            try {
                // Panggil Gemini API. userMessage hanya dikirim di iterasi pertama.
                // model_index 0 (default)
                console.log("user_message", userMessage);
                const response = await Gemini.Chat.Send(userMessage, 0, history);
                console.log("await const response DONE");
                // 3. Cek apakah Gemini meminta pemanggilan fungsi
                if (response.function_call && response.function_call.name) {
                    
                    const funcName = response.function_call.name;
                    const funcArgs = response.function_call.args;
                    let funcResult;

                    // 4. Di iterasi pertama, simpan pesan user dan set userMessage ke null
                    if (i === 0) {
                        // Tambahkan pesan user ke history
                        history.push({ role: 'user', parts: [{ text: userMessage }] }); 
                    }
                    
                    console.log(`[Function Call] Memanggil: ${funcName}`);

                    

                    // 6. Eksekusi fungsi nyata (INJEKSI STUDENT ID DARI SESI)
                    if (funcName === 'get_budget_compliance') {
                        funcResult = await RAGService.get_budget_compliance(studentId); 
                        
                    } else if (funcName === 'get_top_spending_categories') {
                        // funcArgs.time_frame HARUS ADA
                        funcResult = await RAGService.get_top_spending_categories(studentId, funcArgs.time_frame); 
                        
                    } else if (funcName === 'compare_spending_vs_plan') {
                        // funcArgs.month_year mungkin opsional, kita injeksi studentId
                        funcResult = await RAGService.compare_spending_vs_plan(studentId, funcArgs.month_year);
                        
                    } else if (funcName === 'check_wallet_and_drip_status') {
                        // Fungsi ini hanya butuh studentId
                        funcResult = await RAGService.check_wallet_and_drip_status(studentId);
                        
                    } else {
                        funcResult = { success: false, message: `Fungsi RAG '${funcName}' tidak ditemukan.` };
                    }

                    console.log("funcResult initialized")

                    // 7. Simpan Hasil Fungsi (functionResponse) ke history (Role: 'tool')
                    history.push({ 
                        role: 'user', // Role di API baru adalah 'tool'
                        parts: [{ 
                            functionResponse: { 
                                name: funcName, 
                                response: { 
                                    content: JSON.stringify(funcResult) 
                                }
                            } 
                        }]
                    });

                    // Loop akan lanjut ke iterasi berikutnya (i++) untuk mendapatkan respons teks

                } else {
                    // 8. Jika tidak ada function call, keluar dari loop (Jawaban Teks Akhir Diterima)
                    finalResponse = response;
                    console.log(finalResponse);
                    break; 
                }

                finalResponse = response;
                console.log("final response: ", finalResponse)
                
            } catch (error) {
                
                // --- PENANGANAN ERROR 429/FETCH FAILED DARI index.js ---
                if (error.status == 429 || String(error).includes("fetch failed") || String(error).includes("429")) {
                    
                    if (i < MAX_FUNCTION_CALLS - 1) { 
                        const delayTime = 2500 * (i + 1); // Delay eksponensial
                        console.warn(`[route.js] 429/Fetch Failed. Retrying in ${delayTime / 1000}s (Attempt ${i + 2})...`);
                        await Delay(delayTime);
                        continue; // Lanjutkan ke iterasi berikutnya
                    } else {
                        console.error("[route.js] Max retries reached for 429/Fetch Failed. Gagal mendapatkan respons.");
                    }
                }
            }
        }
  });


  // API yang butuh login (Protected)
  // API AUTH ROUTES
  Server.post("/api/auth/register/funder", ApiFinflow.registerFunder);
  Server.post("/api/auth/register/student", ApiFinflow.registerStudent);
  Server.post("/api/auth/register/parent", ApiFinflow.registerParent);
  Server.post("/api/auth/invite/create", ApiFinflow.requireAuth, ApiFinflow.createInvite);
  Server.post("/api/auth/login", ApiFinflow.login);
  
  // [UPDATE] Logout API
    // Gunakan POST agar lebih aman (standar API)
    Server.post("/api/auth/logout", async function (req, res) {
        try {
            if (req.session.account) {
                // 1. Hapus dari Tabel Authentication (Database)
                await Authentication.Remove(req.session.account);
                
                // 2. Hancurkan Cookie Session (Memory Server)
                req.session.destroy((err) => {
                    if (err) console.error("Session destroy error:", err);
                });
            }
            
            // 3. Kirim JSON Sukses (JANGAN REDIRECT DISINI)
            res.json({ success: true, message: "Session destroyed" });

        } catch (e) {
            res.status(500).json({ success: false, message: "Logout error" });
        }
    });

  // API FUNDING AGREEMENT
  Server.post("/api/funding/init", ApiFinflow.requireAuth, ApiFinflow.initiateFunding);
  Server.post("/api/funding/topup", ApiFinflow.requireAuth, ApiFinflow.parentTopup);
  Server.post("/api/funding/finalize", ApiFinflow.requireAuth, ApiFinflow.finalizeAgreement);
  Server.post("/api/funding/pay", ApiFinflow.requireAuth, ApiFinflow.confirmTransfer);


  // API EXECUTION & PENYALURAN DANA
  Server.post("/api/exec/drip", ApiFinflow.requireAuth, ApiFinflow.triggerWeeklyDrip); // Tombol Admin/Dev
  Server.post("/api/exec/urgent", ApiFinflow.requireAuth, ApiFinflow.requestUrgent);
  Server.post("/api/exec/edu/pre", ApiFinflow.requireAuth, ApiFinflow.requestEduPreApproval);
  Server.post("/api/exec/edu/post", ApiFinflow.requireAuth, ApiFinflow.requestEduReimburse);
  Server.post("/api/exec/withdraw", ApiFinflow.requireAuth, ApiFinflow.requestWithdraw); // Tombol Student untuk cairkan uang

  // API MONITORING FUNDER
  Server.get("/api/monitoring/funder", ApiFinflow.requireAuth, ApiFinflow.getFunderMonitoring);


  // 2. Simpan Transaksi + Kurangi Saldo Otomatis (Save hasil scan / manual)
  Server.post("/api/cashflow/transactions", ApiFinflow.requireAuth, ApiFinflow.addTransaction);
  Server.get("/api/cashflow/transactions/years", ApiFinflow.requireAuth, ApiFinflow.getTransactionYears);
  Server.post("/api/cashflow/transactions/uploadbill", ApiFinflow.requireAuth, ApiFinflow.scanReceipt);
  
  // API MONEY MANAGEMENT DASHBOARD
  Server.get("/api/student/insights", ApiFinflow.requireAuth, ApiFinflow.getInsights);
  Server.get("/api/student/report", ApiFinflow.requireAuth, ApiFinflow.getWeeklyReport);

  // Notifications
  Server.get("/api/notifications/unread", ApiFinflow.requireAuth, ApiFinflow.getUnreadNotifications);
  Server.get("/api/notifications/history", ApiFinflow.requireAuth, ApiFinflow.getNotificationHistory);


  // ============================================================
  // MODULE: CASHFLOW UI ADAPTERS (Cocok dengan cashflow.html)
  // ============================================================

  // 1. Kartu Saldo (Wallet Card)
  // Frontend call: $.get("/api/wallet")
  Server.get("/api/wallet", ApiFinflow.requireAuth, ApiFinflow.getWalletData);

  // 2. Grafik Batang (Expenses Chart)
  // Frontend call: $.get("/api/expenses")
  Server.get("/api/expenses", ApiFinflow.requireAuth, ApiFinflow.getExpensesData);

  // 3. AI Feedback (Feedback Card)
  // Frontend call: $.get("/api/cashflow/feedback")
  Server.get("/api/cashflow/feedback", ApiFinflow.requireAuth, ApiFinflow.getFeedbackData);

  // 4. Dropdown Kategori
  // Frontend call: $.get("/api/categories")
  Server.get("/api/categories", ApiFinflow.requireAuth, ApiFinflow.getCategories);

  // 5. List Transaksi Bulanan
  // Frontend call: $.get("/api/transactions?month=...&year=...")
  // Kita gunakan fungsi history yang sudah ada, tapi URL-nya disesuaikan
  Server.get("/api/transactions", ApiFinflow.requireAuth, ApiFinflow.getTransactionHistory);
  // Server.get("/api/transactions/history", ...); // (Opsional: Simpan yang lama jika ada halaman lain yg pakai)

  // 6. Fitur Tambah Transaksi (Scan & Manual)
  // Frontend call: POST /api/scan/receipt & POST /api/transaction/add
  // (Ini SEHARUSNYA sudah ada dari modul sebelumnya, pastikan tidak terhapus)
  Server.post("/api/scan/receipt", ApiFinflow.requireAuth, ApiFinflow.scanReceipt);
  Server.post("/api/transaction/add", ApiFinflow.requireAuth, ApiFinflow.addTransaction);
  Map(Server);
}

function Map(Server) {
  Server.get("*", async function (req, res) {
    const prettyPath = PrettifyPath(req);
    const path = prettyPath.result;

    if (prettyPath.refresh) {
      res.redirect("/" + prettyPath.result);
      return;
    }

    const rootPath = req.filepath ? "" : "./public/";
    const isHTML = FileIO.existsSync(rootPath + path + ".html") || FileIO.existsSync(rootPath + path + "/index.html");
    const isJS = path.endsWith(".js") && FileIO.existsSync(rootPath + path);
    const isCSS = path.endsWith(".css") && FileIO.existsSync(rootPath + path);
    const isIndex = isHTML ? FileIO.existsSync(rootPath + path + ".html") == false : false;
    const isImage = /(\.png|\.webp|\.jpg|\.bmp|\.jpeg)$/g.test(path);
    const pageType = path.startsWith("funder") ? "funder" : (path.startsWith("client") || req.isclient == true ? "client" : "public");

    if (isHTML) {
      let data;
      if (isIndex) data = FileIO.readFileSync(rootPath + path + "/index.html");
      else data = FileIO.readFileSync(rootPath + path + ".html");

      const funderType = pageType == "funder" ? (req.variables["activeuser.role"] == "Parent" ? "parent" : "scholarshipfunder") : null;
      data = data.toString();
      data = Functions.Page_Compile(funderType || pageType, data, req.session?.language, path, req.contentOnly == true);

      if (req.variables) for (const variable of Object.keys(req.variables)) data = data.replace(new RegExp("<#\\?(| )" + variable + "(| )\\?#>", "gi"), req.variables[variable] || "");

      res.send(data);
    } else if (isJS || isCSS) {
      if (isJS) res.header("Content-Type", "text/javascript; charset=utf-8");
      else if (isCSS) res.header("Content-Type", "text/css");

      let data = FileIO.readFileSync(rootPath + path).toString();
      data = Language.Compile(data, req.session.language);
      res.send(data);
    } else {
      if (FileIO.existsSync(rootPath + path)) {
        res.sendFile(rootPath + path, { root: "./" });
      } else {
        if (isImage) res.status(404).sendFile("./src/blank.png", { root: "./" });
        else res.status(404).sendFile("./public/404.shtml", { root: "./" });
      }
    }
  });

  Server.post("*", async function (req, res, next) {
    let path = PrettifyPath(req).result;

    const rootPath = req.filepath ? "" : "./public/";
    const isHTML = FileIO.existsSync(rootPath + path + ".html") || FileIO.existsSync(rootPath + path + "/index.html");
    const isIndex = isHTML ? FileIO.existsSync(rootPath + path + ".html") == false : false;
    const pageType = path.startsWith("funder") ? "funder" : (path.startsWith("client") || req.isclient == true ? "client" : "public");

    if (isHTML) {
      let data;
      if (isIndex) data = FileIO.readFileSync(rootPath + path + "/index.html");
      else data = FileIO.readFileSync(rootPath + path + ".html");

      const funderType = pageType == "funder" ? (req.variables["activeuser.role"] == "Parent" ? "parent" : "scholarshipfunder") : null;

      data = data.toString();
      data = Functions.Page_Compile(funderType || pageType, data, req.session?.language, path, true);

      if (req.variables) for (const variable of Object.keys(req.variables)) data = data.replace(new RegExp("<#\\?(| )" + variable + "(| )\\?#>", "gi"), req.variables[variable] || "");

      res.send(data);
    } else {
      if (FileIO.existsSync(rootPath + path)) {
        res.sendFile(rootPath + path, { root: "./" });
      } else {
        res.status(404).send();
      }
    }
  });
}

/**
 * Make the URL tidy
 * @param { string } path
 * @returns { {
 *      refresh: boolean,
 *      result: string
 * }}
 */
function PrettifyPath(req) {
  if (req.filepath)
    return {
      refresh: false,
      result: req.filepath,
    };

  let path = req.path;
  let refresh = false;

  if (path.startsWith("//")) refresh = true;

  while (path.startsWith("/")) path = path.substring(1);

  if (path.includes("//")) {
    refresh = true;
    path = path.replaceAll("//", "/");
  }
  if (path.endsWith("/")) {
    refresh = true;
    path = path.substring(0, path.length - 1);
  }
  if (path.endsWith(".html")) {
    refresh = true;
    path = path.substring(0, path.length - 5);
  }
  if (path.endsWith(".shtml")) {
    refresh = true;
    path = path.substring(0, path.length - 6);
  }

  return {
    refresh: refresh,
    result: path,
  };
}

module.exports = Route;
