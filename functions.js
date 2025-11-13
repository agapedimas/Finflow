const SQL = require("./sql");
const Variables = require("./variables");
const Template = require("./template");
const Language = require("./language");
const Axios = require("axios");

const Functions =
{
	/**
	 * Initializes ping for server
	 * @returns { void }
	 */
	Initialize: function()
	{
	},
	Administrator_Log: async function(userid, type, from, to, reference)
	{
		let time = Date.now().toString();

		return new Promise(function(resolve, reject)
		{
			SQL.Connection.query("INSERT INTO auditlog (`user`, `from`, `to`, `reference`, `type`, `time`) VALUES (?, ?, ?, ?, ?, ?);",
			[userid, from, to, reference, type, time], 
			function(err)
			{
				if (err)
					console.error(err);
				
				resolve();
			})
		});
	},
	Administrator_GetAllLog: async function()
	{
		return new Promise(function(resolve, reject)
		{
			SQL.Connection.query("SELECT * FROM auditlog ORDER BY time DESC LIMIT 100", 
			async function(err, row)
			{
				if (err)
				{
					console.error(err);
					resolve([]);
				}
				else if (row && row.length)
				{
					let result = [];
					for (let i = 0; i < row.length; i++)
					{
						let log = "";
						let user = await Functions.Authentication_GetUserDetails(row[i].user);

						if (i > 0)
							if (
								row[i].user == row[i - 1].user && 
								row[i].type == row[i - 1].type && 
								row[i].reference == row[i - 1].reference &&
								row[i].from == row[i - 1].from &&
								row[i].to == row[i - 1].to &&
								row[i - 1].time - row[i].time < 1000 * 60 * 5
							)
								continue;

						if (row[i].type == "create")			log = "created a challenge '" + row[i].from + "'";
						else if (row[i].type == "update")		log = "updated a challenge '" + row[i].from + "'";
						else if (row[i].type == "rename")		log = "renamed a challenge from '" + row[i].from + "' to '" + row[i].to +"'";
						else if (row[i].type == "delete")		log = "deleted a challenge '" + row[i].from + "'";
						else if (row[i].type == "view")			log = "viewed a challenge '" + row[i].from + "'";
						else if (row[i].type == "signin")		log = "signed in";
						else if (row[i].type == "signout")		log = "signed out";
						else									log = row[i];

						result.push({ 
							time: row[i].time,
							text: log,
							user: 
							{ 
								nickname: user.nickname,
								username: user.username,
								id: user.id,
							},
							reference: row[i].reference
						});
					}

					resolve(result);
				}
				else
				{
					resolve([]);
				}
			});
		});
	},
	/**
	 * @param { string } type Type of page, client, games, or general
	 * @param { string } body Body of page
	 * @param { string } language Preferred language of page
	 * @param { string } path Path of page
	 * @param { boolean } contentOnly Compile to complete HTML or just content
	 * @returns { string } Compiled body of page
	 */
	Page_Compile: function (type = "public", body, language = "en", path, contentOnly = false)
	{
		const ApplyTemplate = function(type, body)
		{
			body =
				"<!DOCTYPE html>" +
					"<html " + Template.Data.Configuration + ">" +
						"<head>" +
							(type == "client" ? Template.Data.Head_Client : Template.Data.Head) +
						"</head>" +
						"<body>" +
							(type == "client" ? Template.Data.Body_Client : Template.Data.Body) +
							Template.Data.Title +
						"</body>" +
					"</html>";

			return body;
		}

		const content = body;

		if (contentOnly == false)
			body = ApplyTemplate(type, body);

		body = 
			body
				.replace("<#? content ?#>", content)
				.replace("<#? navigation ?#>", (type == "client" ? Template.Data.Navigation_Client : Template.Data.Navigation))
				.replace("<#? appsettings ?#>", Template.Data.Settings)
				.replaceAll("<#? applang ?#>", language)
				.replaceAll("<#? apptitle ?#>", Variables.AppTitle)
				.replaceAll("<#? apptitleadmin ?#>", Variables.AppTitleAdmin)
				.replaceAll("<#? appicon ?#>", Variables.AppIcon)
				.replaceAll("<#? appassets ?#>", Variables.AppAssets)
				.replaceAll("<#? apphomepage ?#>", Variables.WebHomepage)
				.replaceAll("<#? apphost ?#>", Variables.WebHost)
				.replaceAll("<#? appversion ?#>", Variables.Version)

		let hrefLang = "<link rel='alternate' hreflang='x-default' href='" + Variables.WebHost + "/" + path + "'>";
		for (let language of Language.Available)
			hrefLang += "<link rel='alternate' hreflang='" + language + "' href='" + Variables.WebHost + "/" + language + "/" + path + "'>";

		body = body.replaceAll("<#? hreflang ?#>", hrefLang);
		body = Language.Compile(body, language);

		language_prefix = body.match(/<\$(.*?)\/>/g);
		if (language_prefix != null) 
		{
			for (let prefix of language_prefix)
			{
				let page = prefix.substring(2, prefix.length - 2).split(" ")[1];
				let param = prefix.substring(2, prefix.length - 2).split(" ")[2];
				let replacement = prefix;

				if (Language.Data[language][page] != null && Language.Data[language][page][param] != null)
					replacement = Language.Data[language][page][param];
					
				body = body.replaceAll(prefix, replacement);
			}
		}

		const pageVariables = 
		[
			{ prefix: "ad-title", replacement: "page_title", default: Variables.AppTitle },
			{ prefix: "ad-name", replacement: "page_name", default: Variables.AppTitle },
			{ prefix: "ad-desc", replacement: "page_description" },
			{ prefix: "ad-keyword", replacement: "page_keywords" },
			{ prefix: "ad-thumbnail", replacement: "page_thumbnail" }
		];
		
		for (const variable of pageVariables)
		{
			variable.default = variable.default == null ? "" : variable.default;
			let pattern = new RegExp("<" + variable.prefix + ">(.*?)</" + variable.prefix + ">", "g");
			let result = pattern.exec(body);
			let elements = body.match(pattern);

			if (result != null && result[1].trim() != "")
			{
				body = body.replaceAll("<#? " + variable.replacement + " ?#>", result[1])
				for (let element of elements)
					body = body.replaceAll(element, "");
			}
			else
				body = body.replaceAll("<#? " + variable.replacement + " ?#>", variable.default)
		}

		return body;
	},
	/**
	 * Listens to all registered routes
	 * @param { import("express").Application } Server Express instance
	 * @returns { void }
	 */
	Server_Start: function (Server)
	{
		Server.listen(1111, () =>  
		{
			if (Variables.Production)
			{
				console.log("Server is ready");
			}
			else
			{
				console.log("Server for development is ready. Go to http://localhost:1111");
				console.error("This server is running under development mode. Please switch to production as soon as possible since it's vulnerable.");
			}
		});
	}
}

module.exports = Functions;