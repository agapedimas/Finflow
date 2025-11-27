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

        const tableFilePath = "./sql/tables/";
        const tables = FileIO.readdirSync(tableFilePath);
        tables.unshift("/../initialize.sql");
        tables.push("/../seeds.sql");

        for (const table of tables) {
          const file = FileIO.readFileSync(tableFilePath + table);
          const queries = file
            .toString()
            .split(/(?<!\\);/g)
            .map((o) => o.replace(/\\;/g, ";").trim())
            .filter((o) => o != "");

          for (const query of queries) {
            const result = await SQL.Query(query);
            if (result.success == false) break;
          }
        }

        resolve();
      });
    });
  },
};

module.exports = SQL;
