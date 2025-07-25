// Importeer benodigde Firebase functies
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

console.log("app.js: Script geladen.");

// --- Globale Variabelen & UI Elementen ---
let scherm1, scherm2, scherm3, klusInput, planButton, planOutput, bewaarButton, annuleerButton, opgeslagenKlussenLijst, toast;
let db, auth;
let currentPlanData = null;
let userId, appId; // Globale variabelen voor authenticatie en app ID

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
  "slimmeWaarschuwingen": [ "Een praktische tip of waarschuwing.", "Een tweede tip." ]
}
REGELS: Baseer schattingen op realistische scenario's. De fasering moet logisch en chronologisch zijn. De "slimmeWaarschuwingen" moeten proactief en nuttig zijn. Genereer alléén het JSON-object, zonder extra tekst.
`;

// --- UI Functies ---

function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function toonScherm(schermId) {
    [scherm1, scherm2, scherm3].forEach(s => s.classList.add('hidden'));
    const activeScherm = document.getElementById(schermId);
    if (activeScherm) {
        activeScherm.classList.remove('hidden');
        activeScherm.classList.add('flex');
    }
}

function startNieuweKlus() {
    toonScherm('scherm1');
    klusInput.value = '';
    planOutput.innerHTML = '';
    currentPlanData = null;
}

// --- Firebase & Data Functies ---

function listenToKlussen() {
    if (!db || !userId) return; 
    console.log(`Firebase: Luisteren naar klussen voor user ${userId}`);
    const klussenCollection = collection(db, `artifacts/${appId}/users/${userId}/klussen`);
    // We halen de data ongesorteerd op om index-fouten te voorkomen en sorteren het in de code.
    const q = query(klussenCollection);

    onSnapshot(q, (snapshot) => {
        console.log(`Firebase: ${snapshot.size} klussen gevonden.`);
        if (snapshot.empty) {
            opgeslagenKlussenLijst.innerHTML = `<p class="text-slate-500 text-sm text-center py-4">Nog geen klussen opgeslagen.</p>`;
            return;
        }
        
        // Sorteer de documenten in de code (nieuwste eerst)
        const docs = snapshot.docs.sort((a, b) => {
            const timeA = a.data().createdAt?.toDate() || 0;
            const timeB = b.data().createdAt?.toDate() || 0;
            return timeB - timeA;
        });

        const klussenHTML = docs.map(doc => {
            const klus = doc.data();
            try {
                const plan = JSON.parse(klus.planData);
                 return `
                    <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm list-item-enter">
                        <p class="font-semibold text-slate-800">${plan.klusTitel}</p>
                        <p class="text-sm text-slate-500">${plan.schattingWerkdagen.min}-${plan.schattingWerkdagen.max} dagen</p>
                    </div>
                `;
            } catch(e) {
                console.error("Kon klus data niet parsen:", klus);
                return ''; // Sla corrupte data over
            }
        }).join('');
        opgeslagenKlussenLijst.innerHTML = klussenHTML;
    }, (error) => {
        console.error("Fout bij het ophalen van klussen:", error);
        showToast("Kon opgeslagen klussen niet laden.");
    });
}

async function bewaarPlan() {
    if (!currentPlanData || !db) {
        showToast("Kan niet opslaan. Geen databaseverbinding.");
        return;
    }
    bewaarButton.disabled = true;
    bewaarButton.innerHTML = "Opslaan...";
    
    try {
        const klussenCollection = collection(db, `artifacts/${appId}/users/${userId}/klussen`);
        await addDoc(klussenCollection, {
            userInput: currentPlanData.userInput,
            planData: JSON.stringify(currentPlanData),
            createdAt: serverTimestamp()
        });
        startNieuweKlus();
    } catch (error) {
        console.error("Fout bij opslaan:", error);
        showToast("Kon de klus niet opslaan.");
    } finally {
        bewaarButton.disabled = false;
        bewaarButton.innerHTML = "Bewaar & sluit";
    }
}

// --- AI Functie ---

async function genereerPlan() {
    const userInput = klusInput.value.trim();
    if (userInput === '') {
        showToast('Omschrijf eerst je klus.');
        return;
    }

    toonScherm('scherm2');
    planButton.disabled = true;
    planButton.innerHTML = '<div class="loader"></div>';

    try {
        const chatHistory = [{ role: "user", parts: [{ text: systemPrompt + "\n\nGebruiker input: " + userInput }] }];
        const payload = { contents: chatHistory, generationConfig: { responseMimeType: "application/json" } };
        const apiKey = "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
        
        const result = await response.json();
        if (result.candidates && result.candidates[0].content.parts.length > 0) {
            currentPlanData = JSON.parse(result.candidates[0].content.parts[0].text);
            currentPlanData.userInput = userInput;
            toonPlan(currentPlanData);
        } else {
            throw new Error("Ongeldig antwoord van de AI.");
        }
    } catch (error) {
        console.error("Fout bij het genereren:", error);
        showToast("Er is iets misgegaan. Probeer het opnieuw.");
        startNieuweKlus();
    } finally {
        planButton.disabled = false;
        planButton.innerHTML = 'Maak een slim plan';
    }
}

function toonPlan(data) {
    planOutput.innerHTML = `
        <div class="bg-white p-4 rounded-xl border border-slate-200"><h2 class="text-lg font-semibold">${data.klusTitel}</h2><p class="text-sm text-slate-500">Gestructureerd plan op basis van jouw input.</p></div>
        <div class="bg-white p-4 rounded-xl border border-slate-200"><div class="grid grid-cols-2 gap-4 text-center"><div><p class="text-2xl font-bold">${data.schattingUren.min}-${data.schattingUren.max}</p><p class="text-sm font-medium text-slate-500">Geschatte uren</p></div><div><p class="text-2xl font-bold">${data.schattingWerkdagen.min}-${data.schattingWerkdagen.max}</p><p class="text-sm font-medium text-slate-500">Werkdagen</p></div></div></div>
        <div class="bg-white p-4 rounded-xl border border-slate-200"><h3 class="font-semibold mb-3">Voorgestelde Fasering</h3><ul class="space-y-3 text-sm">${data.fasering.map(f => `<li class="flex items-start"><span class="mr-3 mt-1 w-4 h-4 text-white text-xs bg-blue-600 rounded-full flex items-center justify-center font-bold">${f.faseNummer}</span><div><span class="font-semibold">${f.titel}:</span> ${f.omschrijving}</div></li>`).join('')}</ul></div>
        <div class="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg"><div class="flex"><div class="flex-shrink-0"><svg class="h-5 w-5 text-amber-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></div><div class="ml-3"><h3 class="text-sm font-semibold text-amber-800">Slimme Waarschuwingen</h3><div class="mt-1 text-sm text-amber-700"><ul class="list-disc list-inside space-y-1">${data.slimmeWaarschuwingen.map(w => `<li>${w}</li>`).join('')}</ul></div></div></div></div>
    `;
    toonScherm('scherm3');
}

// --- Initialisatie ---

function initializeApp() {
    console.log("initializeApp: Starten...");
    // Koppel UI elementen aan variabelen
    scherm1 = document.getElementById('scherm1');
    scherm2 = document.getElementById('scherm2');
    scherm3 = document.getElementById('scherm3');
    klusInput = document.getElementById('klusInput');
    planButton = document.getElementById('planButton');
    planOutput = document.getElementById('planOutput');
    bewaarButton = document.getElementById('bewaarButton');
    annuleerButton = document.getElementById('annuleerButton');
    opgeslagenKlussenLijst = document.getElementById('opgeslagenKlussenLijst');
    toast = document.getElementById('toast');

    // Controleer of alle cruciale elementen bestaan
    if (!scherm1 || !planButton) {
        console.error("Cruciale UI elementen niet gevonden. App kan niet starten.");
        return;
    }

    // Koppel event listeners onmiddellijk
    planButton.addEventListener('click', genereerPlan);
    bewaarButton.addEventListener('click', bewaarPlan);
    annuleerButton.addEventListener('click', startNieuweKlus);
    
    // Start de Firebase connectie
    connectToFirebase();
}

async function connectToFirebase() {
    try {
        // Haal configuratie op
        appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        if (!firebaseConfig.apiKey) {
            showToast("Database configuratie ontbreekt.");
            return;
        }

        // Initialiseer Firebase
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Log de gebruiker in
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
        
        userId = auth.currentUser.uid;
        console.log("Firebase: Succesvol ingelogd met userId:", userId);
        
        // Start met luisteren naar data uit de database
        listenToKlussen();

    } catch (error) {
        console.error("Firebase initialisatie mislukt:", error);
        showToast("Kon geen verbinding maken met de database.");
    }
}

// Wacht tot de HTML volledig is geladen en start dan pas de app
document.addEventListener('DOMContentLoaded', initializeApp);
