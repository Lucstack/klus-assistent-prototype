// =================================================================
// KLUSASSISTENT APP - v4 (Stabiele Versie)
// =================================================================

// --- Stap 1: Imports ---
// Alle benodigde modules worden hier bovenaan geïmporteerd.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- Stap 2: Globale Variabelen ---
// Hier definiëren we alle variabelen die we in de hele app nodig hebben.
let db, auth, userId, appId;
let currentPlanData = null;
let opgeslagenKlussen = [];

// --- Stap 3: De Hoofdfunctie (Entry Point) ---
// Deze functie wordt aangeroepen zodra de HTML-pagina volledig is geladen.
function main() {
  console.log('App gestart. UI wordt geïnitialiseerd.');

  // Koppel variabelen aan de HTML-elementen
  const ui = {
    scherm1: document.getElementById('scherm1'),
    scherm2: document.getElementById('scherm2'),
    scherm3: document.getElementById('scherm3'),
    klusInput: document.getElementById('klusInput'),
    planButton: document.getElementById('planButton'),
    planOutput: document.getElementById('planOutput'),
    bewaarButton: document.getElementById('bewaarButton'),
    annuleerButton: document.getElementById('annuleerButton'),
    opgeslagenKlussenLijst: document.getElementById('opgeslagenKlussenLijst'),
    toast: document.getElementById('toast'),
  };

  // --- UI Functies ---
  const showToast = (message, isError = true) => {
    ui.toast.textContent = message;
    ui.toast.style.backgroundColor = isError ? '#dc2626' : '#22c55e';
    ui.toast.classList.add('show');
    setTimeout(() => {
      ui.toast.classList.remove('show');
    }, 3000);
  };

  const toonScherm = schermId => {
    [ui.scherm1, ui.scherm2, ui.scherm3].forEach(s =>
      s.classList.add('hidden')
    );
    document.getElementById(schermId).classList.remove('hidden');
    document.getElementById(schermId).classList.add('flex');
  };

  const startNieuweKlus = () => {
    toonScherm('scherm1');
    ui.klusInput.value = '';
    ui.planOutput.innerHTML = '';
    currentPlanData = null;
    ui.bewaarButton.classList.remove('hidden');
    ui.annuleerButton.textContent = 'Annuleren';
  };

  // --- AI Functie (roept nu onze veilige backend aan) ---
  const genereerPlan = async () => {
    const userInput = ui.klusInput.value.trim();
    if (userInput === '') {
      showToast('Omschrijf eerst je klus.');
      return;
    }
    toonScherm('scherm2');
    ui.planButton.disabled = true;
    ui.planButton.innerHTML = '<div class="loader"></div>';

    try {
      // Dit is de URL naar onze veilige proxy-functie op Vercel.
      const apiUrl = '/api/proxy';
      const payload = { userInput: userInput };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Serverfout: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.candidates && result.candidates[0].content.parts.length > 0) {
        currentPlanData = JSON.parse(
          result.candidates[0].content.parts[0].text
        );
        currentPlanData.userInput = userInput;
        toonPlan(currentPlanData);
      } else {
        throw new Error('Ongeldig antwoord van de AI.');
      }
    } catch (error) {
      console.error('Fout bij genereren:', error);
      showToast('Kon het plan niet genereren. Probeer het opnieuw.');
      startNieuweKlus();
    } finally {
      ui.planButton.disabled = false;
      ui.planButton.innerHTML = 'Maak een slim plan';
    }
  };

  const toonPlan = (data, isViewing = false) => {
    const materialenHTML =
      data.materialen && data.materialen.length > 0
        ? `
            <div class="bg-white p-4 rounded-xl border border-slate-200">
                <h3 class="font-semibold mb-3 text-slate-800">Benodigde Materialen</h3>
                <ul class="space-y-2 text-sm list-disc list-inside">${data.materialen
                  .map(item => `<li>${item}</li>`)
                  .join('')}</ul>
            </div>
        `
        : '';

    ui.planOutput.innerHTML = `
            <div class="bg-white p-4 rounded-xl border border-slate-200"><h2 class="text-lg font-semibold">${
              data.klusTitel
            }</h2><p class="text-sm text-slate-500">Gestructureerd plan op basis van jouw input.</p></div>
            <div class="bg-white p-4 rounded-xl border border-slate-200"><div class="grid grid-cols-2 gap-4 text-center"><div><p class="text-2xl font-bold">${
              data.schattingUren.min
            }-${
      data.schattingUren.max
    }</p><p class="text-sm font-medium text-slate-500">Geschatte uren</p></div><div><p class="text-2xl font-bold">${
      data.schattingWerkdagen.min
    }-${
      data.schattingWerkdagen.max
    }</p><p class="text-sm font-medium text-slate-500">Werkdagen</p></div></div></div>
            <div class="bg-white p-4 rounded-xl border border-slate-200"><h3 class="font-semibold mb-3">Voorgestelde Fasering</h3><ul class="space-y-3 text-sm">${data.fasering
              .map(
                f =>
                  `<li class="flex items-start"><span class="mr-3 mt-1 w-4 h-4 text-white text-xs bg-blue-600 rounded-full flex items-center justify-center font-bold">${f.faseNummer}</span><div><span class="font-semibold">${f.titel}:</span> ${f.omschrijving}</div></li>`
              )
              .join('')}</ul></div>
            ${materialenHTML}
            <div class="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg"><div class="flex"><div class="flex-shrink-0"><svg class="h-5 w-5 text-amber-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></div><div class="ml-3"><h3 class="text-sm font-semibold text-amber-800">Slimme Waarschuwingen</h3><div class="mt-1 text-sm text-amber-700"><ul class="list-disc list-inside space-y-1">${data.slimmeWaarschuwingen
              .map(w => `<li>${w}</li>`)
              .join('')}</ul></div></div></div></div>
        `;

    ui.bewaarButton.classList.toggle('hidden', isViewing);
    ui.annuleerButton.textContent = isViewing
      ? 'Terug naar overzicht'
      : 'Annuleren';
    toonScherm('scherm3');
  };

  // --- Event Listeners ---
  ui.planButton.addEventListener('click', genereerPlan);
  ui.annuleerButton.addEventListener('click', startNieuweKlus);

  // De rest van de functies (Firebase, etc.) blijft hetzelfde,
  // maar we voegen ze hier niet toe om de focus op de werkende kern te houden.
  // Dit is een stabiele basis om verder op te bouwen.
}

// --- Stap 4: Start de App ---
// Wacht tot de DOM volledig geladen is en roep dan de hoofdfunctie aan.
document.addEventListener('DOMContentLoaded', main);
