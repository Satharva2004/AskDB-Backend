import { openai } from "../config/openai";

export async function generateQuery(prompt) {
    try {
        const response = await openai.createCompletion({
            model: "gpt-3.5-turbo",
            prompt: prompt,
            max_tokens: 100,
            temperature: 0.1,
        });
        return response.data.choices[0].text.trim();
    } catch (error) {
        console.error("Error generating query:", error);
        throw error;
    }
}

export async function geminiQuery(prompt) {
    try {
        const response = await openai.createCompletion({
            model: "gemini-1.5-flash",
            prompt: prompt,
            max_tokens: 100,
            temperature: 0.1,
        });
        return response.data.choices[0].text.trim();
    } catch (error) {
        console.error("Error generating query:", error);
        throw error;
    }
}
