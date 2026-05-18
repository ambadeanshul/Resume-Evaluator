require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { marked } = require('marked'); 

const app = express();
const upload = multer({ dest: '/tmp/' });

// Initialize Google AI tools
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AI Resume Evaluator</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; max-width: 450px; }
                h2 { color: #2c3e50; margin-top: 0; margin-bottom: 25px; text-align: center; font-size: 28px; }
                label { font-weight: 600; color: #34495e; margin-bottom: 8px; display: block; font-size: 14px; }
                input[type="text"], input[type="file"] { width: 100%; padding: 12px; margin-bottom: 20px; border: 1px solid #ccd1d9; border-radius: 6px; box-sizing: border-box; font-size: 14px; transition: border-color 0.3s; }
                input[type="text"]:focus { border-color: #007bff; outline: none; }
                button { width: 100%; padding: 14px; background: #007bff; color: white; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; transition: background 0.3s ease; box-shadow: 0 4px 6px rgba(0, 123, 255, 0.2); }
                button:hover { background: #0056b3; transform: translateY(-1px); }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>AI Resume Evaluator</h2>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <label>Target Role:</label>
                    <input type="text" name="role" placeholder="e.g., SDE, Data Analyst" required />
                    <label>Upload Resume (PDF):</label>
                    <input type="file" name="resume" accept=".pdf" required />
                    <button type="submit">Evaluate Resume</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/upload', upload.single('resume'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('Error: No file uploaded.');
    }

    try {
        const targetRole = req.body.role; 
        const filePath = req.file.path;

        // 1. Upload the PDF
        console.log("Uploading file to Google AI...");
        const uploadResponse = await fileManager.uploadFile(filePath, {
            mimeType: "application/pdf",
            displayName: "Candidate Resume",
        });
        console.log(`File uploaded successfully: ${uploadResponse.file.uri}`);
        
        fs.unlinkSync(filePath); // Clean up local file

        //  The Prompt
        const prompt = `
        Act as an expert technical recruiter. I have attached a candidate's resume as a PDF. 
        Target Role: ${targetRole}
        
        Please evaluate the attached resume for this role and format your response exactly like this:
        
        ### ATS Match Score: [Insert Score Here]/100
        
        **1. Summary:** [A short summary of whether this candidate is a good fit]
        
        **2. Missing Keywords & Skills:**
        [A bulleted list of critical skills, keywords, or experiences missing from the resume for this specific role]
        `;

        //  Setup the file data object
        const fileData = {
            fileData: {
                mimeType: uploadResponse.file.mimeType,
                fileUri: uploadResponse.file.uri
            }
        };

        let aiResponse = "";

        //  THE LOAD BALANCER (Fallback Routing)
        try {
            console.log("Attempting primary model (2.5-flash)...");
            const primaryModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
            const result = await primaryModel.generateContent([prompt, fileData]);
            aiResponse = result.response.text();
            
        } catch (apiError) {
            // Check if the error is a Server Busy (503) or Quota/Too Many Requests (429)
            if (apiError.status === 503 || apiError.status === 429 || apiError.message.includes("503") || apiError.message.includes("429")) {
                console.log("Traffic jam on 2.5-flash! Rerouting to backup model (2.0-flash)...");
                const backupModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
                const backupResult = await backupModel.generateContent([prompt, fileData]);
                aiResponse = backupResult.response.text();
            } else {
                // If it's a different error (like a broken API key), throw it to the main catch block
                throw apiError; 
            }
        }

        //  Convert to clean HTML
        const cleanHTML = marked.parse(aiResponse);

        //  Send to browser
        // 6. Send to browser (Replaces your current res.send)
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Evaluation Results</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 40px 20px; color: #333; margin: 0; }
                    .container { background: white; padding: 50px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); max-width: 800px; margin: 0 auto; }
                    h2 { color: #2c3e50; border-bottom: 3px solid #007bff; padding-bottom: 15px; margin-top: 0; font-size: 28px; }
                    .result-box { background: #f8f9fa; padding: 30px; border-radius: 8px; border: 1px solid #e9ecef; margin-top: 25px; line-height: 1.7; font-size: 16px; }
                    .result-box h3 { color: #007bff; margin-top: 0; font-size: 22px; }
                    .result-box ul { padding-left: 20px; }
                    .result-box li { margin-bottom: 10px; }
                    .result-box strong { color: #2c3e50; }
                    .btn-container { text-align: center; margin-top: 40px; }
                    .back-btn { display: inline-block; padding: 14px 28px; background: #28a745; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; transition: all 0.3s ease; box-shadow: 0 4px 6px rgba(40, 167, 69, 0.2); }
                    .back-btn:hover { background: #218838; transform: translateY(-1px); }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Evaluation for: <span style="color: #007bff;">${targetRole}</span></h2>
                    <div class="result-box">
                        ${cleanHTML}
                    </div>
                    <div class="btn-container">
                        <a href="/" class="back-btn">← Evaluate Another Resume</a>
                    </div>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error("Critical error during evaluation:", error);
        res.status(500).send('An error occurred during evaluation. Check your terminal for details.');
    }
});

// Export the app for serverless deployment (Vercel)
module.exports = app;

// Only listen locally if we are NOT in a production environment
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => {
        console.log('Server is running locally on http://localhost:3000');
    });
}