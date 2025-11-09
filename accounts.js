const SQL = require("./sql");
const FileIO = require("fs");
const ConvertWEBP = require("webp-converter");
const { Jimp } = require("jimp");

ConvertWEBP.grant_permission();

const Accounts = 
{
    /**
     * @param { {
     *      id: string?,
     *      username: string?,
     *      role: string?
     * } } details Details of account by id, username, or role
     * @returns { Promise<Array<{
     *      id: string,
     *      username: string,
     *      nickname: string,
     *      url: string,
     *      created: string,
     *      role: string,
     *      avatarversion: number
     * }>> } Details of accounts 
     */
    Get: async function(details)
    {
        let query = "SELECT id, username, nickname, url, created, role, avatarversion FROM accounts";
        let params = [];

        if (details?.id)
        {
            query += " WHERE id=?";
            params.push(details.id);
        }
        else if (details?.username)
        {
            query += " WHERE username=?";
            params.push(details.username);  
        }
        else if (details?.role)
        {
            query += " WHERE role=?";
            params.push(details.role);  
        }

        const results = await SQL.Query(query, [params]);            
        return results.data || [];
    },
    /**
     * @param { string } username
     * @param { string } nickname
     * @param { string } url
     * @param { string } password
     * @param { string } role
     * @returns { Promise<string> } Id of account
     */
    Add: async function(username, nickname, url, password, role)
    {
        const id = (Date.now() * 50 + 321).toString(36);
        await SQL.Query("INSERT INTO accounts (id, username, nickname, url, password, role) VALUES (?,?,?,?,?,?)", [id, username, nickname, url, password, role]);

        return id;
    },
    /**
     * @param { string } id
     * @returns { Promise<boolean> } @true if the operation completed successfully, otherwise @false
     */
    Remove: async function(id)
    {
        const result1 = await Accounts.Avatars.Delete(id);
        const result2 = await SQL.Query("DELETE FROM accounts WHERE id=?", [id]);
        
        return result1 && result2.success;
    },
    Avatars: 
    {
        /**
         * Save avatar
         * @param { string } id Id of account 
         * @param { Array<Buffer> } buffer Buffer of image
         * @returns { Promise<boolean> } @true if operation completed successfully, otherwise @false
         */
        Save: async function(id, buffer)
        {
            try
            {
                const path = "./src/avatars/" + id;
                FileIO.writeFileSync(path + ".png", buffer);
                
                const image = await Jimp.read(path + ".png");
                const bg = new Jimp({ width: 720, height: 720 });

                let x = 0, y = 0;
                if (image.width < image.height)
                {
                    image.resize({ w: 720});
                    y = (image.height / 2) + (image.height / 2) * -1;
                }
                else if (image.width > image.height)
                {
                    image.resize({ h: 720});
                    x = (image.width / 2) + image.width / 2 * -1;
                }
                else
                {
                    image.resize({ w: 720, h: 720});
                }

                bg.composite(image, x, y);
                await bg.write(path + ".png");
                
                await ConvertWEBP.cwebp(path + ".png", path);
                FileIO.unlinkSync(path + ".png", o => o);

                await SQL.Query("UPDATE accounts SET avatarversion = avatarversion + 1 WHERE id = ?", [id]);

                return true;
            }
            catch(error)
            {
                console.error(error);
                return false;
            }
        },
        /**
         * Delete avatar
         * @param { string } id Id of account 
         * @returns { Promise<boolean> } @true if operation completed successfully, otherwise @false
         */
        Delete: async function(id)
        {
            try
            {
                const path = "./src/avatars/" + id;
                
                if (FileIO.existsSync(path))
                    FileIO.unlinkSync(path);

                await SQL.Query("UPDATE accounts SET avatarversion = avatarversion + 1 WHERE id = ?", [id]);

                return true;
            }
            catch(error)
            {
                console.error(error);
                return false;
            }
        }
    }
};

module.exports = Accounts;