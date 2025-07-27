// Importeer benodigde Firebase functies. Dit MOET op het hoogste niveau gebeuren.
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

// --- De volledige, correcte AI-prompt ---
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

// --- Globale Variabelen ---
let db, auth, userId, appId;
let currentPlanData = null;
let opgeslagenKlussen = []; // Array om de data van opgeslagen klussen vast te houden

// --- Hoofdfunctie van de App ---
function main() {
  console.log('App Main functie gestart.');

  // Koppel UI elementen aan variabelen
  const scherm1 = document.getElementById('scherm1');
  const scherm2 = document.getElementById('scherm2');
  const scherm3 = document.getElementById('scherm3');
  const klusInput = document.getElementById('klusInput');
  const planButton = document.getElementById('planButton');
  const planOutput = document.getElementById('planOutput');
  const bewaarButton = document.getElementById('bewaarButton');
  const annuleerButton = document.getElementById('annuleerButton');
  const opgeslagenKlussenLijst = document.getElementById(
    'opgeslagenKlussenLijst'
  );
  const toast = document.getElementById('toast');

  // --- UI Functies ---
  const showToast = (message, isError = true) => {
    if (!toast) return;
    toast.textContent = message;
    toast.style.backgroundColor = isError ? '#dc2626' : '#22c55e'; // Rood voor fout, groen voor succes
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  };

  const toonScherm = schermId => {
    [scherm1, scherm2, scherm3].forEach(s => s.classList.add('hidden'));
    document.getElementById(schermId).classList.remove('hidden');
    document.getElementById(schermId).classList.add('flex');
  };

  const startNieuweKlus = () => {
    toonScherm('scherm1');
    klusInput.value = '';
    planOutput.innerHTML = '';
    currentPlanData = null;
    bewaarButton.classList.remove('hidden');
    annuleerButton.textContent = 'Annuleren';
  };

  // --- Firebase & Data Functies ---
  const connectToFirebase = async () => {
    try {
      appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const firebaseConfigStr =
        typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';

      if (firebaseConfigStr === '{}') {
        console.warn(
          'Lokaal testen gedetecteerd. Firebase wordt overgeslagen.'
        );
        opgeslagenKlussenLijst.innerHTML = `<p class="text-slate-500 text-sm text-center py-4">Database is niet beschikbaar in lokale testmodus.</p>`;
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
      if (
        error.code !== 'auth/custom-token-mismatch' &&
        !error.message.includes('already exists')
      ) {
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
        const docs = snapshot.docs.sort(
          (a, b) =>
            (b.data().createdAt?.toDate() || 0) -
            (a.data().createdAt?.toDate() || 0)
        );
        opgeslagenKlussen = docs;
        if (docs.length === 0) {
          opgeslagenKlussenLijst.innerHTML = `<p class="text-slate-500 text-sm text-center py-4">Nog geen klussen opgeslagen.</p>`;
          return;
        }
        opgeslagenKlussenLijst.innerHTML = docs
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
    bewaarButton.disabled = true;
    bewaarButton.innerHTML = 'Opslaan...';
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
      bewaarButton.disabled = false;
      bewaarButton.innerHTML = 'Bewaar & sluit';
    }
  };

  // --- AI Functie ---
  const genereerPlan = async () => {
    const userInput = klusInput.value.trim();
    if (userInput === '') {
      showToast('Omschrijf eerst je klus.');
      return;
    }
    toonScherm('scherm2');
    planButton.disabled = true;
    planButton.innerHTML = '<div class="loader"></div>';
    try {
      setTimeout(() => {
        const voorbeeldPlan = {
          klusTitel: 'Badkamer renovatie (voorbeeld)',
          schattingUren: { min: 40, max: 48 },
          schattingWerkdagen: { min: 6, max: 8 },
          fasering: [
            {
              faseNummer: 1,
              titel: 'Slopen & Voorbereiden',
              duurDagen: 2,
              omschrijving:
                'Volledig strippen van de oude badkamer, afvoeren van puin en voorbereiden van de ondergrond en leidingen.',
            },
            {
              faseNummer: 2,
              titel: 'Leidingwerk & Vloer',
              duurDagen: 2,
              omschrijving:
                'Verleggen van waterleidingen en afvoer, installeren van de elektrische vloerverwarming en storten van de cementdekvloer.',
            },
          ],
          // NIEUW: Voorbeeld materialenlijst
          materialen: [
            'Vloerverwarming set (9m²)',
            'Inloopdouche (glaswand, drain)',
            'Wand- en vloertegels (ca. 25m²)',
            'Tegellijm en voegmiddel',
            'Kimband voor waterdichte hoeken',
            'Leidingen en koppelingen',
          ],
          slimmeWaarschuwingen: [
            'Houd rekening met de droogtijd van de cementdekvloer.',
            'Controleer de levertijd van het sanitair.',
          ],
        };
        currentPlanData = voorbeeldPlan;
        currentPlanData.userInput = userInput;
        toonPlan(currentPlanData);
      }, 1500);
    } catch (error) {
      console.error('Fout bij genereren:', error);
      showToast('Er is iets misgegaan. Probeer het opnieuw.');
      startNieuweKlus();
    } finally {
      planButton.disabled = false;
      planButton.innerHTML = 'Maak een slim plan';
    }
  };

  const toonPlan = (data, isViewing) => {
    // NIEUW: HTML voor de materialenlijst
    const materialenHTML =
      data.materialen && data.materialen.length > 0
        ? `
            <div class="bg-white p-4 rounded-xl border border-slate-200">
                <h3 class="font-semibold mb-3 text-slate-800">Benodigde Materialen</h3>
                <ul class="space-y-2 text-sm list-disc list-inside">
                    ${data.materialen.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
        `
        : '';

    planOutput.innerHTML = `
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

    if (isViewing) {
      bewaarButton.classList.add('hidden');
      annuleerButton.textContent = 'Terug naar overzicht';
    } else {
      bewaarButton.classList.remove('hidden');
      annuleerButton.textContent = 'Annuleren';
    }

    toonScherm('scherm3');
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

  // Koppel event listeners
  planButton.addEventListener('click', genereerPlan);
  bewaarButton.addEventListener('click', bewaarPlan);
  annuleerButton.addEventListener('click', startNieuweKlus);

  opgeslagenKlussenLijst.addEventListener('click', event => {
    const listItem = event.target.closest('[data-id]');
    if (listItem) {
      const docId = listItem.dataset.id;
      toonOpgeslagenPlan(docId);
    }
  });

  connectToFirebase();
}

// --- Startpunt van de App ---
document.addEventListener('DOMContentLoaded', main);
