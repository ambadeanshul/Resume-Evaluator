require('dotenv').config();

async function checkModels() {
    console.log("Asking Google for your available models...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        
        console.log("\n--- YOUR AVAILABLE MODELS ---");
        // We only want to see the ones with "gemini" in the name
        data.models.forEach(model => {
            if (model.name.includes('gemini')) {
                console.log(model.name);
            }
        });
        console.log("-----------------------------\n");
        
    } catch (error) {
        console.error("Failed to fetch models:", error);
    }
}

checkModels();