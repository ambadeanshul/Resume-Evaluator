# AI Resume Evaluator & Cover Letter Generator

An AI-powered web application that helps job seekers compare a PDF resume with a target role. It produces ATS-style feedback, generates a tailored cover letter, stores evaluation records, and lets users download a shareable PDF report.

Built with Node.js, Express, MongoDB Atlas, and Google Gemini.

> AI-generated feedback is intended as career guidance, not a definitive assessment of a candidate or hiring outcome.

## What it does

- Accepts a PDF resume and a target job role.
- Uses Gemini to review resume content and generate structured, actionable feedback.
- Produces an ATS-style score and suggestions for skills, experience, and formatting improvements.
- Generates a three-paragraph cover letter tailored to the selected role without re-uploading the resume.
- Saves the role, AI evaluation, and timestamp in MongoDB Atlas.
- Enables users to export their evaluation and cover letter as a PDF report.

## Engineering highlights

- **Cloud-safe file handling:** Uploaded files are placed in the server's temporary directory before being sent to the Google AI file service.
- **Resilient model requests:** The app falls back from `gemini-2.5-flash` to `gemini-2.0-flash` when Gemini returns rate-limit or service-overload errors.
- **Serverless-ready deployment:** The Express application is configured for Vercel Serverless Functions.
- **Responsive experience:** Cover-letter generation runs asynchronously so users can continue on the results page without a full-page reload.

## Tech stack

| Area | Technologies |
| --- | --- |
| Frontend | HTML5, CSS3, vanilla JavaScript, `marked`, `html2pdf.js` |
| Backend | Node.js, Express, Multer |
| AI | Google Gemini via the Google Generative AI SDK |
| Database | MongoDB Atlas, Mongoose |
| Deployment | Vercel Serverless Functions |

## Run locally

### Prerequisites

- Node.js and npm
- A Google Gemini API key
- A MongoDB Atlas database connection string

### Setup

1. Clone this repository and open the project directory.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root:

   ```env
   GEMINI_API_KEY=your_google_gemini_api_key
   MONGODB_URI=your_mongodb_atlas_connection_string
   ```

4. Start the application:

   ```bash
   node index.js
   ```

5. Visit [http://localhost:3000](http://localhost:3000).

## Deployment

The included [vercel.json](./vercel.json) routes requests to the Express application as a Vercel Serverless Function. Before deploying, add `GEMINI_API_KEY` and `MONGODB_URI` as environment variables in your Vercel project settings.

## Project structure

```text
.
├── index.js       # Express app, AI workflows, and API routes
├── vercel.json    # Vercel serverless configuration
├── package.json   # Dependencies and project metadata
└── README.md
```

## Privacy note

Resumes may contain personal data. Use test or consented documents during development, keep API keys and database credentials out of version control, and review your data-retention practices before deploying for public use.
