const isProduction = (process.env.NODE_ENV == "production");
const Variables = 
{
    Production: isProduction,
	Version: "1.0.0",

	AppIcon: "/icon_logo.ico",
	AppTitle: "App",
	AppTitleAdmin: "App for Admin",

	AppThumbnail: "",
	AppAssets: isProduction ? "https://assets.agapedimas.com" : "http://localhost:1202",
	
	WebHost: "https://app.agapedimas.com",
	WebHomepage: "/home",
	WebPing: isProduction ? "https://app.agapedimas.com/ping" : "http://localhost:7199/ping",
}

module.exports = Variables;