# AI Resume Evaluator & Cover Letter Generator

A robust, full-stack web application designed to provide job seekers with a realistic, balanced, and highly constructive evaluation of their resumes against target industry roles. Powered by Google Gemini AI, built on a secure Node.js backend, and backed by a cloud database, this tool parses resumes, saves evaluation histories, generates tailored cover letters, and exports professional reports directly to the user's local machine.

---

##  Core Features

- **Intelligent PDF Parsing & Analysis:** Integrates Google AI File Manager to directly upload and securely process multi-page candidate resumes.
- **Balanced AI Career Coaching:** Utilizes an optimized, date-aware system prompt paired with a deterministic generation strategy (`temperature: 0`) to provide mathematically consistent ATS scores and objective technical evaluations.
- **Smart API Load Balancing:** Features automated fallback routing between `gemini-2.5-flash` and `gemini-2.0-flash` to gracefully handle heavy traffic spikes and mitigate API rate limits (HTTP 429/503 errors).
- **Persistent Cloud Database (Memory Bank):** Integrates MongoDB Atlas via Mongoose to automatically log target roles, timestamp records, and save evaluation outputs.
- **Asynchronous AJAX Core Competency Checks:** Features a seamless, dynamic frontend loading screen and executes real-time background fetch requests to generate custom cover letters without reloading the page.
- **Client-Side PDF Compiler:** Leverages `html2pdf.js` to bypass browser print constraints, dynamically strip UI navigation buttons from the view container, and render clean, portrait-oriented PDF reports directly to the local file system.

---

##  Tech Stack

- **Frontend:** Semantic HTML5, Responsive CSS3, Vanilla JavaScript (ES6+), `html2pdf.js`, `marked` (Markdown parsing)
- **Backend:** Node.js, Express.js, Multer (multipart form handling)
- **Artificial Intelligence:** Google Gen AI SDK (Gemini API)
- **Database:** MongoDB Atlas, Mongoose ODM
- **Deployment & Hosting:** Vercel (Serverless Functions)

---

##  Environment Configuration

To run this project locally, create a `.env` file in the root directory and configure the following parameters:

```env
GEMINI_API_KEY=your_google_gemini_api_key
MONGODB_URI=your_direct_mongodb_connection_string
