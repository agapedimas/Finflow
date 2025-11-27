const isProduction = (process.env.NODE_ENV == "production");
const Variables = 
{
    Production: isProduction,
	Version: "1.1.9",

	AppIcon: "/assets/icon_logo.ico",
	AppTitle: "Finflow",
	AppTitle_Parents: "Finflow for Parents",
	AppTitle_ScholarshipFunder: "Finflow for Scholarship Funder",

	AppThumbnail: "",
	AppAssets: "https://assets.agapedimas.com",
	
	WebHost: "https://finflow.agapedimas.com",
	WebHomepage: "/home",
	WebPing: isProduction ? "https://finflow.agapedimas.com/ping" : "http://localhost:7199/ping",
}

module.exports = Variables;