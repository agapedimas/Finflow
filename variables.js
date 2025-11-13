const isProduction = (process.env.NODE_ENV == "production");
const Variables = 
{
    Production: isProduction,
	Version: "1.0.1",

	AppIcon: "/assets/icon_logo.ico",
	AppTitle: "Finflow",

	AppThumbnail: "",
	AppAssets: "https://assets.agapedimas.com",
	
	WebHost: "https://finflow.agapedimas.com",
	WebHomepage: "/home",
	WebPing: isProduction ? "https://finflow.agapedimas.com/ping" : "http://localhost:7199/ping",
}

module.exports = Variables;