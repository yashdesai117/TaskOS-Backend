import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

// We will export the function to be used by the WhatsApp client
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

export async function extractTaskFromMessage(messageText, senderInfo) {
  if (!genAI) {
    console.error('⚠️ GEMINI_API_KEY is not set in server/.env');
    return null;
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
You are an AI assistant for a Growth Manager named Yash.
Your job is to read an incoming WhatsApp message and determine if it contains a task or request that Yash needs to action.

Message Context:
Sender: ${senderInfo}
Message: "${messageText}"

Rules:
1. If the message is just chatter, a simple update, or doesn't require Yash to take action, return a JSON object with { "isTask": false }.
2. If it is a task, return a JSON object with the following fields:
   - isTask: true
   - title: A short, concise title for the task (max 5-6 words)
   - description: A brief summary of what needs to be done based on the message.
   - priority: "Critical", "High", "Medium", or "Low"
   - urgency: "today" or "this week"
   
Output ONLY valid JSON. No markdown formatting, no backticks. Just the raw JSON object.
`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
    const parsed = JSON.parse(responseText);
    return parsed;
  } catch (error) {
    console.error('Error in AI extraction:', error);
    return null;
  }
}
