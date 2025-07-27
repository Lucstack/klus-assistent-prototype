// Dit is een serverless functie, ontworpen om te draaien op een platform zoals Vercel.
// Het fungeert als een veilige proxy tussen jouw app en de Google AI API.

// Importeer de 'fetch' functionaliteit om API calls te kunnen maken
import fetch from 'node-fetch';

// Dit is de hoofdfunctie die wordt aangeroepen wanneer jouw app een verzoek stuurt.
export default async function handler(request, response) {
  // 1. Veiligheidscheck: Sta alleen POST-verzoeken toe.
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 2. Haal de klusomschrijving van de gebruiker uit het verzoek
    const { userInput } = request.body;
    if (!userInput) {
      return response.status(400).json({ error: 'userInput is verplicht.' });
    }

    // 3. Haal de geheime API-sleutel op uit de server-omgeving.
    // Deze sleutel is NIET zichtbaar in de frontend code.
    const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
    if (!GOOGLE_AI_API_KEY) {
      console.error('GOOGLE_AI_API_KEY is niet ingesteld op de server.');
      return response.status(500).json({ error: 'Server configuratiefout.' });
    }

    // 4. Stel de AI-prompt en de payload samen, net als we eerder deden.
    const systemPrompt = `
      JOUW ROL & DOEL: Jij bent een hyper-intelligente, ervaren assistent voor zelfstandige vakmensen in de Nederlandse bouw en techniek... [DE REST VAN DE PROMPT ZOALS VOORHEEN]
    `;

    const chatHistory = [
      {
        role: 'user',
        parts: [{ text: systemPrompt + '\n\nGebruiker input: ' + userInput }],
      },
    ];
    const payload = {
      contents: chatHistory,
      generationConfig: { responseMimeType: 'application/json' },
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_AI_API_KEY}`;

    // 5. Stuur het verzoek naar de Google AI API
    const aiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // 6. Controleer of de aanroep naar Google succesvol was
    if (!aiResponse.ok) {
      const errorBody = await aiResponse.text();
      console.error('Fout van Google AI API:', errorBody);
      return response
        .status(aiResponse.status)
        .json({ error: 'Fout bij het aanroepen van de AI.' });
    }

    const aiData = await aiResponse.json();

    // 7. Stuur het succesvolle antwoord van de AI terug naar jouw app
    return response.status(200).json(aiData);
  } catch (error) {
    console.error('Interne serverfout:', error);
    return response
      .status(500)
      .json({ error: 'Er is een onverwachte fout opgetreden.' });
  }
}
