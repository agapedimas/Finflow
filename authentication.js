const SQL = require("./sql");

const Authentication = 
{
    /**
     * Check if account has listed in authentication list
     * @param { string } sessionId Id of session
     * @returns { Promise<boolean> } @true if user has access, otherwise @false
     */
    HasAccess: async function(sessionId)
    {
        let query = "SELECT id FROM authentication WHERE id=? LIMIT 1";
        let param = sessionId;
        const results = await SQL.Query(query, [param]);
        
        return results.data?.length > 0;
    },
    /**
     * Check credentials of account
     * @param { string } username Username of account
     * @param { string } password Password of account
     * @returns { Promise<boolean> } @true if credentials valid, otherwise @false
     */
    CheckCredentials: async function(username, password)
    {
        const results = await SQL.Query("SELECT id FROM accounts WHERE username=? AND password=?", [username, password]);
        return results.data?.length > 0;
    },
    /**
     * Get account details from session id
     * @param { string } sessionId
     * @returns { Promise<string> } Id of account
     */
    GetAccountId: async function(sessionId)
    {
        const results = await SQL.Query("SELECT user FROM authentication WHERE id=?", [sessionId]);
        return results.data?.at(0)?.user;
    },
    /**
     * Add account to authentication list each time they logged in
     * @param { string } id Id of account
     * @param { string } ip Ip address where they logged in
     * @param { boolean } singleSession Replace existing session to a new one, which means only single session allowed per account
     * @returns { Promise<boolean> } @true if operation completed successfully, otherwise @false
     */
    Add: async function(id, ip, singleSession = true)
    {
        const timestamp = Date.now();

        if (singleSession == true)
            await SQL.Query("DELETE FROM authentication WHERE user = ?", id);

        const result = await SQL.Query("INSERT INTO authentication (user, ip, time) VALUES (?, ?, ?)", [id, ip, timestamp]);
        return result.data.insertId;
    },
    /**
     * Add account to authentication list each time they logged in
     * @param { string } sessionId Id of session
     * @returns { Promise<void> }
     */
    Remove: async function(sessionId)
    {
        await SQL.Query("DELETE FROM authentication WHERE id = ?", [sessionId]);
    }
};

module.exports = Authentication;