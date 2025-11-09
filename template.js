const FileIO = require("fs");
const Path = require("path");
const Path_Template = "./src/templates/";

async function Initialize()
{
	const components = FileIO.readdirSync(Path_Template);
	for (let component of components)
	{
		let name = Path.parse(component).name;
		let value = FileIO.readFileSync(Path_Template + component, { encoding: "utf8" });
		
		Data[name] = value.toString();
	}
}

const Data = 
{
	Configuration: "lang='<#? applang ?#>'"
}

module.exports = 
{
	Data: Data,
	Initialize: Initialize
};