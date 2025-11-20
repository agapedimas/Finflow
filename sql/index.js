const FileIO = require("fs");
const MySQL = require("mysql2");
const Delay = (msec) => new Promise((resolve) => setTimeout(resolve, msec));

const SQL = {
  Configuration: {
    connectionLimit: 10,
    host: "localhost",
    port: 3306,
    user: process.env.SQL_USERNAME,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DATABASE,
    charset: "utf8mb4",
    multipleStatements: true,
    typeCast: function (field, next) {
      if (field.type == "JSON") return JSON.parse(field.string());

      return next();
    },
  },
  /** @type { MySQL.Connection } */
  Connection: undefined,
  /**
   * @param { string } query
   * @param { Array<string> } values
   * @returns { Promise<{
   *      success: boolean,
   *      data: Array<object> | {
   *          affectedRows: number,
   *          changedRows: number,
   *          fieldCount: number,
   *          insertId: any,
   *          message: string
   *      }
   * }> }
   */
  Query: function (query, values) {
    return new Promise(function (resolve) {
      SQL.Connection.query(query, values, function (error, results) {
        let success = false;
        let data = null;

        if (error) {
          console.error(error.sqlMessage, JSON.parse(JSON.stringify(error)));
          return resolve({ success, data });
        }

        success = true;
        const type = results.constructor.name;

        if (type == "RowPacket") {
          if (results && results.length) data = results;
        } else {
          data = results;
        }

        return resolve({ success, data });
      });
    });
  },
  /** @returns { Promise<void> } */
  Initialize: function (occurence = 1) {
    return new Promise(function (resolve) {
      SQL.Connection = MySQL.createConnection(SQL.Configuration);
      SQL.Connection.on("error", async function (err) {
        if (err.code === "PROTOCOL_CONNECTION_LOST") await SQL.Initialize();
        else if (err.code === "ETIMEDOUT") await SQL.Initialize();
        else if (err.code === "UND_ERR_CONNECT_TIMEOUT") await SQL.Initialize();
        else throw err;
      });
      SQL.Connection.connect(async function (err) {
        if (err) {
          if (err.code == "ECONNREFUSED" && occurence < 60) {
            await Delay(1000);
            return resolve(await SQL.Initialize(occurence + 1));
          } else {
            console.error("Error when connecting to database:\n", err);
            return process.exit();
          }
        }

        await SQL.Query("SET FOREIGN_KEY_CHECKS = 0");

        const sqlFiles = ["./sql/initialize.sql", "./sql/financial_tables.sql", "./sql/seed_data.sql"];

        for (const filePath of sqlFiles) {
          if (FileIO.existsSync(filePath)) {
            console.log(`   📂 Mengeksekusi: ${filePath}`);

            // BACA FILE UTUH
            const fileContent = FileIO.readFileSync(filePath, "utf-8");

            // KIRIM FILE UTUH KE MYSQL (Biarkan MySQL yang memprosesnya)
            const result = await SQL.Query(fileContent);

            if (!result.success) {
              console.error(`      ❌ GAGAL DI FILE INI!`);
              console.error(`      Pesan: ${result.error.sqlMessage}`);
              // Jangan lanjut jika ada error fatal di struktur tabel
              process.exit(1);
            } else {
              console.log(`      ✅ Berhasil dieksekusi.`);
            }
          } else {
            console.warn(`      ⚠️ File tidak ditemukan: ${filePath}`);
          }
        }

        await SQL.Query("SET FOREIGN_KEY_CHECKS = 1");

        console.log("🎉 [DATABASE] Inisialisasi Database Selesai.\n");
        resolve();
      });
    });
  },
};

module.exports = SQL;
