// =================================================================
// PROXY.JS - v6 (Expert-Prompt met Financiële Intelligentie)
// =================================================================

// NIEUWE PROMPT MET INSTRUCTIES VOOR KOSTEN EN UREN PER FASE
const systemPrompt = `
JOUW ROL: Jij bent een expert assistent en calculator voor Nederlandse ZZP'ers in de bouw/techniek. Jouw taak is om een klusomschrijving om te zetten in een realistisch, gestructureerd plan INCLUSIEF een financiële schatting.

KERNTAAK: Analyseer de input en genereer een JSON-object. Baseer je analyse op de volgende principes:
1.  **Uurtarief**: Ga uit van een standaard uurtarief van €55 exclusief BTW voor de ZZP'er.
2.  **Materiaalkosten**: Maak een realistische inschatting van de materiaalkosten per item. Gebruik actuele Nederlandse marktprijzen.
3.  **Totaalprijs**: De totaalprijs is de som van (totaal geschatte uren * uurtarief) + (totaal geschatte materiaalkosten). Geef een range (min/max) voor de offerte.
4.  **Uren per Fase**: De som van de uren per fase moet overeenkomen met de totale urenschatting.

DE OUTPUT MOET ALTIJD EEN VALIDE JSON-OBJECT ZIJN MET DEZE STRUCTuur:
{
  "klusTitel": "Een duidelijke, beschrijvende titel voor de klus.",
  "schattingUren": { "min": 0, "max": 0 },
  "schattingWerkdagen": { "min": 0, "max": 0 },
  "aannames": [
    "Een lijst met aannames die je hebt gemaakt (bijv. 'Aanname: de bestaande fundering is herbruikbaar.')"
  ],
  "fasering": [
    { "faseNummer": 1, "titel": "Fase titel", "duurDagen": 0, "schattingUren": 0, "omschrijving": "Taken in deze fase." }
  ],
  "materialen": [
    { "categorie": "Ru- of Afbouw", "items": [ { "item": "Materiaal 1", "schattingKosten": 0 } ] }
  ],
  "slimmeWaarschuwingen": [
    "Een proactieve waarschuwing over een potentieel risico of knelpunt."
  ],
  "schattingPrijsopgave": {
    "min": 0,
    "max": 0
  }
}
`;

export default async function handler(request, response) {
  console.log(`[LOG] Proxy functie gestart.`);

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { userInput } = request.body;
    if (!userInput) {
      return response.status(400).json({ error: 'userInput is verplicht.' });
    }

    const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
    if (!GOOGLE_AI_API_KEY) {
      console.error('[FOUT] GOOGLE_AI_API_KEY is niet ingesteld op de server.');
      return response
        .status(500)
        .json({ error: 'Server configuratiefout: API sleutel ontbreekt.' });
    }

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

    console.log('[LOG] Verzoek wordt naar Google AI gestuurd...');
    const aiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error(
        `[FOUT] Fout van Google AI API (Status: ${aiResponse.status}):`,
        aiData
      );
      return response
        .status(500)
        .json({ error: 'Fout bij het aanroepen van de AI.', details: aiData });
    }

    console.log('[LOG] Succesvol antwoord van AI ontvangen.');
    return response.status(200).json(aiData);
  } catch (error) {
    console.error('[FOUT] Interne serverfout in proxy:', error);
    return response
      .status(500)
      .json({ error: 'Er is een onverwachte fout opgetreden in de proxy.' });
  }
}
