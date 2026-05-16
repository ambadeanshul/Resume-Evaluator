require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { marked } = require('marked'); 

const app = express();
const upload = multer({ dest: 'uploads/' });

// Initialize Google AI tools
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto;">
            <h2>AI Resume Evaluator</h2>
            <form action="/upload" method="POST" enctype="multipart/form-data" style="display: flex; flex-direction: column; gap: 15px;">
                <label><strong>Target Role:</strong></label>
                <input type="text" name="role" placeholder="e.g., SDE, Data Analyst" required style="padding: 8px;" />
                <label><strong>Upload Resume (PDF):</strong></label>
                <input type="file" name="resume" accept=".pdf" required />
                <button type="submit" style="padding: 10px; background: #007bff; color: white; border: none; cursor: pointer;">Evaluate Resume</button>
            </form>
        </div>
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
        res.send(`
            <div style="font-family: sans-serif; max-width: 800px; margin: 40px auto; line-height: 1.6;">
                <h2 style="color: #333;">Evaluation for: ${targetRole}</h2>
                <div style="background: #f9f9fb; padding: 30px; border-radius: 12px; border: 1px solid #e1e4e8;">
                    ${cleanHTML}
                </div>
                <br>
                <a href="/" style="color: #007bff; text-decoration: none; font-weight: bold;">← Evaluate Another Resume</a>
            </div>
        `);

    } catch (error) {
        console.error("Critical error during evaluation:", error);
        res.status(500).send('An error occurred during evaluation. Check your terminal for details.');
    }
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});