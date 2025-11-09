const SQL = require("./sql");
const Variables = require("./variables");
const Authentication = require("./authentication");
const Accounts = require("./accounts");
const Functions = require("./functions");
const Language = require("./language");
const FileIO = require("fs");

/**
 * @param { import("express").Application } Server Express instance
 * @returns { void }
 */
function Route(Server) 
{      
    // DEFAULT ROUTE
    {
        Server.post("/ping", function(req, res)
        {
            res.send();
        });

        Server.post("/admin/signin", async function(req, res)
        {
            const valid = await Authentication.CheckCredentials(req.body.username, req.body.password);

            if (valid)
            {
                const account = (await Accounts.Get({ username: req.body.username })).at(0);
                const sessionId = await Authentication.Add(account.id, req.ip, true);
                req.session.account = sessionId;
                res.send();
            }
            else
            {
                res.status(401).send();
            }
        });

        Server.get("/admin/signout", async function(req, res)
        {
            if (req.session.account)
            {
                await Authentication.Remove(req.session.account);
                delete req.session["admin"];
            }

            res.redirect("/admin/signin");
        });

        Server.get("/admin*", async function(req, res, next)
        {
            const path = req.url;
            const hasAccess = await Authentication.HasAccess(req.session.account, ["editor", "admin"]);

            if (hasAccess == false && path != "/admin/signin" && path != "/admin/manifest.json")
            {
                if (path.endsWith(".js") || path.endsWith(".css"))
                {
                    res.setHeader("Cache-Control", "no-store");
                    return res.status(403).send();
                }
                else
                {
                    req.session.redirect = req.url;
                    return res.redirect("/admin/signin");
                }
            }
            else if (hasAccess == true)
            {
                if (path == "/admin" || path == "/admin/signin")
                {
                    const redirect = req.session.redirect;
                    req.session.redirect = null;

                    if (redirect)
                        return res.redirect(redirect);
                    else
                        return res.redirect("/admin" + Variables.WebHomepage);
                }

                const id = await Authentication.GetAccountId(req.session.account);
                const account = await Accounts.Get({ id });
                
                Object.assign(req.variables, 
                    {
                        "activeuser": JSON.stringify(account[0]),
                        "activeuser.id": account[0].id,
                        "activeuser.nickname": account[0].nickname || account[0].username,
                        "activeuser.username": account[0].username,
                        "activeuser.role": account[0].role,
                        "activeuser.role.name": Language.Data[req.session.language]["roles"][account[0].role],
                        "activeuser.url": account[0].url,
                        "activeuser.avatarversion": account[0].avatarversion
                    }
                );
            }

            next();
        });

        Server.post("/admin*", async function(req, res, next)
        {
            const path = req.url;
            if (await Authentication.HasAccess(req.session.account, ["editor", "admin"]) == false && path != "/admin/signin")
            {
                res.status(403).send(language.Data[req.session.language]["signin"]["error_signin"]);
            }
            else
            {
                next();
            }
        });

        Server.put("/admin*", async function(req, res, next)
        {
            const path = req.url;
            if (await Authentication.HasAccess(req.session.account, ["editor", "admin"]) == false && path != "/admin/signin")
            {
                res.status(403).send(language.Data[req.session.language]["signin"]["error_signin"]);
            }
            else
            {
                next();
            }
        });

        Server.patch("/admin*", async function(req, res, next)
        {
            const path = req.url;
            if (await Authentication.HasAccess(req.session.account, ["editor", "admin"]) == false && path != "/admin/signin")
            {
                res.status(403).send(language.Data[req.session.language]["signin"]["error_signin"]);
            }
            else
            {
                next();
            }
        });

        Server.delete("/admin*", async function(req, res, next)
        {
            const path = req.url;
            if (await Authentication.HasAccess(req.session.account, ["editor", "admin"]) == false && path != "/admin/signin")
            {
                res.status(403).send(language.Data[req.session.language]["signin"]["error_signin"]);
            }
            else
            {
                next();
            }
        });

        Server.post("/language/", async function(req, res)
        {
            if (Language.Available.includes(req.body.language))
            {
                req.session.language = req.body.language;
                res.send();
            }
            else
            {
                res.status(404).send("Language '" + req.body.language + "' is not available.");
            }
        });

        Server.get("/:language/*", function(req, res, next) 
        {
            if (Language.Available.includes(req.params.language))
            {
                req.session.language = req.params.language;

                if (req.path.endsWith(".js") == false && req.path.endsWith(".css") == false)
                    return res.redirect("/" + req.params[0]);

                req.filepath = "./public/" + req.params[0];
            }

            next();
        });
        
        Server.get("*", function(req, res, next)
        {
            if (req.query.contentOnly == "true")
                req.contentOnly = true;

            next();
        });
    }

    // CUSTOM ROUTE HERE
    // Server.get(function(req, res) ...)

    Map(Server);
}

function Map(Server)
{
    Server.get("*", async function(req, res)
    {
        const prettyPath = PrettifyPath(req);
        const path = prettyPath.result;
        
        if (prettyPath.refresh)
        {
            res.redirect("/" + prettyPath.result);
            return;
        }
        
        const rootPath = req.filepath ? "" : "./public/";
        const isHTML = FileIO.existsSync(rootPath + path + ".html") || FileIO.existsSync(rootPath + path + "/index.html");
        const isJS = path.endsWith(".js") && FileIO.existsSync(rootPath + path);
        const isCSS = path.endsWith(".css") && FileIO.existsSync(rootPath + path);
        const isIndex = isHTML ? FileIO.existsSync(rootPath + path + ".html") == false : false;
        const isImage = /(\.png|\.webp|\.jpg|\.bmp|\.jpeg)$/g.test(path);
        const pageType = path.startsWith("admin") || req.isAdmin == true ? "admin" : "public";

        if (isHTML)
        {
            let data;
            if (isIndex)
                data = FileIO.readFileSync(rootPath + path + "/index.html");
            else
                data = FileIO.readFileSync(rootPath + path + ".html");

            data = data.toString();
            data = Functions.Page_Compile(pageType, data, req.session?.language, path, req.contentOnly == true);
            
            if (req.variables)
                for (const variable of Object.keys(req.variables))
                    data = data.replace(new RegExp("<#\\?(| )" + variable + "(| )\\?#>", "gi"), req.variables[variable] || "");
            
            res.send(data);
        }
        else if (isJS || isCSS)
        {
            if (isJS)
                res.header("Content-Type", "text/javascript; charset=utf-8");
            else if (isCSS)
                res.header("Content-Type", "text/css");
            
            let data = FileIO.readFileSync(rootPath + path).toString();
            data = Language.Compile(data, req.session.language);
            res.send(data);
        }
        else
        {
            if (FileIO.existsSync(rootPath + path))
            {
                res.sendFile(rootPath + path, { root: "./" });
            }
            else
            {
                if (isImage)
                    res.status(404).sendFile("./src/blank.png", { root: "./" });
                else
                    res.status(404).sendFile("./public/404.shtml", { root: "./" });
            }
        }
    });
    
    Server.post("*", async function(req, res, next)
    {
        let path = PrettifyPath(req).result;
        
        const rootPath = req.filepath ? "" : "./public/";
        const isHTML = FileIO.existsSync(rootPath + path + ".html") || FileIO.existsSync(rootPath + path + "/index.html");
        const isIndex = isHTML ? FileIO.existsSync(rootPath + path + ".html") == false : false;
        const pageType = path.startsWith("admin") || req.isAdmin == true ? "admin" : "public";

        if (isHTML)
        {
            let data;
            if (isIndex)
                data = FileIO.readFileSync(rootPath + path + "/index.html");
            else
                data = FileIO.readFileSync(rootPath + path + ".html");

            data = data.toString();
            data = Functions.Page_Compile(pageType, data, req.session?.language, path, true);
            
            if (req.variables)
                for (const variable of Object.keys(req.variables))
                    data = data.replace(new RegExp("<#\\?(| )" + variable + "(| )\\?#>", "gi"), req.variables[variable] || "");
            
            res.send(data);
        }
        else
        {
            if (FileIO.existsSync(rootPath + path))
            {
                res.sendFile(rootPath + path, { root: "./" });
            }
            else
            {
                res.status(404).send();
            }
        }
    });
}

/**
 * Make the URL tidy
 * @param { string } path
 * @returns { {
 *      refresh: boolean,
 *      result: string
 * }} 
 */
function PrettifyPath(req)
{
    if (req.filepath)
        return {
            refresh: false,
            result: req.filepath
        };

    let path = req.path;
    let refresh = false;

    if (path.startsWith("//"))
        refresh = true;

    while (path.startsWith("/"))
        path = path.substring(1);

    if (path.includes("//"))
    {
        refresh = true;
        path = path.replaceAll("//", "/");
    }
    if (path.endsWith("/"))
    {
        refresh = true;
        path = path.substring(0, path.length - 1);
    }
    if (path.endsWith(".html"))
    {
        refresh = true;
        path = path.substring(0, path.length - 5);
    }
    if (path.endsWith(".shtml"))
    {
        refresh = true;
        path = path.substring(0, path.length - 6);
    }
    
    return {
        refresh: refresh, 
        result: path
    }
}


module.exports = Route;