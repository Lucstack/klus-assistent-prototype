import { promises as fs } from 'fs';
import path from 'path';

// =================================================================
// PROXY.JS - v8 (Enhanced Logging)
// =================================================================

async function getSystemPrompt() {
  const filePath = path.join(process.cwd(), 'api', 'system_prompt.txt');
  return fs.readFile(filePath, 'utf-8');
}

export default async function handler(request, response) {
  console.log('[LOG] Backend handler started.');

  if (request.method !== 'POST') {
    console.log(`[LOG] Method not allowed: ${request.method}`);
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    console.log('[LOG] Parsing request body...');
    const { userInput } = request.body;
    if (!userInput) {
      console.error('[FOUT] userInput is missing from the request body.');
      return response.status(400).json({ error: 'userInput is verplicht.' });
    }
    console.log(`[LOG] Received userInput: "${userInput.substring(0, 50)}..."`);

    const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
    if (!GOOGLE_AI_API_KEY) {
      console.error('[FOUT] GOOGLE_AI_API_KEY is not set on the server.');
      return response
        .status(500)
        .json({ error: 'Server configuratiefout: API sleutel ontbreekt.' });
    }
    console.log('[LOG] GOOGLE_AI_API_KEY is present.');

    console.log('[LOG] Reading system prompt...');
    const systemPrompt = await getSystemPrompt();
    console.log('[LOG] System prompt loaded successfully.');

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: systemPrompt + '\n\nGebruiker input: ' + userInput }],
        },
      ],
      generationConfig: { responseMimeType: 'application/json' },
    };
    console.log('[LOG] Payload for Google AI API is constructed.');

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_AI_API_KEY}`;

    console.log('[LOG] Sending request to Google AI API...');
    const aiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log(`[LOG] Received response from Google AI API with status: ${aiResponse.status}`);

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error(
        `[FOUT] Google AI API returned an error (Status: ${aiResponse.status}):`,
        aiData
      );
      return response
        .status(500)
        .json({ error: 'Fout bij het aanroepen van de AI.', details: aiData });
    }

    console.log('[LOG] AI response is valid JSON. Sending back to client.');
    return response.status(200).json(aiData);

  } catch (error) {
    console.error('[FATALE FOUT] An unexpected error occurred in the proxy handler:', error);
    return response
      .status(500)
      .json({ error: 'Er is een onverwachte fout opgetreden in de proxy.' });
  }
}