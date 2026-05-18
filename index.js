require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { marked } = require('marked'); 

const app = express();

// Middleware to parse incoming JSON data
app.use(express.json()); 

// Updated destination to use the cloud-safe temporary folder
const upload = multer({ dest: '/tmp/' });

// Initialize Google AI tools
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

//  ROUTE 1: HOME PAGE WITH LOADING STATE 
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
                .spinner { border: 4px solid rgba(0, 0, 0, 0.1); width: 36px; height: 36px; border-radius: 50%; border-left-color: #007bff; animation: spin 1s linear infinite; margin: 0 auto; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>AI Resume Evaluator</h2>
                <form id="uploadForm" action="/upload" method="POST" enctype="multipart/form-data" onsubmit="showLoading()">
                    <label>Target Role:</label>
                    <input type="text" name="role" placeholder="e.g., SDE, Data Analyst" required />
                    <label>Upload Resume (PDF):</label>
                    <input type="file" name="resume" accept=".pdf" required />
                    <button type="submit" id="submitBtn">Evaluate Resume</button>
                </form>

                <div id="loading" style="display: none; text-align: center; margin-top: 20px;">
                    <div class="spinner"></div>
                    <p style="font-weight: bold; color: #007bff; font-size: 16px; margin-top: 15px;">Scanning for core competencies...</p>
                    <p style="color: #666; font-size: 14px;">This usually takes about 10 seconds.</p>
                </div>
            </div>

            <script>
                function showLoading() {
                    document.getElementById('uploadForm').style.display = 'none';
                    document.getElementById('loading').style.display = 'block';
                }
            </script>
        </body>
        </html>
    `);
});

// --- ROUTE 2: RESUME UPLOAD & ATS EVALUATION ---
app.post('/upload', upload.single('resume'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('Error: No file uploaded.');
    }

    try {
        const targetRole = req.body.role; 
        const filePath = req.file.path;

        console.log("Uploading file to Google AI...");
        const uploadResponse = await fileManager.uploadFile(filePath, {
            mimeType: "application/pdf",
            displayName: "Candidate Resume",
        });
        console.log(`File uploaded successfully: ${uploadResponse.file.uri}`);
        
        fs.unlinkSync(filePath); // Clean up safe temporary file

        const prompt = `
        Act as an expert technical recruiter. I have attached a candidate's resume as a PDF. 
        Target Role: ${targetRole}
        
        Please evaluate the attached resume for this role and format your response exactly like this:
        
        ### ATS Match Score: [Insert Score Here]/100
        
        **1. Summary:** [A short summary of whether this candidate is a good fit]
        
        **2. Missing Keywords & Skills:**
        [A bulleted list of critical skills, keywords, or experiences missing from the resume for this specific role]
        `;

        const fileData = {
            fileData: {
                mimeType: uploadResponse.file.mimeType,
                fileUri: uploadResponse.file.uri
            }
        };

        let aiResponse = "";

        // Fallback Routing Load Balancer
        try {
            console.log("Attempting primary model (2.5-flash)...");
            const primaryModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
            const result = await primaryModel.generateContent([prompt, fileData]);
            aiResponse = result.response.text();
            
        } catch (apiError) {
            if (apiError.status === 503 || apiError.status === 429 || apiError.message?.includes("503") || apiError.message?.includes("429")) {
                console.log("Traffic jam on 2.5-flash! Rerouting to backup model (2.0-flash)...");
                const backupModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
                const backupResult = await backupModel.generateContent([prompt, fileData]);
                aiResponse = backupResult.response.text();
            } else {
                throw apiError; 
            }
        }

        const cleanHTML = marked.parse(aiResponse);

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
                    .btn-container { text-align: center; margin-top: 40px; }
                    .back-btn { display: inline-block; padding: 14px 28px; background: #28a745; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; transition: all 0.3s ease; box-shadow: 0 4px 6px rgba(40, 167, 69, 0.2); }
                    .back-btn:hover { background: #218838; transform: translateY(-1px); }
                    .spinner { border: 4px solid rgba(0, 0, 0, 0.1); width: 36px; height: 36px; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Evaluation for: <span style="color: #007bff;">${targetRole}</span></h2>
                    
                    <div class="result-box">
                        ${cleanHTML}
                    </div>

                    <div id="coverLetterSection" style="margin-top: 40px; text-align: center; border-top: 2px dashed #ccd1d9; padding-top: 30px;">
                        <button id="generateBtn" onclick="generateCoverLetter()" style="padding: 14px 28px; background: #6f42c1; color: white; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; transition: background 0.3s ease; box-shadow: 0 4px 6px rgba(111, 66, 193, 0.2);">
                             Generate Custom Cover Letter
                        </button>
                        
                        <div id="coverLetterLoading" style="display: none; margin-top: 20px;">
                            <div class="spinner" style="border-left-color: #6f42c1;"></div>
                            <p style="color: #6f42c1; font-weight: bold; margin-top: 15px;">AI is writing your personalized letter...</p>
                        </div>
                        
                        <div id="coverLetterResult" class="result-box" style="display: none; text-align: left; margin-top: 20px; border-left: 5px solid #6f42c1;"></div>
                    </div>

                    <div class="btn-container">
                        <a href="/" class="back-btn">← Evaluate Another Resume</a>
                    </div>
                </div>

                <script>
                    async function generateCoverLetter() {
                        const btn = document.getElementById('generateBtn');
                        const loading = document.getElementById('coverLetterLoading');
                        const resultBox = document.getElementById('coverLetterResult');
                        
                        btn.style.display = 'none';
                        loading.style.display = 'block';
                        resultBox.style.display = 'none';

                        try {
                            const response = await fetch('/generate-letter', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    role: "${targetRole}",
                                    fileUri: "${uploadResponse.file.uri}",
                                    mimeType: "${uploadResponse.file.mimeType}"
                                })
                            });

                            const data = await response.json();
                            loading.style.display = 'none';

                            if (response.ok && data.letterHTML) {
                                resultBox.innerHTML = "<h3 style='color: #6f42c1;'>Your Cover Letter:</h3>" + data.letterHTML;
                                resultBox.style.display = "block";
                            } else {
                                resultBox.innerHTML = "<h3 style='color: #dc3545;'>Oops! Something went wrong.</h3><p>" + (data.error || "The AI servers are currently overloaded. Please try again in 1 minute.") + "</p>";
                                resultBox.style.display = "block";
                                btn.style.display = 'inline-block';
                                btn.innerText = "Try Again";
                            }
                        } catch (error) {
                            loading.style.display = 'none';
                            resultBox.innerHTML = "<h3 style='color: #dc3545;'>Connection Error</h3><p>Could not connect to the server. Please check your internet connection and try again.</p>";
                            resultBox.style.display = "block";
                            btn.style.display = 'inline-block';
                            btn.innerText = "Try Again";
                        }
                    }
                </script>
            </body>
            </html>
        `);

    } catch (error) {
        console.error("Critical error during evaluation:", error);
        
        // Send a beautiful error page instead of a raw text crash
        res.status(500).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Evaluation Error</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; background-color: #f4f7f6; padding: 40px; text-align: center; color: #333; }
                    .container { background: white; padding: 50px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); max-width: 600px; margin: 0 auto; border-top: 5px solid #dc3545; }
                    h2 { color: #dc3545; }
                    a { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 6px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Server Overloaded</h2>
                    <p>The Google AI servers are currently experiencing extremely high traffic, or the API rate limit has been reached.</p>
                    <p style="color: #666; font-size: 14px;">(This usually happens when testing rapidly. Please wait 60 seconds and try again.)</p>
                    <a href="/">← Go Back Home</a>
                </div>
            </body>
            </html>
        `);
    }
});

//  ROUTE 3: COVER LETTER AJAX GENERATION 
app.post('/generate-letter', async (req, res) => {
    try {
        const { role, fileUri, mimeType } = req.body;
        
        const prompt = `
        You are an expert career coach. Based on the attached resume, write a highly professional, 
        confident, and engaging 3-paragraph cover letter for a candidate applying for a ${role} position. 
        Do not use placeholder brackets like [Company Name] unless absolutely necessary; keep it adaptable.
        `;

        const fileData = { fileData: { mimeType, fileUri } };
        let aiResponse = "";

        // The Cover Letter Load Balancer
        try {
            console.log("Cover Letter: Attempting primary model (2.5-flash)...");
            const primaryModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
            const result = await primaryModel.generateContent([prompt, fileData]);
            aiResponse = result.response.text();
            
        } catch (apiError) {
            if (apiError.status === 503 || apiError.status === 429 || apiError.message?.includes("503") || apiError.message?.includes("429")) {
                console.log("Cover Letter: Traffic jam! Rerouting to backup model (2.0-flash)...");
                const backupModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
                const backupResult = await backupModel.generateContent([prompt, fileData]);
                aiResponse = backupResult.response.text();
            } else {
                throw apiError; 
            }
        }

        const cleanHTML = marked.parse(aiResponse);
        res.json({ letterHTML: cleanHTML });

    } catch (error) {
        console.error("Cover Letter Error:", error);
        res.status(500).json({ error: "Failed to generate cover letter." });
    }
});

// Export the app module for Vercel Serverless environment
module.exports = app;

// Handle local initialization if we aren't in production mode
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => {
        console.log('Server is running locally on http://localhost:3000');
    });
}