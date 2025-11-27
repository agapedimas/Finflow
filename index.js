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

async function Configure()
{
	await SQL.Initialize();
    await Template.Initialize();
	await Language.Initialize();
	await GeminiService.Initialize();
	
    const Session_Store = new MySQLStore(SQL.Configuration);
    
    Server.use(BodyParser.urlencoded({ limit: "50mb", extended: true }));
    Server.use(BodyParser.json({ limit: "50mb" }));
	Server.use(FileUpload());
    Server.set("trust proxy", true);
    Server.use(Session({
		// A secret key used to sign the session ID cookie.
		// This should be a long, random string stored in environment variables for security.
    	secret: process.env.SESSION_KEY,
		// Prevents saving a session that is "uninitialized" (new but not modified).
		// This reduces server storage usage and helps with privacy compliance.
    	saveUninitialized: false,
    	cookie: 
    	{ 
            httpOnly: "auto",
            secure:  "auto",
			// Cookies saved for 1 year
    		maxAge: 12 * 30 * 24 * 60 * 60 * 1000
    	},
        store: Session_Store,
    	resave: false 
    }));
    Server.use(async (req, res, next) => 
    {
		if (req.session.language == null)
		{
			let lang = req.acceptsLanguages(Language.Available);

			if (lang && typeof lang == "String")
			{
				lang = lang.substring(0, 2);
				req.session.language = lang; 
			}
			else
			{
				req.session.language = "en";
			}
		}
		
		res.set("language", req.session.language);

    	const file = 
    	{
    		icons: /\.(?:ico)$/i,
    		fonts: /\.(?:ttf|woff2)$/i,
    		images:/\.(?:png|webp|jpg|jpeg|bmp|svg)$/i
    	}
    	
    	for (const [key, value] of Object.entries(file)) 
    	{
    		if (value.test(req.url) && req.query.cache != "false" && Variables.Production)
			{
    			res.header("Cache-Control", "public, max-age=604800"); // 7 days
			}
			else if (req.query.cache == "false")
			{
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
}