const FileIO = require("fs");
const Path = require("path");
const Path_Template = "./src/templates/";
const Variables = require("./variables");

async function Initialize()
{
	/** @type { Array<string> } */
	const components = FileIO.readdirSync(Path_Template);

	if (Variables.Production) 
	{			
		for (let component of components)
		{
			let name = Path.parse(component).name;
			let value = FileIO.readFileSync(Path_Template + component, { encoding: "utf8" });
			
			Data[name] = value.toString();
		}
	}
	else 
	{
		const ogData = {};
		Object.assign(ogData, Data);
		module.exports.Data = new Proxy(Data, 
		{
			get(target, property) 
			{
				const component = components.find(o => Path.parse(o).name == property);
				if (component == null) 
					return ogData[property];
				const content = FileIO.readFileSync(Path_Template + component, { encoding: "utf8" });
				return content.toString();
			}
		});
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