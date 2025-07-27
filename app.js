// =================================================================
// KLUSASSISTENT APP - v6 (Stabiel, met financiële features)
// =================================================================

// --- Stap 1: Imports ---
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
let db, auth, userId, appId;
let currentPlanData = null;
let opgeslagenKlussen = [];

// --- Stap 3: De Hoofdfunctie (Entry Point) ---
function main() {
  console.log('App gestart. UI wordt geïnitialiseerd.');

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

  // --- AI Functie ---
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
      const apiUrl = '/api/proxy';
      const payload = { userInput: userInput };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Serverfout: ${response.status}`);
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
      showToast(error.message);
      startNieuweKlus();
    } finally {
      ui.planButton.disabled = false;
      ui.planButton.innerHTML = 'Maak een slim plan';
    }
  };

  const toonPlan = (data, isViewing = false) => {
    // **BUGFIX & FEATURE:** Correcte weergave van materialen MET kosten
    const materialenHTML =
      data.materialen && data.materialen.length > 0
        ? `
            <div class="bg-white p-4 rounded-xl border border-slate-200">
                <h3 class="font-semibold mb-3 text-slate-800">Benodigde Materialen</h3>
                <div class="space-y-3">
                    ${data.materialen
                      .map(
                        cat => `
                        <div>
                            <h4 class="font-medium text-sm text-slate-600">${
                              cat.categorie
                            }</h4>
                            <ul class="space-y-1 text-sm list-disc list-inside pl-2">
                                ${cat.items
                                  .map(
                                    item =>
                                      `<li>${item.item} <span class="text-slate-500">(schatting: €${item.schattingKosten})</span></li>`
                                  )
                                  .join('')}
                            </ul>
                        </div>
                    `
                      )
                      .join('')}
                </div>
            </div>
        `
        : '';

    const aannamesHTML =
      data.aannames && data.aannames.length > 0
        ? `
            <div class="bg-white p-4 rounded-xl border border-slate-200">
                <h3 class="font-semibold mb-3 text-slate-800">Aannames</h3>
                <ul class="space-y-1 text-sm list-disc list-inside">
                    ${data.aannames.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
        `
        : '';

    // **FEATURE:** Weergave van de geschatte totaalprijs
    const prijsopgaveHTML = data.schattingPrijsopgave
      ? `
            <div class="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                <h3 class="font-bold text-blue-800">Geschatte Prijsopgave (excl. BTW)</h3>
                <p class="text-2xl font-bold text-blue-900 mt-1">€${data.schattingPrijsopgave.min} - €${data.schattingPrijsopgave.max}</p>
                <p class="text-xs text-slate-500 mt-1">Gebaseerd op geschatte uren en materiaalkosten.</p>
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
            ${aannamesHTML}
            <div class="bg-white p-4 rounded-xl border border-slate-200"><h3 class="font-semibold mb-3">Voorgestelde Fasering</h3><ul class="space-y-3 text-sm">${data.fasering
              .map(
                f =>
                  `<li class="flex items-start"><span class="mr-3 mt-1 w-4 h-4 text-white text-xs bg-blue-600 rounded-full flex items-center justify-center font-bold">${f.faseNummer}</span><div><span class="font-semibold">${f.titel}</span> <span class="text-slate-500">(~${f.schattingUren} uur)</span>: ${f.omschrijving}</div></li>`
              )
              .join('')}</ul></div>
            ${materialenHTML}
            <div class="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg"><div class="flex"><div class="flex-shrink-0"><svg class="h-5 w-5 text-amber-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></div><div class="ml-3"><h3 class="text-sm font-semibold text-amber-800">Slimme Waarschuwingen</h3><div class="mt-1 text-sm text-amber-700"><ul class="list-disc list-inside space-y-1">${data.slimmeWaarschuwingen
              .map(w => `<li>${w}</li>`)
              .join('')}</ul></div></div></div></div>
            ${prijsopgaveHTML}
        `;

    ui.bewaarButton.classList.toggle('hidden', isViewing);
    ui.annuleerButton.textContent = isViewing
      ? 'Terug naar overzicht'
      : 'Annuleren';
    toonScherm('scherm3');
  };

  // --- Firebase & Data Functies ---
  const connectToFirebase = async () => {
    try {
      appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const firebaseConfigStr =
        typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';

      if (firebaseConfigStr === '{}') {
        console.warn('Lokaal testen: Firebase wordt overgeslagen.');
        ui.opgeslagenKlussenLijst.innerHTML = `<p class="text-slate-500 text-sm text-center py-4">Database is niet beschikbaar in lokale testmodus.</p>`;
        return;
      }

      const firebaseConfig = JSON.parse(firebaseConfigStr);
      const initialAuthToken =
        typeof __initial_auth_token !== 'undefined'
          ? __initial_auth_token
          : null;

      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      auth = getAuth(app);

      if (initialAuthToken) {
        await signInWithCustomToken(auth, initialAuthToken);
      } else {
        await signInAnonymously(auth);
      }

      userId = auth.currentUser.uid;
      listenToKlussen();
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('Firebase initialisatie mislukt:', error);
        showToast('Kon geen verbinding maken met de database.');
      }
    }
  };

  const listenToKlussen = () => {
    if (!db || !userId) return;
    const klussenCollection = collection(
      db,
      `artifacts/${appId}/users/${userId}/klussen`
    );
    const q = query(klussenCollection);

    onSnapshot(
      q,
      snapshot => {
        opgeslagenKlussen = snapshot.docs.sort(
          (a, b) =>
            (b.data().createdAt?.toDate() || 0) -
            (a.data().createdAt?.toDate() || 0)
        );
        if (opgeslagenKlussen.length === 0) {
          ui.opgeslagenKlussenLijst.innerHTML = `<p class="text-slate-500 text-sm text-center py-4">Nog geen klussen opgeslagen.</p>`;
          return;
        }
        ui.opgeslagenKlussenLijst.innerHTML = opgeslagenKlussen
          .map(doc => {
            try {
              const plan = JSON.parse(doc.data().planData);
              return `<div data-id="${doc.id}" class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm list-item-enter cursor-pointer hover:bg-slate-100 transition"><p class="font-semibold text-slate-800 pointer-events-none">${plan.klusTitel}</p><p class="text-sm text-slate-500 pointer-events-none">${plan.schattingWerkdagen.min}-${plan.schattingWerkdagen.max} dagen</p></div>`;
            } catch (e) {
              return '';
            }
          })
          .join('');
      },
      error => {
        console.error('Fout bij ophalen klussen:', error);
        showToast('Kon opgeslagen klussen niet laden.');
      }
    );
  };

  const bewaarPlan = async () => {
    if (!currentPlanData) return;
    if (!db) {
      showToast('Opslaan niet mogelijk in lokale testmodus.');
      return;
    }
    ui.bewaarButton.disabled = true;
    ui.bewaarButton.innerHTML = 'Opslaan...';
    try {
      const klussenCollection = collection(
        db,
        `artifacts/${appId}/users/${userId}/klussen`
      );
      await addDoc(klussenCollection, {
        userInput: currentPlanData.userInput,
        planData: JSON.stringify(currentPlanData),
        createdAt: serverTimestamp(),
      });
      showToast('Klus opgeslagen!', false);
      startNieuweKlus();
    } catch (error) {
      console.error('Fout bij opslaan:', error);
      showToast('Kon de klus niet opslaan.');
    } finally {
      ui.bewaarButton.disabled = false;
      ui.bewaarButton.innerHTML = 'Bewaar & sluit';
    }
  };

  const toonOpgeslagenPlan = docId => {
    const doc = opgeslagenKlussen.find(d => d.id === docId);
    if (doc) {
      try {
        const planData = JSON.parse(doc.data().planData);
        currentPlanData = planData;
        toonPlan(planData, true);
      } catch (e) {
        showToast('Kon dit opgeslagen plan niet openen.');
      }
    }
  };

  // --- Event Listeners ---
  ui.planButton.addEventListener('click', genereerPlan);
  ui.bewaarButton.addEventListener('click', bewaarPlan);
  ui.annuleerButton.addEventListener('click', startNieuweKlus);
  ui.opgeslagenKlussenLijst.addEventListener('click', event => {
    const listItem = event.target.closest('[data-id]');
    if (listItem) {
      toonOpgeslagenPlan(listItem.dataset.id);
    }
  });

  connectToFirebase();
}

// --- Startpunt van de App ---
document.addEventListener('DOMContentLoaded', main);
