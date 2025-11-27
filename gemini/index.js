const   { 
            GoogleGenAI, 
            Modality, 
            MediaResolution, 
            Session,
            FinishReason,
            HarmCategory,
            HarmBlockThreshold
        } = require("@google/genai");
const fs = require("fs");
const Delay = (msec) => new Promise((resolve) => setTimeout(resolve, msec));
const ai = new GoogleGenAI(
{
    apiKey: process.env.GEMINI_API_KEY
});

// Anda mungkin perlu me-require 'follow-redirect' di sini jika itu digunakan di bawah
// const followRedirect = require('follow-redirect'); // Pastikan ini ada jika dipakai di bawah

const Settings = {
    Chat: {
        IsEnabled: true,
        SelectedModel: 0
    },
    Voice: {
        IsEnabled: true,
        SelectedModel: 0
    }
};

let Gemini_Settings = {};

async function Initialize()
{
    const settings = fs.readFileSync("./gemini/settings.json").toString();
    Gemini_Settings = JSON.parse(settings);
};

const Model = {
    TokenCount: [],
    RequestCount: [],
    /**
     * @param { number } index 
     * @param { "chat" | "voice" } type 
     */
    Change: function(index, type = "chat") {
        if (type == "chat") {
            index = index % Gemini_Settings.Models.Chat.length;
            Settings.Chat.SelectedModel = index;
        }
        else if (type == "voice") {
            index = index % Gemini_Settings.Models.Voice.length;
            Settings.Voice.SelectedModel = index;
        }
    },
    /**
     * @param { number } index 
     * @param { number } threshold 
     * @returns 
     */
    CheckLimit: function(index, threshold = 100) {
        index = index % Gemini_Settings.Models.Chat.length;
        
        if ((Model.RequestCount[index] || 0) < Gemini_Settings.Models.Chat[index].Limit * threshold / 100)
            return false;
        else
            return true;
    },
    CheckLimitAll: function() {
        let isLimit = true;
    
        for (let i = 0; i < Gemini_Settings.Models.Chat.length; i++)
        {
            let index = (Settings.Chat.SelectedModel + i) % Gemini_Settings.Models.Chat.length;
            if (Model.CheckLimit(index) == false)
            {
                isLimit = false;
                Model.Change(index, "chat");
                break;
            }
        }
    
        return isLimit;
    }
}

const Chat = {
    /**
     * @param { string } message Message
     * @param { number } model Gemini model by index
     * @param { Content[] } history Chat history
     * @param { { path: string, mimeType: string, name: string } } file File for attachments if any 
     * @param { number } occurence Number of occurence 
     * @return { Promise<{
     *      text: string,
     *      queries: Array<{
     *          query: string,
     *          url: string,
     *          type: string
     *      }>,
     *      history: Content[],
     *      finish: {
     *          code: number,
     *          usage: number,
     *          occurence: number
     *      }
     * }>}
     */
    Send: function(message, model, history, file = null, occurence = 1)
    {
        return new Promise(async function(resolve)
        {
            try
            {
                const gemini = Gemini_Settings.Models.Chat[model];
                // Clone the configurations object from settings to prevent modification of the global config
                const config = { ...Gemini_Settings.Configurations }; 

                if (gemini.Thinking === true)
                {
                    config.thinkingConfig = 
                    {
                        thinkingBudget: -1,
                        includeThoughts: false 
                    }
                }
                else if (gemini.Thinking === false)
                {
                    config.thinkingConfig = 
                    {
                        thinkingBudget: 0,
                        includeThoughts: false 
                    }
                }
                else
                {
                    config.thinkingConfig = null;
                }

                // --- PERBAIKAN UTAMA DI SINI ---
                // Jika gemini.Tools tidak ada atau kosong, properti 'tools' HARUS DIHILANGKAN DARI CONFIG
                
                const hasTools = gemini.Tools && gemini.Tools.length > 0;
                
                if (hasTools) {
                    config.tools = gemini.Tools; 
                } else {
                    // Hapus properti tools jika tidak ada (untuk Model 3/fallback)
                    delete config.tools; 
                }
                // --- AKHIR PERBAIKAN UTAMA ---


                config.systemInstruction = fs.readFileSync("./gemini/context.md").toString();
                config.safetySettings = [
                    {
                        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                        threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                        threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
                    }
                ]

                //history = Chat.ValidateHistory(history);
                
                const chat = ai.chats.create({
                    model: gemini.Model,
                    history: history,
                    config: config,
                });

                const parts = [];

                // Ambil 2 turn terakhir jika itu adalah functionCall dan functionResponse. 
                // Ini hanya terjadi di Iterasi 2 dan seterusnya.

                if (history.length > 0 && history[history.length - 1].role === 'tool' && history[history.length - 2].role === 'model' && history[history.length - 2].parts[0].functionCall) {
                    // Ini adalah Iterasi 2 (mengirim Function Response)

                    // Pop the Function Response turn (role: 'tool') from history, 
                    // and use its parts as the current message.
                    const toolResponseTurn = history.pop();
                    parts.push(...toolResponseTurn.parts);

                    // Pop the Function Call turn (role: 'model') from history, 
                    // as the API will re-generate it based on the current turn.
                    history.pop();
                    
                } else if (message != null && message.trim() !== "") {
                    // Ini adalah Iterasi 1 (mengirim Pesan User)
                    parts.push({ text: message });
                }
                

                if (file != null)
                {
                    if (file.fileData == null)
                    {
                        const upload = await ai.files.upload({
                            file: file.path,
                            config: {
                                mimeType: file.mimeType,
                                displayName: file.name
                            }
                        })

                        file = { 
                            fileData: {
                                fileUri: upload.uri,
                                mimeType: upload.mimeType
                            }
                        }
                    }
                    
                    parts.push(file);
                }

                if (parts.length === 0) {
                    return {
                        text: "Tolong masukkan pesan atau lampirkan file untuk memulai percakapan.",
                        code: 400, // Bad Request
                        usage: null,
                    };
                }

                let response;
                let code = 0;

                try 
                {
                    response = await chat.sendMessage({ message: parts });
                }
                catch (error)
                {
                    if (error?.status == 429 || (error?.status / 100 | 0 == 5) || error?.message.includes("fetch failed"))
                    {
                        console.log(`[Gemini API Error] Rate Limit (429) atau Network Gagal: ${error.message}`);
                        throw error; // <-- WAJIB: Lempar error untuk ditangkap route.js
                    }
                    else
                    {
                        console.error(error);
                        throw error;
                    }
                }

                console.log(response)


                let queries = [];
                let text = "";
                let functionCall = null;

                for (let candidate of response?.candidates || [])
                {
                    if (candidate.finishReason != FinishReason.STOP)
                    {
                        if (candidate.finishReason == FinishReason.SAFETY)
                            code = 1102;
                        else if (candidate.finishReason == FinishReason.PROHIBITED_CONTENT || candidate.finishReason == FinishReason.BLOCKLIST)
                            code = 1103;
                        else if (candidate.finishReason == FinishReason.IMAGE_SAFETY)
                            code = 1104;
                        else if (candidate.finishReason == FinishReason.MAX_TOKENS)
                            code = 1105;
                        else
                            code = 1106;
                    }

                    for (let content of candidate.content?.parts || []) {
                        if (content.functionCall) {
                            functionCall = content.functionCall;
                            // Jika ada function call, kita biasanya tidak perlu teks/grounding dari respons ini
                            text = ""; 
                            break; 
                        }
                       
                    }

                    for (let grounding of candidate.groundingMetadata?.groundingChunks || [])
                    {
                        const web = grounding.web;

                        if (web.uri)
                        {
                            try
                            {
                                // PERHATIAN: Pastikan 'followRedirect' sudah di-require di awal file jika tidak akan error
                                let href = await followRedirect.startFollowing(web.uri); 
                                href = href[href.length - 1].url;
                                
                                const x = new URL("https://api.agapedimas.com/your-ray/redirect");
                                x.searchParams.set("url", href);
                                web.uri = x.href;
                            }
                            catch (error)
                            {
                                console.error("Cannot fetch uri", error);
                            }
                        }

                        if (web && web.title && web.uri)
                            queries.push({ type: "website", query: web.title, url: web.uri });
                    }

                    for (let query of candidate.groundingMetadata?.webSearchQueries || [])
                    {
                        const url = new URL("https://google.com/search?q=" + query + "&utm_source=agapedimas.com");
                        query = query.length > 65 ? query.substring(0, 62) + "..." : query;
                        queries.push({ type: "search", query: query, url: url.href });
                    }

                    queries.sort((a, b) => a.type < b.type ? -1 : 1);

                    for (let content of candidate.content?.parts || [])
                    {
                        // Perbaikan: Tambahkan pengecekan apakah content.text ada
                        if (content.text) { 
                            if (content.text.startsWith("THINK"))
                                continue; // Lewati jika dimulai dengan THINK

                            text = text.trim() + "\n\n" + content.text.trim();
                        }
                        // JIKA TIDAK ADA x.text, kita lewati. FunctionCall/Response tidak perlu digabungkan ke 'text' akhir
                    }
                    
                    console.log(text);
                }

                if (response?.promptFeedback)
                    code = 1107;

                if (text.trim() == "")
                {
                    if (occurence > 5) {
                        code = 1108;
                    }
                    else {
                        return resolve(await Chat.Send(message, model, history, file, occurence + 1));
                    }
                }
                
                {
                    let tmp = "";
                    let blankCount = 0;

                    for (let resp of text?.split(/\n/) || [])
                    {
                        let occs = resp.match(/([^ ]  +[^ ])/g) || [];

                        for (let occ of occs || [])
                            resp = resp.replace(occ, occ[0] + " " + occ[occ.length - 1]);

                        if (resp.trim() == "")
                            blankCount++;
                        else
                            blankCount = 0;

                        if (blankCount <= 1)
                            tmp += resp + "\n";
                    }
                    text = tmp;
                }

                history = chat.getHistory();
                console.log(history);
                let token = response.usageMetadata?.totalTokenCount | 0;

                return resolve({
                    text: text,
                    queries: queries,
                    function_call: functionCall,    
                    history: history,

                    finish: { 
                        code: code,
                        usage: token,
                        occurence: occurence
                    }
                })
            }
            catch (error)
            {
                console.error(error);
                let code = 400;

                if (error?.status)
                    code = error.status;
                else if (error?.code)
                    code = error.code;
                    
                return resolve({
                    text: "",
                    queries: [],
                    history: [],
                    finish: { 
                        code: code,
                        usage: 0,
                        occurence: occurence
                    }
                })
            }
        })
    },
    /**
     * @param { Content[] } history 
     * @returns { Content[] }
     */
    ValidateHistory(history)
    {
        for (let o of history || [])
        {
            if (o.role == "user")
            {
                if (o.parts.length > 1)
                {
                    let parts = [];
                    let timestamp = 0;
                    for (let x of o.parts || [])
                    {
                        if (x.text)
                        {
                            try {
                                timestamp = JSON.parse(x.text).f || 0;
                                timestamp = new Date(timestamp);
                            } catch (e) { /* ignore non-JSON text */ }
                            parts.push(x);
                        }                    
                        else if (x.fileData)
                        {
                            if ((Date.now() - timestamp) / (1000 * 60 * 60 * 24) < 1.5) // file expires in 1.5 days
                                parts.push(x);
                        }
                    }

                    o.parts = parts;
                }
            }
            else if (o.role == "model")
            {
                let parts = [];
                for (let x of o.parts || [])
                {
                    // 1. PASTIKAN x.text ADA DAN BUKAN NULL/UNDEFINED
                    if (x.text) {
                        // 2. Jika ada, cek apakah BUKAN "THINK"
                        if (x.text.startsWith("THINK") == false)
                            parts.push(x);
                    }
                    // 3. Jika x BUKAN TEXT (mungkin function call/response atau file), masukkan juga
                    else {
                        parts.push(x);
                    }
                }
                o.parts = parts;

            }
        }

        while (JSON.stringify(history || []).length > 75000)
            history = history.slice(12);

        if (history && history.length > 0)
        {
            const lastContent = history[history.length - 1]; // Mempermudah pembacaan
            if (
                lastContent.parts == null                      || 
                lastContent.parts.length == 0                   ||
                // PERBAIKAN DI SINI: Gunakan optional chaining pada 'text' dan ?? ""
                (lastContent.parts[0].text?.trim() ?? "") == ""
            )
            {
                history.pop();
                history.pop();
            }
        }
        
        return history;
    }
}

module.exports = { Initialize, Chat, Model }