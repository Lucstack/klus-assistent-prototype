// =================================================================
// PROXY.JS - v3 (Stabiel, zonder externe dependencies)
// =================================================================

// De AI-prompt staat hier, zodat we hem niet elke keer hoeven mee te sturen vanuit de frontend.
const systemPrompt = `
JOUW ROL & DOEL: Jij bent een hyper-intelligente, ervaren assistent voor zelfstandige vakmensen in de Nederlandse bouw en techniek. Jouw doel is om een korte, vaak ongestructureerde klusomschrijving om te zetten in een helder, praktisch en gestructureerd plan van aanpak. Je bent betrouwbaar, to-the-point en je denkt altijd een stap vooruit.
DE GEBRUIKER: De gebruiker is een drukke ZZP'er (timmerman, installateur, etc.). Hij heeft geen tijd voor onzin. Hij wil snel inzicht en overzicht.
DE OUTPUT (CRUCIAAL): Jouw antwoord MOET ALTIJD en UITSLUITEND een valide JSON-object zijn. Gebruik de volgende structuur:
{
  "klusTitel": "Korte, pakkende titel voor de klus",
  "schattingUren": { "min": 0, "max": 0 },
  "schattingWerkdagen": { "min": 0, "max": 0 },
  "fasering": [ { "faseNummer": 1, "titel": "Korte titel", "duurDagen": 0, "omschrijving": "Omschrijving van de taken." } ],
  "materialen": [ "Benodigd materiaal 1", "Benodigd materiaal 2" ],
  "slimmeWaarschuwingen": [ "Een praktische tip of waarschuwing.", "Een tweede tip." ]
}
REGELS: Baseer schattingen op realistische scenario's. De fasering moet logisch en chronologisch zijn. De "slimmeWaarschuwingen" moeten proactief en nuttig zijn. De "materialen" lijst moet de belangrijkste benodigde items bevatten. Genereer alléén het JSON-object, zonder extra tekst.
`;

// De export default handler is de standaard manier om een Vercel serverless functie te definiëren.
export default async function handler(request, response) {
  // Log dat de functie is gestart in de Vercel logs
  console.log(`Proxy functie aangeroepen.`);

  // Sta alleen POST-verzoeken toe
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Haal de userInput uit de body van het verzoek
    const { userInput } = request.body;
    if (!userInput) {
      return response.status(400).json({ error: 'userInput is verplicht.' });
    }

    // Haal de geheime API-sleutel op uit de Vercel Environment Variables
    const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
    if (!GOOGLE_AI_API_KEY) {
      console.error('SERVER FOUT: GOOGLE_AI_API_KEY is niet ingesteld.');
      return response
        .status(500)
        .json({ error: 'Server configuratiefout: API sleutel ontbreekt.' });
    }

    // Stel de payload samen voor de Google AI API
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

    // Gebruik de ingebouwde 'fetch' om het verzoek naar Google AI te sturen
    const aiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Vang de data op
    const aiData = await aiResponse.json();

    // Als de aanroep naar Google niet succesvol was, stuur de fout door
    if (!aiResponse.ok) {
      console.error('Fout van Google AI API:', aiData);
      return response
        .status(500)
        .json({ error: 'Fout bij het aanroepen van de AI.', details: aiData });
    }

    // Stuur het succesvolle antwoord van de AI terug naar de frontend app
    return response.status(200).json(aiData);
  } catch (error) {
    console.error('Interne serverfout in proxy:', error);
    return response
      .status(500)
      .json({ error: 'Er is een onverwachte fout opgetreden in de proxy.' });
  }
}
