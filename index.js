console.log("Starting server");

const SQL = require("./sql");
const Variables = require("./variables");
const Functions = require("./functions");
const Template = require("./template");
const Language = require("./language");
const Route = require("./route");
const GeminiService = require("./gemini");

const Express = require("express");
const Server = Express();
const Session = require("express-session");
const MySQLStore = require("express-mysql-session")(Session);
const BodyParser = require("body-parser");
const FileUpload = require("express-fileupload");

/*
const Cors = require("cors"); // Pastikan sudah npm install cors

// Taruh ini TEPAT setelah inisialisasi Server = Express()
Server.use(Cors({
    origin: true, // Boleh diakses dari mana saja (Frontend Testing)
    credentials: true
})); */

Configure();

async function Configure() {
  await SQL.Initialize();
  await Template.Initialize();
  await Language.Initialize();
  await GeminiService.Initialize();

  const Session_Store = new MySQLStore(SQL.Configuration);

  Server.use(BodyParser.urlencoded({ limit: "50mb", extended: true }));
  Server.use(BodyParser.json({ limit: "50mb" }));
  Server.use(FileUpload());
  Server.set("trust proxy", true);
  Server.use(
    Session({
      // A secret key used to sign the session ID cookie.
      // This should be a long, random string stored in environment variables for security.
      secret: process.env.SESSION_KEY,
      // Prevents saving a session that is "uninitialized" (new but not modified).
      // This reduces server storage usage and helps with privacy compliance.
      saveUninitialized: false,
      cookie: {
        httpOnly: "auto",
        secure: "auto",
        // Cookies saved for 1 year
        maxAge: 12 * 30 * 24 * 60 * 60 * 1000,
      },
      store: Session_Store,
      resave: false,
    })
  );
  Server.use(async (req, res, next) => {
    if (req.session.language == null) {
      let lang = req.acceptsLanguages(Language.Available);

      if (lang && typeof lang == "string") {
        lang = lang.substring(0, 2);
        req.session.language = lang;
      } else {
        req.session.language = "en";
      }
    }

    res.set("language", req.session.language);

    const file = {
      icons: /\.(?:ico)$/i,
      fonts: /\.(?:ttf|woff2)$/i,
      images: /\.(?:png|webp|jpg|jpeg|bmp|svg)$/i,
    };

    for (const [key, value] of Object.entries(file)) {
      if (value.test(req.url) && req.query.cache != "false" && Variables.Production) {
        res.header("Cache-Control", "public, max-age=604800"); // 7 days
      } else if (req.query.cache == "false") {
        res.header("Cache-Control", "no-cache, no-store, must-revalidate");
        res.header("Pragma", "no-cache");
        res.header("Expires", "0");
      }
    }

    req.variables = {};

    next();
  });

  Route(Server);
  Functions.Initialize();
  Functions.Server_Start(Server);

  // ============================================================
  // AUTOMATION: CRON JOB (ROBOT DRIP MINGGUAN)
  // ============================================================
  const CRON_INTERVAL = 60 * 1000; // 60 Detik (1 Menit)

  console.log(`[SCHEDULER] Robot Drip aktif! Akan mengecek jadwal setiap ${CRON_INTERVAL / 1000} detik.`);

  setInterval(async () => {
    try {
      console.log("[SCHEDULER] ⏰ Waktunya cek Drip...");

      // Kita panggil API Drip kita sendiri (Localhost)
      // Pastikan port sesuai dengan yang jalan (biasanya process.env.PORT atau 3000)
      const PORT = process.env.PORT || 1111;

      // Gunakan fetch (bawaan Node.js v18+)
      const response = await fetch(`http://localhost:${PORT}/api/exec/drip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Kita tidak perlu auth session cookie karena endpoint ini harusnya diproteksi admin key
        // Tapi karena di hackathon 'requireAuth' mungkin mengecek session,
        // kita harus pastikan endpoint '/api/exec/drip' bisa diakses.

        // JIKA API ANDA MEMBUTUHKAN LOGIN (Session), Fetch ini akan gagal 401.
        // SOLUSI HACKATHON: Kita bypass auth untuk endpoint drip, atau kita panggil controller langsung.
      });

      const result = await response.json();

      if (result.success && result.data.processed > 0) {
        console.log(`[SCHEDULER] ✅ SUKSES! ${result.data.processed} mahasiswa menerima drip.`);
      } else {
        console.log("[SCHEDULER] 💤 Tidak ada drip yang cair (Mungkin belum waktunya/Saldo kurang).");
      }
    } catch (error) {
      console.error("[SCHEDULER ERROR]", error.message);
    }
  }, CRON_INTERVAL);
}
