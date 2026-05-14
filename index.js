// // Bring express in the file
// const express = require('express');

// // Create server app
// const app = express();

// // Create a route(request from user and response from server)
// app.get('/', (req, res) => {
//     res.send('Hello Anshul! The Resume Evaluator server is alive.');
// });

// // On the server and listen it on port 5000
// app.listen(5000, () => {
//     console.log('Server is successfully running on http://localhost:5000');
// });


const express = require('express');
const multer = require('multer'); // 1. Bring in Multer (The File Catcher)

const app = express();

// 2. Tell Multer to save uploaded files into a folder named 'uploads'
const upload = multer({ dest: 'uploads/' }); 

// 3. Update our Home Page (The UI)
// Instead of simple text, we are sending a tiny chunk of HTML to create an upload button.
app.get('/', (req, res) => {
    res.send(`
        <h2>Upload your Resume (PDF)</h2>
        <form action="/upload" method="POST" enctype="multipart/form-data">
            <input type="file" name="resume" accept=".pdf" required />
            <button type="submit">Upload to Server</button>
        </form>
    `);
});

// 4. The Upload Route (Where the file actually goes)
// Notice we use app.post, and we pass upload.single('resume') in the middle.
app.post('/upload', upload.single('resume'), (req, res) => {
    // If the user clicked upload without selecting a file, complain!
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    
    // If successful, tell the user the original name of the file they sent.
    res.send(`We received your file: ${req.file.originalname}`);
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});