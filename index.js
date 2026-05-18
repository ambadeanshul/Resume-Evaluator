require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { marked } = require('marked'); 
const mongoose = require('mongoose'); 

const app = express();

// Middleware to parse incoming JSON data
app.use(express.json()); 

// Updated destination to use the cloud-safe temporary folder
const upload = multer({ dest: '/tmp/' });

// Initialize Google AI tools
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Successfully connected to MongoDB Atlas!'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// --- DATABASE BLUEPRINT (SCHEMA) ---
const evaluationSchema = new mongoose.Schema({
    targetRole: String,
    aiResponse: String,     
    evaluatedAt: { type: Date, default: Date.now } 
});
const Evaluation = mongoose.model('Evaluation', evaluationSchema);

// --- ROUTE 1: HOME PAGE WITH LOADING STATE ---
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
                    <p style="font-weight: bold; color: #007bff; font-size: 16px; margin-top: 15px;"> Scanning core competencies...</p>
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
        
        fs.unlinkSync(filePath); 

        // BALANCED PROMPT & DATE INJECTION
        const currentDate = new Date().toDateString(); 

        const prompt = `
        Act as an expert Technical Recruiter and Career Coach. 
        Today's date is ${currentDate}. Keep this in mind when reviewing project and education dates so you do not flag recent or current events as "future" dates.

        I have attached a candidate's resume as a PDF. Target Role: ${targetRole}
        
        Please provide a balanced, realistic, and highly constructive evaluation. Be strict about missing technical requirements for the ATS, but maintain an encouraging, professional, and helpful tone.
        
        Format your response exactly like this:
        
        ### ATS Match Score: [Insert Score Here]/100
        
        **1. Critical Evaluation:** [A balanced assessment of the candidate's strengths and the specific areas where the resume falls short for this role.]
        
        **2. Key Areas for Improvement:**
        [A bulleted list of missing technical skills, formatting issues, or areas where the candidate needs to show more measurable impact.]
        `;

        const fileData = {
            fileData: {
                mimeType: uploadResponse.file.mimeType,
                fileUri: uploadResponse.file.uri
            }
        };

        let aiResponse = "";

        // FALLBACK ROUTING WITH TEMPERATURE 0
        try {
            console.log("Attempting primary model (2.5-flash)...");
            const primaryModel = genAI.getGenerativeModel({ 
                model: "gemini-2.5-flash",
                generationConfig: { temperature: 0 } 
            }); 
            const result = await primaryModel.generateContent([prompt, fileData]);
            aiResponse = result.response.text();
            
        } catch (apiError) {
            if (apiError.status === 503 || apiError.status === 429 || apiError.message?.includes("503") || apiError.message?.includes("429")) {
                console.log("Traffic jam on 2.5-flash! Rerouting to backup model (2.0-flash)...");
                const backupModel = genAI.getGenerativeModel({ 
                    model: "gemini-2.0-flash",
                    generationConfig: { temperature: 0 }
                }); 
                const backupResult = await backupModel.generateContent([prompt, fileData]);
                aiResponse = backupResult.response.text();
            } else {
                throw apiError; 
            }
        }

        const cleanHTML = marked.parse(aiResponse);

        // SAVE TO DATABASE
        try {
            const newEval = new Evaluation({
                targetRole: targetRole,
                aiResponse: cleanHTML
            });
            await newEval.save();
            console.log("💾 Evaluation successfully saved to the cloud database!");
        } catch (dbError) {
            console.error("Warning: Failed to save to database, but continuing...", dbError);
        }

        // Send to browser with html2pdf integration
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Evaluation Results</title>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 40px 20px; color: #333; margin: 0; }
                    .container { background: white; padding: 50px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); max-width: 800px; margin: 0 auto; }
                    h2 { color: #2c3e50; border-bottom: 3px solid #007bff; padding-bottom: 15px; margin-top: 0; font-size: 28px; }
                    .result-box { background: #f8f9fa; padding: 30px; border-radius: 8px; border: 1px solid #e9ecef; margin-top: 25px; line-height: 1.7; font-size: 16px; }
                    .result-box h3 { color: #007bff; margin-top: 0; font-size: 22px; }
                    .result-box ul { padding-left: 20px; }
                    .result-box li { margin-bottom: 10px; }
                    .btn-container { text-align: center; margin-top: 40px; }
                    
                    /* UX Upgrade: Sleek gray back button so the Green Download button stands out */
                    .back-btn { display: inline-block; padding: 14px 28px; background: #6c757d; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; transition: all 0.3s ease; box-shadow: 0 4px 6px rgba(108, 117, 125, 0.2); }
                    .back-btn:hover { background: #5a6268; transform: translateY(-1px); }
                    
                    .spinner { border: 4px solid rgba(0, 0, 0, 0.1); width: 36px; height: 36px; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                </style>
            </head>
            <body>
                <div class="container" id="reportContainer">
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

                    <div class="btn-container" id="actionButtons">
                        <button onclick="downloadPDF()" style="display: inline-block; padding: 14px 28px; background: #28a745; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 16px; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 6px rgba(40, 167, 69, 0.2); margin-right: 15px;">
                            ⬇️ Download PDF
                        </button>
                        <a href="/" class="back-btn">← Evaluate Another Resume</a>
                    </div>
                </div>

                <script>
                    function downloadPDF() {
                        const element = document.getElementById('reportContainer');
                        const buttons = document.getElementById('actionButtons');
                        const generateBtn = document.getElementById('generateBtn');
                        
                        // Hide buttons so they don't show up in the PDF
                        buttons.style.display = 'none';
                        if(generateBtn) generateBtn.style.display = 'none';

                        const opt = {
                            margin:       0.5,
                            filename:     'Resume_Evaluation_${targetRole.replace(/\s+/g, '_')}.pdf',
                            image:        { type: 'jpeg', quality: 0.98 },
                            html2canvas:  { scale: 2 },
                            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
                        };

                        // Generate PDF and restore buttons
                        html2pdf().set(opt).from(element).save().then(() => {
                            buttons.style.display = 'block';
                            if(generateBtn) generateBtn.style.display = 'inline-block';
                        });
                    }

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

// --- ROUTE 3: COVER LETTER AJAX GENERATION ---
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

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => {
        console.log('Server is running locally on http://localhost:3000');
    });
}