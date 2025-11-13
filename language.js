const FileIO = require("fs");
const Path = require("path");
const Variables = require("./variables");
const Path_Language = "./src/languages/";

/**
 * @returns { void }
 */
function Initialize() 
{
	if (FileIO.existsSync(Path_Language) == false)
		return;

	
	const languages = FileIO.readdirSync(Path_Language);
	for (let i = 0; i < languages.length; i++)
	{
		const language =  languages[i];
		Languages[i] = language;
		
		/** @type { Array<string> } */
		const components = FileIO.readdirSync(Path_Language + language);

		if (Variables.Production) 
		{			
			Data[language] = {};
			for (let component of components)
			{
				// make sure only read json file
				if (component.endsWith(".json") == false)
					continue;
				
				let name = Path.parse(component).name;
				let value = FileIO.readFileSync(Path_Language + language + "\/" + component, { encoding: "utf8" });

				Data[language][name] = JSON.parse(value.toString());
			}
		}
		else 
		{
			localDataLang = {};
			Data[language];

			module.exports.Data[language] = new Proxy(Data, 
			{
				get(target, property) 
				{
					const component = components.find(o => o == property + ".json");
					if (component == null) 
						return;
					const content = FileIO.readFileSync(Path_Language + language + "\/" + component, { encoding: "utf8" });
					return JSON.parse(content.toString());
				}
			});
		}
	}
}

/**
 * Compiles string for specific language and page by accessing: <$ [page] [param] />
 * 
 * **For example:** \
 * `<$ home welcome />` will fetches file `./src/languages/xx/home.json` and returns value of key `welcome`
 */
function Compile(content, language)
{
	const language_prefix = content.match(/<\$(.*?)\/>/g);
	if (language_prefix != null) 
	{
		for (const prefix of language_prefix)
		{
			let page = prefix.substring(2, prefix.length - 2).split(" ")[1];
			let param = prefix.substring(2, prefix.length - 2).split(" ")[2];
			let replacement = prefix;

			if (Data[language][page] != null && Data[language][page][param] != null)
				replacement = Data[language][page][param];
				
			content = content.replaceAll(prefix, replacement);
		}
	}
	return content;
}


const Data = {}
const Languages = [];

module.exports =
{
    /** 
     * List of available language 
     * @type {Array<string>}
     */
	Available: Languages,
    /**
     * Get string for specific language and page by accessing: `Language.Data.<lang>.<page>.<param>`.
     * 
     * **For example:** \
     * `Language.Data["en"]["home"]["welcome"]` will fetches file `./src/languages/en/home.json` and returns value of key `welcome`
     */
	Data: Data,
	Compile: Compile,
	Initialize: Initialize
};