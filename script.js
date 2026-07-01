let gardenTitle = "🌿 Gestione Piante Tropicali - Pro"; 
let gardenNotes = ""; 
let plantsDatabase = [];
let currentPlantId = null;
let map = null;
let marker = null;
let growthChart = null;
let eventsChart = null;
let globalEvChart = null;
let html5QrcodeScanner = null; 
let editingMode = false;
let unsavedChanges = false;
let currentQuickFilter = 'all';

// Variabili per la Mappa Globale
let globalMap = null;
let globalMapMarkers = null;

// Variabili Batch
let isBatchMode = false;
let selectedBatchPlants = new Set();

let vendorMode = 'select';
let soilMode = 'select';
let mainPhotoRemoved = false; 
let fruitPhotoRemoved = false; 

// ==========================================
// SISTEMA DI AUTO-SALVATAGGIO (IndexedDB)
// ==========================================
const DB_NAME = 'TropicalGardenDB';
const STORE_NAME = 'GardenStore';

function initDB() {
    return new Promise((resolve, reject) => {
        let request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = function(e) {
            let db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = function(e) { resolve(e.target.result); };
        request.onerror = function(e) { reject(e.target.error); };
    });
}

async function saveToLocal() {
    try {
        let db = await initDB();
        let tx = db.transaction(STORE_NAME, 'readwrite');
        let store = tx.objectStore(STORE_NAME);
        const data = { title: gardenTitle, notes: gardenNotes, plants: plantsDatabase };
        store.put(data, 'autosave_data');
        showAutoSaveToast();
    } catch(e) {
        console.error("Errore durante l'auto-salvataggio:", e);
    }
}

async function loadFromLocal() {
    try {
        let db = await initDB();
        let tx = db.transaction(STORE_NAME, 'readonly');
        let store = tx.objectStore(STORE_NAME);
        let request = store.get('autosave_data');
        request.onsuccess = function() {
            let data = request.result;
            if (data && data.plants && data.plants.length > 0) {
                gardenTitle = data.title || "🌿 Gestione Piante Tropicali - Pro";
                gardenNotes = data.notes || "";
                plantsDatabase = data.plants;
                document.getElementById('main-title').innerText = gardenTitle;
                
                document.getElementById('startup-screen').classList.add('hidden');
                startAppUI();
            }
        };
    } catch(e) {
        console.error("Nessun salvataggio locale trovato o errore:", e);
    }
}

function showAutoSaveToast() {
    const toast = document.getElementById('autosave-toast');
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 2000);
}

window.addEventListener('DOMContentLoaded', loadFromLocal);

window.addEventListener('beforeunload', function (e) {
    if (unsavedChanges) { e.preventDefault(); e.returnValue = 'Hai delle modifiche non salvate in ZIP!'; }
});

// ==========================================
// FUNZIONI DI BASE
// ==========================================

function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, function(tag) {
        const charsToReplace = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return charsToReplace[tag] || tag;
    });
}

function formatDateIt(dateStr) {
    if (!dateStr) return 'N/D';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
}

function renderFornitore(vendorText) {
    if (!vendorText) return 'N/D';
    let trimmed = vendorText.trim(); let displayRaw = trimmed;
    if (displayRaw.length > 35) displayRaw = displayRaw.substring(0, 35) + '...';
    let safeHref = escapeHTML(trimmed); let safeDisplay = escapeHTML(displayRaw);
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) { return `<a href="${safeHref}" target="_blank" style="color: var(--primary); font-weight:bold; text-decoration: underline;" title="${safeHref}">${safeDisplay}</a>`; } 
    else if (trimmed.startsWith('www.')) { return `<a href="https://${safeHref}" target="_blank" style="color: var(--primary); font-weight:bold; text-decoration: underline;" title="${safeHref}">${safeDisplay}</a>`; }
    return escapeHTML(trimmed);
}

function compressImageAsync(file) {
    return new Promise((resolve) => {
        const reader = new FileReader(); 
        reader.onload = function (event) {
            const img = new Image(); 
            img.onload = function () {
                const MAX_DIM = 500; let width = img.width; let height = img.height;
                if (width > height) { if (width > MAX_DIM) { height = Math.round(height * (MAX_DIM / width)); width = MAX_DIM; } } 
                else { if (height > MAX_DIM) { width = Math.round(width * (MAX_DIM / height)); height = MAX_DIM; } }
                const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                let dataUrl = canvas.toDataURL('image/webp', 0.5);
                if (!dataUrl.startsWith('data:image/webp')) { dataUrl = canvas.toDataURL('image/jpeg', 0.5); }
                resolve(dataUrl);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function editMainTitle() {
    let currentCleanText = gardenTitle.replace('🌿 ', '');
    let newTitle = prompt("Inserisci il nuovo titolo del tuo giardino:", currentCleanText);
    if (newTitle !== null && newTitle.trim() !== "") { 
        gardenTitle = "🌿 " + newTitle.trim(); 
        document.getElementById('main-title').innerText = gardenTitle; 
        unsavedChanges = true;
        saveToLocal(); 
    }
}

// --- LOGICHE AVVIO E USCITA ---

function startAppUI() {
    document.getElementById('dashboard').classList.remove('hidden'); 
    document.getElementById('dashboard-controls').classList.remove('hidden'); 
    document.getElementById('dashboard-stats').classList.remove('hidden'); 
    document.getElementById('plants-grid').classList.remove('hidden');
    if (currentQuickFilter === 'gelo') { document.getElementById('frost-emergency-box').classList.remove('hidden'); }
    renderPlants();
}

function createNewGarden() {
    if(plantsDatabase.length > 0) {
        if(!confirm("⚠️ ATTENZIONE: Creando un nuovo profilo ora, perderai l'accesso al giardino attuale (a meno che tu non abbia salvato il Backup ZIP). Vuoi procedere?")) return;
    }
    plantsDatabase = [];
    gardenTitle = "🌿 Gestione Piante Tropicali - Pro";
    gardenNotes = "";
    document.getElementById('main-title').innerText = gardenTitle;
    startNewProfile();
}

function startNewProfile() {
    document.getElementById('startup-screen').classList.add('hidden'); 
    document.getElementById('archive-page').classList.add('hidden'); 
    document.getElementById('my-data-page').classList.add('hidden'); 
    document.getElementById('global-map-page').classList.add('hidden');
    startAppUI();
    saveToLocal(); 
}

function logout() {
    if(confirm("Vuoi davvero uscire dal giardino? Assicurati di aver esportato il Backup se devi spostare i dati su un altro PC.")) {
        document.getElementById('dashboard').classList.add('hidden');
        document.getElementById('my-data-page').classList.add('hidden');
        document.getElementById('archive-page').classList.add('hidden');
        document.getElementById('plant-detail-view').classList.add('hidden');
        document.getElementById('global-map-page').classList.add('hidden');
        document.getElementById('form-container').classList.add('hidden');
        
        document.getElementById('startup-screen').classList.remove('hidden');
    }
}

// GESTIONE FILTRI E GELO
function setQuickFilter(filterType, btnElement) {
    if (filterType === 'gelo') {
        let tempInput = prompt("❄️ ALLARME GELO\nInserisci la temperatura minima prevista stanotte (es. 3):\n\nIl sistema ti mostrerà in automatico le piante in pericolo (cioè quelle che richiedono una temperatura minima uguale o superiore a quella che inserisci).", "0");
        
        if (tempInput === null || tempInput.trim() === "") {
            return; 
        }
        
        let parsedTemp = parseFloat(tempInput);
        if (isNaN(parsedTemp)) {
            alert("Per favore, inserisci un numero valido.");
            return;
        }
        
        frostThreshold = parsedTemp;
        btnElement.innerText = `❄️ Gelo (Previsti ${frostThreshold}°C)`;
    } else {
        const geloBtn = document.querySelector('.filter-chip.gelo');
        if(geloBtn) geloBtn.innerText = "❄️ Gelo";
    }

    currentQuickFilter = filterType;
    document.querySelectorAll('.filter-chip').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    
    const frostBox = document.getElementById('frost-emergency-box');
    if (filterType === 'gelo') {
        frostBox.classList.remove('hidden');
    } else {
        frostBox.classList.add('hidden');
    }

    renderPlants(); 
}

// --- LOGICHE BATCH (MACRO) ---
function toggleBatchMode() {
    isBatchMode = !isBatchMode; selectedBatchPlants.clear();
    const btn = document.getElementById('btn-batch-mode');
    if (isBatchMode) { btn.classList.replace('btn-warning', 'btn-danger'); btn.innerText = "Termina selezione"; document.getElementById('batch-action-bar').classList.remove('hidden'); } 
    else { btn.classList.replace('btn-danger', 'btn-warning'); btn.innerText = "☑️ Macro"; document.getElementById('batch-action-bar').classList.add('hidden'); }
    updateBatchCounter(); renderPlants(); 
}

function updateBatchCounter() { document.getElementById('batch-count').innerText = `${selectedBatchPlants.size} piante selezionate`; }

function openBatchModal() {
    if (selectedBatchPlants.size === 0) return alert("Seleziona prima almeno una pianta toccandola!");
    document.getElementById('batch-log-date').valueAsDate = new Date(); document.getElementById('batch-log-note').value = "";
    document.getElementById('batch-modal-overlay').style.display = 'flex';
}

function closeBatchModal() { document.getElementById('batch-modal-overlay').style.display = 'none'; }

function confirmBatchLog() {
    const date = document.getElementById('batch-log-date').value; const type = document.getElementById('batch-log-type').value; const note = document.getElementById('batch-log-note').value.trim();
    if(!date) return alert("Inserisci la data dell'evento."); if(!note) return alert("Inserisci una nota (es. prodotto usato o motivo dello spostamento).");
    
    let indexCounter = 0;
    plantsDatabase.forEach(p => {
        if (selectedBatchPlants.has(p.id)) { 
            p.logs.push({ 
                id: Date.now() + indexCounter + Math.floor(Math.random() * 1000), 
                date: date, type: type, note: note, height: null, harvest: null, ph: null, placement: null, potSize: null, graftName: null, photo: "" 
            }); 
            indexCounter++;
        }
    });
    unsavedChanges = true; saveToLocal(); 
    closeBatchModal(); toggleBatchMode(); alert(`Evento aggiunto con successo a ${selectedBatchPlants.size} piante!`);
}

// --- I MIEI DATI & ARCHIVIO ---
function openMyDataView() { 
    document.getElementById('dashboard').classList.add('hidden'); 
    document.getElementById('my-data-page').classList.remove('hidden'); 
    document.getElementById('general-list-container').classList.add('hidden');
    document.getElementById('global-garden-notes').value = gardenNotes || ""; 
    renderMyData(); window.scrollTo({ top: 0, behavior: 'smooth' }); 
}

function closeMyDataView() { document.getElementById('my-data-page').classList.add('hidden'); document.getElementById('dashboard').classList.remove('hidden'); }
function openArchiveView() { document.getElementById('my-data-page').classList.add('hidden'); document.getElementById('archive-page').classList.remove('hidden'); renderArchive(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function closeArchiveView() { document.getElementById('archive-page').classList.add('hidden'); document.getElementById('my-data-page').classList.remove('hidden'); }

function toggleGeneralList() {
    const container = document.getElementById('general-list-container');
    const textarea = document.getElementById('general-list-textarea');
    if (container.classList.contains('hidden')) {
        let activePlants = plantsDatabase.filter(p => p.status !== 'archived');
        activePlants.sort((a, b) => a.name.localeCompare(b.name));
        let listText = activePlants.map(p => `${p.name}${p.scientific ? ' - ' + p.scientific : ''}`).join('\n');
        if (listText === '') listText = 'Nessuna pianta nel giardino.';
        textarea.value = listText;
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}

function saveGardenNotes() {
    gardenNotes = document.getElementById('global-garden-notes').value; 
    unsavedChanges = true; saveToLocal(); 
    const status = document.getElementById('global-notes-status'); status.style.display = 'block'; setTimeout(() => { status.style.display = 'none'; }, 3000);
}

function renderMyData() {
    const container = document.getElementById('my-data-content');
    let vendorCounts = {}; let soilCounts = {}; let locCounts = {};
    let inVaso = 0; let inTerra = 0; let daSeme = 0; let innestate = 0; let archivedCount = 0;

    plantsDatabase.forEach(p => {
        if (p.status === 'archived') { archivedCount++; } else {
            if (p.vendor) vendorCounts[p.vendor] = (vendorCounts[p.vendor] || 0) + 1;
            if (p.soil) soilCounts[p.soil] = (soilCounts[p.soil] || 0) + 1;
            if (p.location) locCounts[p.location] = (locCounts[p.location] || 0) + 1;
            if (p.placement === 'Vaso') inVaso++;
            if (p.placement === 'Piena terra') inTerra++;
            if (p.origin === 'Da seme') daSeme++;
            if (p.origin === 'Innesto') innestate++;
        }
    });
    const makeList = (obj) => { let keys = Object.keys(obj).sort(); if(keys.length === 0) return "<li>Nessun dato</li>"; return keys.map(k => `<li>${escapeHTML(k)} <em>(${obj[k]})</em></li>`).join(''); };
    container.innerHTML = `<div class="my-data-grid">
            <div class="data-card"><h4>🛒 Fornitori</h4><ul>${makeList(vendorCounts)}</ul></div>
            <div class="data-card"><h4>📍 I tuoi luoghi</h4><ul>${makeList(locCounts)}</ul></div>
            <div class="data-card"><h4>🪨 Substrati usati</h4><ul>${makeList(soilCounts)}</ul></div>
            <div class="data-card"><h4>📊 Riassunto piante attive</h4><ul><li>In vaso: <strong>${inVaso}</strong></li><li>In piena terra: <strong>${inTerra}</strong></li><li>Nate da seme: <strong>${daSeme}</strong></li><li>Piante innestate: <strong>${innestate}</strong></li></ul></div>
            <div class="data-card" style="border-left-color: var(--danger); background-color: #ffebee;"><h4 style="color: var(--danger);">🥀 Archivio storico</h4><p style="margin-top:10px;">Piante perse: <strong>${archivedCount}</strong></p><button class="btn btn-danger" style="width:100%; margin: 10px 0 0 0;" onclick="openArchiveView()">Apri archivio</button></div>
        </div>`;
}

// --- MAPPA GLOBALE DEDICATA ---
function openGlobalMapView() {
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('global-map-page').classList.remove('hidden');
    document.getElementById('map-plants-list').innerHTML = '<p style="color: #666; grid-column: 1 / -1;">Tocca un indicatore sulla mappa per mostrare l\'elenco delle piante in quella posizione.</p>';
    renderGlobalMapFullscreen();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeGlobalMapView() {
    document.getElementById('global-map-page').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
}

function renderGlobalMapFullscreen() {
    if (!globalMap) {
        globalMap = L.map('global-map-fullscreen').setView([41.8719, 12.5674], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(globalMap);
        globalMapMarkers = L.featureGroup().addTo(globalMap);
    }
    
    globalMapMarkers.clearLayers();
    let bounds = [];
    let locationGroups = {};

    // Raggruppa le piante con le stesse coordinate
    plantsDatabase.filter(p => p.status !== 'archived').forEach(p => {
        if (p.lat && p.lng) {
            let key = `${parseFloat(p.lat).toFixed(5)}_${parseFloat(p.lng).toFixed(5)}`;
            if (!locationGroups[key]) locationGroups[key] = [];
            locationGroups[key].push(p);
        }
    });

    for (let key in locationGroups) {
        let plantsGroup = locationGroups[key];
        let lat = parseFloat(plantsGroup[0].lat);
        let lng = parseFloat(plantsGroup[0].lng);
        let marker = L.marker([lat, lng]);
        
        let title = plantsGroup.length === 1 ? escapeHTML(plantsGroup[0].name) : `📍 ${plantsGroup.length} piante in questa posizione`;
        let imgSrc = plantsGroup[0].fruitPhoto || plantsGroup[0].photo || 'https://via.placeholder.com/150x100?text=Vedi+Piante';

        marker.bindPopup(`
            <img src="${imgSrc}" style="width:120px; height:90px; object-fit:cover;">
            <h4>${title}</h4>
            <span style="font-size:12px; color:#555;">Clicca il pin per l'elenco.</span>
        `);

        marker.on('click', () => { showMapPlantsList(plantsGroup); });
        
        globalMapMarkers.addLayer(marker);
        bounds.push([lat, lng]);
    }

    setTimeout(() => { 
        globalMap.invalidateSize(); 
        if(bounds.length > 0) globalMap.fitBounds(bounds, {padding: [30, 30], maxZoom: 16});
    }, 300);
}

function showMapPlantsList(plantsList) {
    const container = document.getElementById('map-plants-list');
    container.innerHTML = '';
    
    plantsList.forEach(plant => {
        const card = document.createElement('div');
        card.className = 'plant-card';
        card.onclick = () => { closeGlobalMapView(); openPlantDetail(plant.id); };
        
        let imgSrc = plant.fruitPhoto || plant.photo || 'https://via.placeholder.com/300x200?text=Nessuna+Foto';
        let sistemazioneLabel = plant.placement || 'Vaso'; 
        let vol = plant.potSize || plant.pot; 
        if (sistemazioneLabel === 'Vaso' && vol) sistemazioneLabel += ` (${escapeHTML(vol)} L)`;
        
        card.innerHTML = `
            <img src="${imgSrc}">
            <h3 style="margin-bottom:5px; margin-top:0;">${escapeHTML(plant.name)}</h3>
            <p style="margin-top:0; font-size:14px;"><em>${escapeHTML(plant.scientific)}</em></p>
            <p style="margin:5px 0;">🪴 <strong>${sistemazioneLabel}</strong></p>
        `;
        container.appendChild(card);
    });
    
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


// --- SCANNER E GRAFICI GLOBALI ---
function openLabelsView() { document.getElementById('dashboard').classList.add('hidden'); document.getElementById('labels-scanner-view').classList.remove('hidden'); }
function closeLabelsView() { if(html5QrcodeScanner) { html5QrcodeScanner.clear().catch(e => console.error(e)); html5QrcodeScanner = null; } document.getElementById('reader-container').style.display = 'none'; document.getElementById('labels-scanner-view').classList.add('hidden'); document.getElementById('dashboard').classList.remove('hidden'); }
function startScanner() { if(html5QrcodeScanner) return; document.getElementById('reader-container').style.display = 'block'; html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 250} }, false); html5QrcodeScanner.render(onScanSuccess, onScanFailure); }
function onScanSuccess(decodedText, decodedResult) {
    try {
        let data = JSON.parse(decodedText);
        if(data && data.plant_id) {
            html5QrcodeScanner.clear().then(() => {
                html5QrcodeScanner = null; document.getElementById('reader-container').style.display = 'none'; document.getElementById('labels-scanner-view').classList.add('hidden');
                const exists = plantsDatabase.find(p => p.id === data.plant_id);
                if(exists) openPlantDetail(data.plant_id); else { alert("Pianta non trovata! Forse è stata eliminata definitivamente."); document.getElementById('dashboard').classList.remove('hidden'); }
            });
        } else { throw new Error("Formato errato"); }
    } catch(e) { alert("Codice non riconosciuto. Assicurati di usare il nuovo QR Code."); }
}
function onScanFailure(error) { }

function toggleGlobalStats() {
    const view = document.getElementById('global-stats-view');
    if (view.classList.contains('hidden')) { view.classList.remove('hidden'); renderGlobalChart(); view.scrollIntoView({ behavior: 'smooth' }); } 
    else { view.classList.add('hidden'); }
}

function renderGlobalChart() {
    const ctx = document.getElementById('globalEventsChart').getContext('2d');
    if(globalEvChart) globalEvChart.destroy();
    let allEvents = [];
    plantsDatabase.forEach(plant => {
        if(plant.logs) {
            plant.logs.forEach(log => {
                if (log.type === 'Fioritura' || log.type === 'Raccolto' || log.type === 'Fruttificazione') { allEvents.push({ plantName: plant.name, date: log.date, type: log.type, note: log.note }); }
            });
        }
    });
    if (allEvents.length === 0) { alert("Non ci sono eventi di Fioritura o Raccolto salvati nei diari per creare il grafico!"); document.getElementById('global-stats-view').classList.add('hidden'); return; }
    allEvents.sort((a,b) => new Date(a.date) - new Date(b.date));
    const dateLabels = [...new Set(allEvents.map(e => e.date))].sort((a,b) => new Date(a) - new Date(b));
    const plantLabels = [...new Set(allEvents.map(e => e.plantName))];
    const fioriture = allEvents.filter(e => e.type === 'Fioritura').map(e => ({ x: e.date, y: e.plantName, note: e.note }));
    const raccolti = allEvents.filter(e => e.type === 'Raccolto' || e.type === 'Fruttificazione').map(e => ({ x: e.date, y: e.plantName, note: e.note }));
    globalEvChart = new Chart(ctx, { type: 'scatter', data: { datasets: [ { label: '🌸 Fioriture', data: fioriture, backgroundColor: '#f06292', pointRadius: 8, pointHoverRadius: 12 }, { label: '🍋/🧺 Raccolti e Frutti', data: raccolti, backgroundColor: '#f57f17', pointRadius: 8, pointHoverRadius: 12 } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: function(context) { return `${context.raw.y}: ${context.raw.note || context.raw.x}`; } } } }, scales: { x: { type: 'category', labels: dateLabels, title: { display: true, text: 'Data' } }, y: { type: 'category', labels: plantLabels } } } });
}

// --- IMPORT E EXPORT (ZIP E CSV) ---
function loadProfile(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.name.endsWith('.zip')) { loadZipProfile(file); } 
    else { alert("Per favore, carica un file di salvataggio .zip valido."); }
    event.target.value = ''; 
}

async function loadZipProfile(file) {
    try {
        const zip = await JSZip.loadAsync(file);
        const jsonFile = zip.file("data.json");
        if (!jsonFile) throw new Error("Il file ZIP non contiene il database (data.json).");
        const jsonString = await jsonFile.async("string");
        const loadedData = JSON.parse(jsonString);
        let loadedPlants = Array.isArray(loadedData) ? loadedData : (loadedData.plants || []);
        
        async function restoreImage(imgPath) {
            if (imgPath && typeof imgPath === 'string' && imgPath.startsWith('images/')) {
                const imgFile = zip.file(imgPath);
                if (imgFile) {
                    const base64 = await imgFile.async("base64");
                    let ext = imgPath.split('.').pop(); let mime = "image/webp"; 
                    if(ext === "jpeg" || ext === "jpg") mime = "image/jpeg"; else if(ext === "png") mime = "image/png";
                    return `data:${mime};base64,${base64}`;
                }
            }
            return imgPath; 
        }

        for (let p of loadedPlants) {
            if(p.photo) p.photo = await restoreImage(p.photo); if(p.fruitPhoto) p.fruitPhoto = await restoreImage(p.fruitPhoto);
            if(p.logs) { for (let log of p.logs) { if(log.photo) log.photo = await restoreImage(log.photo); } }
            if(!p.logs) p.logs = []; if(!p.status) p.status = 'active';
        }
        plantsDatabase = loadedPlants;
        if (!Array.isArray(loadedData)) {
            if (loadedData.title) { gardenTitle = loadedData.title; document.getElementById('main-title').innerText = gardenTitle; }
            if (loadedData.notes) { gardenNotes = loadedData.notes; } else { gardenNotes = ""; }
        }
        unsavedChanges = false;
        startNewProfile(); 
    } catch(e) { alert("Errore nel caricamento del file ZIP: " + e.message); }
}

async function exportData() {
    const btn = document.getElementById('btn-export');
    const originalText = btn.innerHTML; btn.innerHTML = '⏳ Preparazione...'; btn.disabled = true;

    try {
        const zip = new JSZip(); const imgFolder = zip.folder("images");
        let exportPlants = JSON.parse(JSON.stringify(plantsDatabase));
        
        function processImage(base64String, filenameBase) {
            if (!base64String || !base64String.startsWith('data:image')) return base64String;
            const parts = base64String.split(','); 
            if (parts.length < 2) return base64String;
            const mimeType = parts[0]; const data = parts[1];
            let ext = "webp"; if (mimeType.includes("jpeg")) ext = "jpeg"; else if (mimeType.includes("png")) ext = "png";
            const filename = `${filenameBase}.${ext}`; imgFolder.file(filename, data, {base64: true}); return `images/${filename}`; 
        }

        exportPlants.forEach(p => {
            if(p.photo) p.photo = processImage(p.photo, `plant_${p.id}_main`); if(p.fruitPhoto) p.fruitPhoto = processImage(p.fruitPhoto, `plant_${p.id}_fruit`);
            if(p.logs) { p.logs.forEach(log => { if(log.photo) log.photo = processImage(log.photo, `log_${log.id}`); }); }
        });

        const exportObj = { title: gardenTitle, notes: gardenNotes, plants: exportPlants };
        const jsonString = JSON.stringify(exportObj, function(key, value) { if (value === "" || value === null || (Array.isArray(value) && value.length === 0)) return undefined; return value; });
        zip.file("data.json", jsonString);

        const content = await zip.generateAsync({type:"blob", compression: "DEFLATE", compressionOptions: {level: 6}});
        const a = document.createElement('a'); a.href = URL.createObjectURL(content);
        const now = new Date(); const dateStr = now.toISOString().slice(0, 10); 
        const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`; 
        let safeTitle = gardenTitle.replace('🌿', '').trim().replace(/[^a-zA-Z0-9 àèìòùÀÈÌÒÙ-]/g, '').replace(/\s+/g, '-');
        if (!safeTitle) safeTitle = "Giardino"; a.download = `${safeTitle}-${dateStr}-${timeStr}.zip`; a.click();
        unsavedChanges = false;
    } catch(err) { alert("Errore durante la creazione del file ZIP: " + err); } finally { btn.innerHTML = originalText; btn.disabled = false; }
}

function exportToCSV() {
    if (plantsDatabase.length === 0) {
        alert("Nessuna pianta da esportare!");
        return;
    }

    const headers = [
        "Nome", "Nome Scientifico", "Origine/Propagazione", "Madre", "Padre", "Data Semina/Inizio",
        "Fedeltà Varietale", "Sistemazione", "Litri Vaso", "Substrato", "pH Terreno",
        "Temp. Minima", "Fornitore", "Luogo", "Latitudine", "Longitudine",
        "Stato", "Ultima Altezza (cm)", "Ultimo pH Misurato", "Cronologia Eventi"
    ];

    let csvContent = headers.join(",") + "\n";

    plantsDatabase.forEach(p => {
        let latestHeight = "";
        let heightLogs = p.logs.filter(l => l.type === 'Misurazione' && l.height).sort((a, b) => new Date(b.date) - new Date(a.date));
        if (heightLogs.length > 0) latestHeight = heightLogs[0].height;

        let latestPh = "";
        let phLogs = p.logs.filter(l => l.type === 'Misurazione pH' && l.ph).sort((a, b) => new Date(b.date) - new Date(a.date));
        if (phLogs.length > 0) latestPh = phLogs[0].ph;

        let motherName = "";
        if (p.mother) {
            let m = plantsDatabase.find(x => x.id == p.mother);
            if (m) motherName = m.name;
        }

        let fatherName = "";
        if (p.father) {
            let f = plantsDatabase.find(x => x.id == p.father);
            if (f) fatherName = f.name;
        }

        let eventsStr = "";
        if (p.logs && p.logs.length > 0) {
            let sortedLogs = [...p.logs].sort((a, b) => new Date(a.date) - new Date(b.date));
            eventsStr = sortedLogs.map(l => {
                let detail = "";
                if (l.type === 'Misurazione' && l.height) detail = ` (${l.height}cm)`;
                else if (l.type === 'Misurazione pH' && l.ph) detail = ` (pH ${l.ph})`;
                else if (l.type === 'Raccolto' && l.harvest) detail = ` (Resa: ${l.harvest})`;
                else if (l.type === 'Rinvaso / Sistemazione' && l.placement) detail = ` (${l.placement} ${l.potSize ? l.potSize+'L' : ''})`;
                else if (l.type === 'Innesto' && l.graftName) detail = ` (Nuovo nome: ${l.graftName})`;
                
                let noteStr = l.note ? ` - ${l.note}` : "";
                return `[${l.date}] ${l.type}${detail}${noteStr}`;
            }).join(" | ");
        }

        let row = [
            p.name, p.scientific, p.origin, motherName, fatherName, p.sowingDate,
            p.geneticFidelity, p.placement, p.potSize, p.soil, p.phTerreno,
            p.minTemp, p.vendor, p.location, p.lat, p.lng,
            p.status === 'archived' ? 'Archiviata' : 'Attiva',
            latestHeight, latestPh, eventsStr
        ];

        let formattedRow = row.map(field => {
            let val = field === null || field === undefined ? "" : String(field);
            if (val.search(/("|,|\n)/g) >= 0) {
                val = `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        }).join(",");

        csvContent += formattedRow + "\n";
    });

    const bom = "\uFEFF"; 
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    link.setAttribute("download", `Inventario_Piante_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- GESTIONE FORM PIANTA ---
function toggleFidelityField() {
    const origin = document.getElementById('p-origin').value; const container = document.getElementById('fidelity-container');
    if (origin === 'Da seme') { container.style.display = 'block'; } else { container.style.display = 'none'; document.getElementById('p-genetic-fidelity').value = 'Non ancora valutato'; }
}

function setVendorMode(mode) {
    vendorMode = mode; const select = document.getElementById('p-vendor-select'); const input = document.getElementById('p-vendor-input'); const btn = document.getElementById('btn-toggle-vendor');
    if (mode === 'select') { input.style.display = 'none'; select.style.display = 'block'; btn.innerText = '➕ Nuovo'; } else { select.style.display = 'none'; input.style.display = 'block'; btn.innerText = '🔄 Storico'; }
}
function toggleVendorMode() { setVendorMode(vendorMode === 'select' ? 'input' : 'select'); }

function setSoilMode(mode) {
    soilMode = mode; const select = document.getElementById('p-soil-select'); const input = document.getElementById('p-soil-input'); const btn = document.getElementById('btn-toggle-soil');
    if (mode === 'select') { input.style.display = 'none'; select.style.display = 'block'; btn.innerText = '➕ Nuovo'; } else { select.style.display = 'none'; input.style.display = 'block'; btn.innerText = '🔄 Storico'; }
}
function toggleSoilMode() { setSoilMode(soilMode === 'select' ? 'input' : 'select'); }

function populateFormHelpers() {
    const motherSelect = document.getElementById('p-mother'); const fatherSelect = document.getElementById('p-father');
    motherSelect.innerHTML = '<option value="">-- Nessuna / Sconosciuta --</option>'; fatherSelect.innerHTML = '<option value="">-- Nessuno / Sconosciuto --</option>';
    
    const availableParents = plantsDatabase.filter(p => p.id !== currentPlantId).sort((a,b) => a.name.localeCompare(b.name));
    availableParents.forEach(p => {
        const optM = document.createElement('option'); optM.value = p.id; optM.innerText = p.name + (p.status === 'archived' ? ' (archiviata)' : ''); motherSelect.appendChild(optM);
        const optF = document.createElement('option'); optF.value = p.id; optF.innerText = p.name + (p.status === 'archived' ? ' (archiviata)' : ''); fatherSelect.appendChild(optF);
    });

    const vendorSelect = document.getElementById('p-vendor-select');
    const vendors = [...new Set(plantsDatabase.map(p => p.vendor).filter(v => v && v.trim() !== ''))];
    vendorSelect.innerHTML = '<option value="">-- Seleziona fornitore --</option>';
    if (vendors.length === 0) vendorSelect.innerHTML = '<option value="">Nessun fornitore salvato</option>';
    else vendors.forEach(v => { const opt = document.createElement('option'); opt.value = v; opt.innerText = v.length > 40 ? v.substring(0, 40) + '...' : v; vendorSelect.appendChild(opt); });

    const soilSelect = document.getElementById('p-soil-select');
    const soils = [...new Set(plantsDatabase.map(p => p.soil).filter(s => s && s.trim() !== ''))];
    soilSelect.innerHTML = '<option value="">-- Seleziona substrato --</option>';
    if (soils.length === 0) soilSelect.innerHTML = '<option value="">Nessun substrato salvato</option>';
    else soils.forEach(s => { const opt = document.createElement('option'); opt.value = s; opt.innerText = s.length > 40 ? s.substring(0, 40) + '...' : s; soilSelect.appendChild(opt); });

    const locationSelect = document.getElementById('p-saved-locations');
    const locations = []; const signatures = new Set();
    plantsDatabase.forEach(p => {
        if (p.location || (p.lat && p.lng)) {
            let sig = `${p.location}_${p.lat}_${p.lng}`;
            if (!signatures.has(sig)) { signatures.add(sig); locations.push({ loc: p.location, lat: p.lat, lng: p.lng }); }
        }
    });
    locationSelect.innerHTML = '<option value="">📍 Scegli da "I miei luoghi"...</option>';
    locations.forEach((l, index) => {
        const opt = document.createElement('option'); opt.value = index; 
        let text = l.loc || 'Luogo senza nome'; if (l.lat && l.lng) text += ` (${l.lat}, ${l.lng})`;
        opt.innerText = text; opt.dataset.loc = l.loc || ''; opt.dataset.lat = l.lat || ''; opt.dataset.lng = l.lng || ''; locationSelect.appendChild(opt);
    });
}

function fillSavedLocation() {
    const select = document.getElementById('p-saved-locations');
    if (select.selectedIndex <= 0) return; const opt = select.options[select.selectedIndex];
    document.getElementById('p-location').value = opt.dataset.loc; document.getElementById('p-lat').value = opt.dataset.lat; document.getElementById('p-lng').value = opt.dataset.lng;
    select.selectedIndex = 0; 
}

function togglePotSizeField() {
    const placement = document.getElementById('p-placement').value; const container = document.getElementById('pot-size-container');
    if (placement === 'Vaso') container.style.display = 'flex'; else { container.style.display = 'none'; document.getElementById('p-pot-size').value = ''; }
}

function removePhoto(type) {
    if(type === 'main') { document.getElementById('p-photo').value = ''; mainPhotoRemoved = true; document.getElementById('photo-status-main').style.display = 'block'; } 
    else { document.getElementById('p-fruit-photo').value = ''; fruitPhotoRemoved = true; document.getElementById('photo-status-fruit').style.display = 'block'; }
}

function openPlantForm() {
    editingMode = false; currentPlantId = null; document.getElementById('form-title').innerText = "Aggiungi nuova pianta";
    document.getElementById('dashboard-controls').classList.add('hidden'); document.getElementById('global-stats-view').classList.add('hidden'); document.getElementById('global-map-page').classList.add('hidden'); document.getElementById('frost-emergency-box').classList.add('hidden'); document.getElementById('dashboard-stats').classList.add('hidden'); document.getElementById('plants-grid').classList.add('hidden'); document.getElementById('my-data-page').classList.add('hidden'); document.getElementById('archive-page').classList.add('hidden'); document.getElementById('form-container').classList.remove('hidden');
    document.getElementById('form-placement-section').style.display = 'block';
    if (isBatchMode) toggleBatchMode(); 
    
    clearForm(); populateFormHelpers(); setVendorMode('select'); setSoilMode('select');
    document.getElementById('p-origin').value = 'Da seme'; toggleFidelityField(); document.getElementById('p-placement').value = 'Vaso'; togglePotSizeField();
}

function openDuplicateModal() {
    const plantToCopy = plantsDatabase.find(p => p.id === currentPlantId); if (!plantToCopy) return;
    document.getElementById('dup-base-name').value = plantToCopy.name; document.getElementById('dup-qty').value = 1; document.getElementById('duplicate-modal-overlay').style.display = 'flex';
}

function closeDuplicateModal() { document.getElementById('duplicate-modal-overlay').style.display = 'none'; }

function confirmDuplicate() {
    const plantToCopy = plantsDatabase.find(p => p.id === currentPlantId); if (!plantToCopy) return;
    let baseName = document.getElementById('dup-base-name').value.trim(); if (!baseName) baseName = plantToCopy.name;
    let qty = parseInt(document.getElementById('dup-qty').value); if (isNaN(qty) || qty < 1) return alert("Inserisci una quantità valida (minimo 1).");

    for (let i = 0; i < qty; i++) {
        let newName = baseName; let suffixCounter = 1;
        if (qty > 1 || plantsDatabase.some(p => p.name.toLowerCase() === baseName.toLowerCase())) {
            newName = `${baseName} - ${suffixCounter}`;
            while (plantsDatabase.some(p => p.name.toLowerCase() === newName.toLowerCase())) { suffixCounter++; newName = `${baseName} - ${suffixCounter}`; }
        }
        let clonedLogs = [];
        if (plantToCopy.logs && plantToCopy.logs.length > 0) { clonedLogs = JSON.parse(JSON.stringify(plantToCopy.logs)); clonedLogs.forEach(log => { log.id = Date.now() + Math.floor(Math.random() * 1000000); }); }
        const newPlant = {
            id: Date.now() + i + Math.floor(Math.random() * 10000), name: newName, scientific: plantToCopy.scientific, origin: plantToCopy.origin, sowingDate: plantToCopy.sowingDate, geneticFidelity: plantToCopy.geneticFidelity, placement: plantToCopy.placement, potSize: plantToCopy.potSize, soil: plantToCopy.soil, phTerreno: plantToCopy.phTerreno, vendor: plantToCopy.vendor, location: plantToCopy.location, notes: plantToCopy.notes, lat: plantToCopy.lat, lng: plantToCopy.lng, photo: plantToCopy.photo, fruitPhoto: plantToCopy.fruitPhoto, status: 'active', logs: clonedLogs, mother: plantToCopy.mother, father: plantToCopy.father, minTemp: plantToCopy.minTemp          
        };
        plantsDatabase.push(newPlant);
    }
    unsavedChanges = true; saveToLocal(); 
    closeDuplicateModal(); closePlantDetail(); 
}

function closePlantForm() {
    document.getElementById('form-container').classList.add('hidden'); 
    clearForm();
    if (currentPlantId) { 
        openPlantDetail(currentPlantId);
    } else { 
        document.getElementById('dashboard-controls').classList.remove('hidden'); document.getElementById('dashboard-stats').classList.remove('hidden'); document.getElementById('plants-grid').classList.remove('hidden'); 
        if (currentQuickFilter === 'gelo') document.getElementById('frost-emergency-box').classList.remove('hidden');
        renderPlants(); 
    }
}

function clearForm() {
    document.querySelectorAll('#form-container input, #form-container textarea, #form-container select').forEach(el => { 
        if (el.id !== 'p-origin' && el.id !== 'p-placement' && el.id !== 'p-genetic-fidelity') { 
            el.value = ''; 
        } 
    });
    document.getElementById('p-genetic-fidelity').value = 'Non ancora valutato';
    document.getElementById('search-plant').value = ''; 
    mainPhotoRemoved = false; 
    fruitPhotoRemoved = false; 
    document.getElementById('photo-status-main').style.display = 'none'; 
    document.getElementById('photo-status-fruit').style.display = 'none';
}

async function savePlant() {
    let newName = document.getElementById('p-name').value.trim();
    if(!newName) return alert("Il 'Nome*' è obbligatorio.");
    let nameExists = plantsDatabase.some(p => p.name.toLowerCase() === newName.toLowerCase() && p.id !== currentPlantId);
    if (nameExists) return alert(`Errore: Esiste già una pianta salvata con il nome "${newName}".`);
    
    let finalVendor = vendorMode === 'select' ? document.getElementById('p-vendor-select').value : document.getElementById('p-vendor-input').value.trim();
    let finalSoil = soilMode === 'select' ? document.getElementById('p-soil-select').value : document.getElementById('p-soil-input').value.trim();
    let phTerreno = document.getElementById('p-ph') ? document.getElementById('p-ph').value.trim() : "";
    let finalMainPhoto = ""; let finalFruitPhoto = "";

    const mainInput = document.getElementById('p-photo');
    if (mainInput.files && mainInput.files[0]) { finalMainPhoto = await compressImageAsync(mainInput.files[0]); } else if (editingMode && currentPlantId && !mainPhotoRemoved) { finalMainPhoto = plantsDatabase.find(x => x.id === currentPlantId).photo || ""; }

    const fruitInput = document.getElementById('p-fruit-photo');
    if (fruitInput.files && fruitInput.files[0]) { finalFruitPhoto = await compressImageAsync(fruitInput.files[0]); } else if (editingMode && currentPlantId && !fruitPhotoRemoved) { finalFruitPhoto = plantsDatabase.find(x => x.id === currentPlantId).fruitPhoto || ""; }

    if (editingMode && currentPlantId) {
        let index = plantsDatabase.findIndex(p => p.id === currentPlantId);
        plantsDatabase[index].name = newName; plantsDatabase[index].scientific = document.getElementById('p-scientific').value.trim(); plantsDatabase[index].origin = document.getElementById('p-origin').value; plantsDatabase[index].sowingDate = document.getElementById('p-sowing-date').value; plantsDatabase[index].geneticFidelity = document.getElementById('p-genetic-fidelity').value; plantsDatabase[index].soil = finalSoil; plantsDatabase[index].phTerreno = phTerreno; plantsDatabase[index].vendor = finalVendor; plantsDatabase[index].location = document.getElementById('p-location').value.trim(); plantsDatabase[index].notes = document.getElementById('p-notes').value.trim(); plantsDatabase[index].lat = document.getElementById('p-lat').value.trim(); plantsDatabase[index].lng = document.getElementById('p-lng').value.trim(); plantsDatabase[index].photo = finalMainPhoto; plantsDatabase[index].fruitPhoto = finalFruitPhoto; 
        plantsDatabase[index].mother = document.getElementById('p-mother').value; plantsDatabase[index].father = document.getElementById('p-father').value; plantsDatabase[index].minTemp = document.getElementById('p-min-temp').value;
    } else {
        const plantData = {
            id: Date.now(), name: newName, scientific: document.getElementById('p-scientific').value.trim(), origin: document.getElementById('p-origin').value, sowingDate: document.getElementById('p-sowing-date').value, geneticFidelity: document.getElementById('p-genetic-fidelity').value, placement: document.getElementById('p-placement').value, potSize: document.getElementById('p-pot-size').value.trim(), soil: finalSoil, phTerreno: phTerreno, vendor: finalVendor, location: document.getElementById('p-location').value.trim(), notes: document.getElementById('p-notes').value.trim(), lat: document.getElementById('p-lat').value.trim(), lng: document.getElementById('p-lng').value.trim(), photo: finalMainPhoto, fruitPhoto: finalFruitPhoto, status: 'active', logs: [],
            mother: document.getElementById('p-mother').value, father: document.getElementById('p-father').value, minTemp: document.getElementById('p-min-temp').value
        };
        plantsDatabase.push(plantData);
        currentPlantId = plantData.id;
    }
    unsavedChanges = true; saveToLocal(); 
    closePlantForm();
}

function renderPlants() {
    const grid = document.getElementById('plants-grid');
    grid.innerHTML = '';
    const searchTerm = document.getElementById('search-plant').value.toLowerCase();
    const sortMode = document.getElementById('sort-plants').value;
    
    let filteredPlants = plantsDatabase.filter(p => p.status !== 'archived').filter(p => {
        const nameMatch = p.name.toLowerCase().includes(searchTerm);
        const scientificMatch = p.scientific && p.scientific.toLowerCase().includes(searchTerm);
        return nameMatch || scientificMatch;
    });
    
    if (currentQuickFilter !== 'all') {
        if (currentQuickFilter === 'vaso') filteredPlants = filteredPlants.filter(p => p.placement === 'Vaso' || (!p.placement && p.pot));
        else if (currentQuickFilter === 'terra') filteredPlants = filteredPlants.filter(p => p.placement === 'Piena terra');
        else if (currentQuickFilter === 'seme') filteredPlants = filteredPlants.filter(p => p.origin === 'Da seme' || p.type === 'Pianta da seme');
        else if (currentQuickFilter === 'innesto') filteredPlants = filteredPlants.filter(p => p.origin === 'Innesto' || p.type === 'Pianta innestata');
        else if (currentQuickFilter === 'gelo') {
            let frostThresholdVal = parseFloat(document.getElementById('frost-temp-input').value);
            if(isNaN(frostThresholdVal)) frostThresholdVal = 5; 
            filteredPlants = filteredPlants.filter(p => p.minTemp !== undefined && p.minTemp !== "" && parseFloat(p.minTemp) >= frostThresholdVal);
        }
    }

    // ORDINAMENTO (Sorting)
    filteredPlants.sort((a, b) => {
        if (sortMode === 'name') {
            return a.name.localeCompare(b.name);
        } else if (sortMode === 'newest') {
            return b.id - a.id;
        } else if (sortMode === 'oldest') {
            return a.id - b.id;
        } else if (sortMode === 'last_updated') {
            let lastA = a.id; 
            if (a.logs && a.logs.length > 0) { lastA = Math.max(...a.logs.map(l => new Date(l.date).getTime() || 0)); }
            let lastB = b.id;
            if (b.logs && b.logs.length > 0) { lastB = Math.max(...b.logs.map(l => new Date(l.date).getTime() || 0)); }
            return lastB - lastA; 
        } else if (sortMode === 'temp_desc') {
            let tempA = (a.minTemp !== undefined && a.minTemp !== "") ? parseFloat(a.minTemp) : -999;
            let tempB = (b.minTemp !== undefined && b.minTemp !== "") ? parseFloat(b.minTemp) : -999;
            return tempB - tempA;
        } else if (sortMode === 'ph_desc') {
            let phA = (a.phTerreno !== undefined && a.phTerreno !== "") ? parseFloat(a.phTerreno) : -999;
            let phB = (b.phTerreno !== undefined && b.phTerreno !== "") ? parseFloat(b.phTerreno) : -999;
            return phB - phA;
        }
        return 0;
    });

    const validSpecies = filteredPlants.map(p => p.scientific ? p.scientific.trim().toLowerCase() : '').filter(s => s !== '');
    document.getElementById('count-plants').innerText = filteredPlants.length; document.getElementById('count-species').innerText = new Set(validSpecies).size;

    filteredPlants.forEach(plant => {
        const card = document.createElement('div');
        card.className = 'plant-card';
        
        if (isBatchMode && selectedBatchPlants.has(plant.id)) { card.classList.add('selected-for-batch'); }

        card.onclick = () => {
            if (isBatchMode) {
                if(selectedBatchPlants.has(plant.id)) { selectedBatchPlants.delete(plant.id); card.classList.remove('selected-for-batch'); } 
                else { selectedBatchPlants.add(plant.id); card.classList.add('selected-for-batch'); }
                updateBatchCounter();
            } else {
                openPlantDetail(plant.id);
            }
        };
        
        let imgSrc = 'https://via.placeholder.com/300x200?text=Nessuna+Foto';
        if (plant.fruitPhoto && plant.fruitPhoto !== "") { imgSrc = plant.fruitPhoto; } else if (plant.photo && plant.photo !== "") { imgSrc = plant.photo; }

        let sistemazioneLabel = plant.placement || 'Vaso'; let vol = plant.potSize || plant.pot; if (sistemazioneLabel === 'Vaso' && vol) sistemazioneLabel += ` (${escapeHTML(vol)} L)`;
        let origLabel = plant.origin || plant.type || 'Non so / Altro';
        
        // Nuovi Badge
        let tempBadge = plant.minTemp !== undefined && plant.minTemp !== "" ? `<span style="background:#e3f2fd; color:#1565c0; padding:2px 6px; border-radius:4px; font-size:12px; margin-left:5px; font-weight:bold;">❄️ Min: ${plant.minTemp}°C</span>` : '';
        let phBadge = plant.phTerreno !== undefined && plant.phTerreno !== "" ? `<span style="background:#e8f5e9; color:#2e7d32; padding:2px 6px; border-radius:4px; font-size:12px; margin-left:5px; font-weight:bold;">🧪 pH: ${plant.phTerreno}</span>` : '';

        card.innerHTML = `
            <img src="${imgSrc}">
            <div style="margin-bottom:10px;"><span class="timeline-type" style="margin-left:0;">${escapeHTML(origLabel)}</span>${tempBadge}${phBadge}</div>
            <h3 style="margin-bottom:5px; margin-top:0;">${escapeHTML(plant.name)}</h3>
            <p style="margin-top:0; font-size:14px;"><em>${escapeHTML(plant.scientific)}</em></p>
            <p style="margin:5px 0;">📍 ${escapeHTML(plant.location) || 'Posizione non specificata'}</p>
            <p style="margin:5px 0;">🪴 <strong>${sistemazioneLabel}</strong></p>
        `;
        grid.appendChild(card);
    });
}

function renderArchive() {
    const grid = document.getElementById('archive-grid'); grid.innerHTML = '';
    let archivedPlants = plantsDatabase.filter(p => p.status === 'archived'); archivedPlants.sort((a, b) => a.name.localeCompare(b.name));
    if (archivedPlants.length === 0) { grid.innerHTML = '<p style="grid-column: 1 / -1; color: #555;">Nessuna pianta archiviata al momento.</p>'; return; }

    archivedPlants.forEach(plant => {
        const card = document.createElement('div'); card.className = 'plant-card'; card.style.borderLeftColor = 'var(--danger)'; 
        card.onclick = () => openPlantDetail(plant.id);
        let imgSrc = 'https://via.placeholder.com/300x200?text=Nessuna+Foto'; if (plant.fruitPhoto && plant.fruitPhoto !== "") imgSrc = plant.fruitPhoto; else if (plant.photo && plant.photo !== "") imgSrc = plant.photo;
        let origLabel = plant.origin || plant.type || 'Non so / Altro';
        card.innerHTML = `<img src="${imgSrc}" class="grayscale-img"><span class="timeline-type" style="margin-left:0; margin-bottom:10px; background-color: var(--danger);">${escapeHTML(origLabel)}</span><h3 style="margin-bottom:5px; color: var(--danger);">${escapeHTML(plant.name)}</h3><p style="margin-top:0; font-size:14px; color:#555;"><em>${escapeHTML(plant.scientific)}</em></p><p style="margin:5px 0; font-size:13px;">Archiviata (Spostata da: ${escapeHTML(plant.location) || 'N/D'})</p>`;
        grid.appendChild(card);
    });
}

// --- DETTAGLIO PIANTA E MAPPE ---
function openPlantDetail(id) {
    currentPlantId = id; const plant = plantsDatabase.find(p => p.id === id);
    if(isBatchMode) toggleBatchMode(); 
    
    document.getElementById('dashboard').classList.add('hidden'); document.getElementById('archive-page').classList.add('hidden'); document.getElementById('plant-detail-view').classList.remove('hidden');
    document.getElementById('detail-title').innerText = plant.name + (plant.scientific ? ` (${plant.scientific})` : '');
    
    let sistemazioneLabel = plant.placement || 'Vaso'; let vol = plant.potSize || plant.pot; if (sistemazioneLabel === 'Vaso' && vol) sistemazioneLabel += ` (${escapeHTML(vol)} L)`;
    let origLabel = plant.origin || plant.type || 'N/D';

    let fidelityHtml = '';
    if (plant.origin === 'Da seme' || plant.type === 'Pianta da seme') { let fidelityLabel = plant.geneticFidelity || 'Non ancora valutato'; fidelityHtml = `<p><strong>🧬 Fedeltà varietale frutto:</strong> <span style="color:#e65100; font-weight:bold;">${escapeHTML(fidelityLabel)}</span></p>`; }

    let parentStr = '';
    if(plant.mother) { let m = plantsDatabase.find(x => x.id == plant.mother); if(m) parentStr += `Madre: <a href="#" style="color:var(--blue); font-weight:bold;" onclick="openPlantDetail(${m.id}); return false;">${escapeHTML(m.name)}</a><br>`; }
    if(plant.father) { let f = plantsDatabase.find(x => x.id == plant.father); if(f) parentStr += `Padre: <a href="#" style="color:var(--blue); font-weight:bold;" onclick="openPlantDetail(${f.id}); return false;">${escapeHTML(f.name)}</a>`; }
    if(parentStr) parentStr = `<div style="background:#e3f2fd; padding:10px; border-radius:5px; margin-bottom:10px; font-size:14px;"><strong>🧬 Genealogia:</strong><br>${parentStr}</div>`;

    let tempStr = plant.minTemp !== undefined && plant.minTemp !== "" ? `<span style="color: #1976d2; font-weight:bold;">❄️ Minima tollerata: ${plant.minTemp}°C</span>` : '';

    document.getElementById('detail-info').innerHTML = `
        ${parentStr}
        <p style="margin-top:0;"><strong>📅 Data semina/inizio:</strong> ${formatDateIt(plant.sowingDate)}</p>
        <p><strong>🪴 Sistemazione:</strong> ${sistemazioneLabel}</p>
        <p><strong>🪨 Substrato:</strong> ${escapeHTML(plant.soil) || 'N/D'} ${plant.phTerreno ? `| <strong>pH:</strong> ${escapeHTML(plant.phTerreno)}` : ''}</p>
        <p><strong>🌱 Origine:</strong> ${escapeHTML(origLabel)} | <strong>🛒 Fornitore:</strong> ${renderFornitore(plant.vendor)}</p>
        <p><strong>📍 Luogo:</strong> ${escapeHTML(plant.location) || 'N/D'} ${tempStr ? '<br>'+tempStr : ''}</p>
        <hr style="border:0.5px solid #ddd; margin:10px 0;">
        ${fidelityHtml}
        <p style="margin-bottom:0;"><strong>📝 Note:</strong> ${escapeHTML(plant.notes) || 'Nessuna nota inserita.'}</p>
    `;

    const photoContainer = document.getElementById('detail-photos-container'); photoContainer.innerHTML = '';
    if(plant.photo || plant.fruitPhoto) {
        let addClass = plant.status === 'archived' ? ' grayscale-img' : ''; 
        if(plant.photo) photoContainer.innerHTML += `<img src="${plant.photo}" class="plant-img${addClass}" title="Foto Pianta">`;
        if(plant.fruitPhoto) photoContainer.innerHTML += `<img src="${plant.fruitPhoto}" class="plant-img${addClass}" title="Foto Frutto">`;
    } else { photoContainer.innerHTML = `<div style="height:100px; width:100%; display:flex; align-items:center; justify-content:center; border:1px solid #ddd; border-radius:5px; color:#999;">Nessuna foto inserita</div>`; }

    document.getElementById('log-date').valueAsDate = new Date(); document.getElementById('log-type').value = 'Misurazione'; document.getElementById('log-photo').value = ''; toggleDynamicFields();
    renderTimeline(plant); initMap(plant); updateYearDropdown(plant); renderCharts(plant);

    const archiveBtn = document.getElementById('btn-archive-toggle'); const archiveSec = document.getElementById('archive-section');
    if (plant.status === 'archived') { archiveSec.style.background = '#e8f5e9'; archiveSec.style.borderColor = '#c8e6c9'; archiveSec.querySelector('h4').innerText = '🌱 Pianta in archivio'; archiveSec.querySelector('h4').style.color = 'var(--primary)'; archiveBtn.className = 'btn'; archiveBtn.innerText = 'Ripristina nel giardino'; } 
    else { archiveSec.style.background = '#ffebee'; archiveSec.style.borderColor = '#ffcdd2'; archiveSec.querySelector('h4').innerText = '🥀 Archivio storico'; archiveSec.querySelector('h4').style.color = 'var(--danger)'; archiveBtn.className = 'btn btn-danger'; archiveBtn.innerText = 'Archivia pianta'; }

    document.getElementById('label-name').innerText = plant.name; document.getElementById('label-scientific').innerText = plant.scientific || 'Specie Sconosciuta'; document.getElementById('label-origin').innerText = plant.origin || plant.type || 'N/D';
    const qrContainer = document.getElementById('detail-qr-code'); qrContainer.innerHTML = ''; const qrContent = JSON.stringify({ plant_id: plant.id }); new QRCode(qrContainer, { text: qrContent, width: 100, height: 100, colorDark : "#000000", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.L });
}

function toggleArchiveStatus() {
    const plant = plantsDatabase.find(p => p.id === currentPlantId);
    if (plant.status === 'archived') { if(confirm("Vuoi ripristinare questa pianta? Tornerà visibile nel tuo giardino principale.")) { plant.status = 'active'; unsavedChanges = true; saveToLocal(); closePlantDetail(); } } 
    else { if(confirm("Sei sicuro di voler spostare questa pianta nell'archivio storico? Scomparirà dalla vista principale ma tutti i dati verranno conservati.")) { plant.status = 'archived'; unsavedChanges = true; saveToLocal(); closePlantDetail(); } }
}

function deleteCurrentPlant() {
    if(confirm("⚠️ ATTENZIONE: Questa azione la ELIMINERÀ DEFINITIVAMENTE distruggendo tutti i dati, diari e foto. (Se vuoi solo nasconderla usa il tasto 'Archivia'). Continuare?")) {
        plantsDatabase = plantsDatabase.filter(p => p.id !== currentPlantId); unsavedChanges = true; saveToLocal(); closePlantDetail(); 
    }
}

function closePlantDetail() {
    document.getElementById('plant-detail-view').classList.add('hidden');
    const plant = plantsDatabase.find(p => p.id === currentPlantId);
    if (plant && plant.status === 'archived') { openArchiveView(); } 
    else { 
        document.getElementById('dashboard').classList.remove('hidden'); 
        document.getElementById('dashboard-controls').classList.remove('hidden'); 
        document.getElementById('dashboard-stats').classList.remove('hidden'); 
        document.getElementById('plants-grid').classList.remove('hidden'); 
        if (currentQuickFilter === 'gelo') { document.getElementById('frost-emergency-box').classList.remove('hidden'); }
        renderPlants(); 
    }
}

function editCurrentPlant() {
    const plant = plantsDatabase.find(p => p.id === currentPlantId); editingMode = true; clearForm(); 
    document.getElementById('p-name').value = plant.name; document.getElementById('p-scientific').value = plant.scientific || ''; document.getElementById('p-sowing-date').value = plant.sowingDate || ''; document.getElementById('p-genetic-fidelity').value = plant.geneticFidelity || 'Non ancora valutato';
    const originSelect = document.getElementById('p-origin'); let oldOrigin = plant.origin || plant.type || 'Da seme'; originSelect.value = Array.from(originSelect.options).some(opt => opt.value === oldOrigin) ? oldOrigin : 'Non so / Altro'; toggleFidelityField();
    document.getElementById('form-placement-section').style.display = 'none';

    populateFormHelpers();
    
    document.getElementById('p-mother').value = plant.mother || ''; document.getElementById('p-father').value = plant.father || '';
    document.getElementById('p-min-temp').value = plant.minTemp || '';

    if(plant.vendor) { setVendorMode('select'); document.getElementById('p-vendor-select').value = plant.vendor; document.getElementById('p-vendor-input').value = plant.vendor; } else { setVendorMode('select'); }
    if(plant.soil) { setSoilMode('select'); document.getElementById('p-soil-select').value = plant.soil; document.getElementById('p-soil-input').value = plant.soil; } else { setSoilMode('select'); }
    document.getElementById('p-ph').value = plant.phTerreno || '';
    document.getElementById('p-location').value = plant.location || ''; document.getElementById('p-notes').value = plant.notes || ''; document.getElementById('p-lat').value = plant.lat || ''; document.getElementById('p-lng').value = plant.lng || '';
    
    document.getElementById('plant-detail-view').classList.add('hidden'); document.getElementById('dashboard').classList.remove('hidden'); document.getElementById('dashboard-controls').classList.add('hidden'); document.getElementById('frost-emergency-box').classList.add('hidden'); document.getElementById('dashboard-stats').classList.add('hidden'); document.getElementById('global-stats-view').classList.add('hidden'); document.getElementById('global-map-page').classList.add('hidden'); document.getElementById('plants-grid').classList.add('hidden'); document.getElementById('form-title').innerText = "Modifica dettagli pianta"; document.getElementById('form-container').classList.remove('hidden');
}

function toggleLogPotSize() {
    const placement = document.getElementById('log-placement').value; const container = document.getElementById('log-pot-container');
    if (placement === 'Vaso') container.style.display = 'flex'; else { container.style.display = 'none'; document.getElementById('log-pot-size').value = ''; }
}

function toggleDynamicFields() {
    const type = document.getElementById('log-type').value;
    document.getElementById('height-container').style.display = (type === 'Misurazione') ? 'block' : 'none'; if (type !== 'Misurazione') document.getElementById('log-height').value = ''; 
    document.getElementById('ph-container').style.display = (type === 'Misurazione pH') ? 'block' : 'none'; if (type !== 'Misurazione pH') document.getElementById('log-ph').value = ''; 
    document.getElementById('harvest-container').style.display = (type === 'Raccolto') ? 'block' : 'none'; if (type !== 'Raccolto') document.getElementById('log-harvest').value = ''; 
    document.getElementById('repot-container').style.display = (type === 'Rinvaso / Sistemazione') ? 'block' : 'none';
    if (type !== 'Rinvaso / Sistemazione') { document.getElementById('log-placement').value = 'Vaso'; document.getElementById('log-pot-size').value = ''; toggleLogPotSize(); }
    document.getElementById('graft-container').style.display = (type === 'Innesto') ? 'block' : 'none'; if (type !== 'Innesto') { document.getElementById('log-graft-name').value = ''; }
}

async function addDiaryLog() {
    const date = document.getElementById('log-date').value; const type = document.getElementById('log-type').value; const note = document.getElementById('log-note').value.trim();
    let height = null; let harvest = null; let ph = null; let newPlacement = null; let newPotSize = null; let graftName = null;

    if(!date) return alert("Inserisci la data!");
    if (type === 'Misurazione') { height = document.getElementById('log-height').value; if (height === '' || parseFloat(height) < 0) return alert("Inserisci un'altezza valida in cm."); height = parseFloat(height); }
    if (type === 'Misurazione pH') { ph = document.getElementById('log-ph').value; if (ph === '' || parseFloat(ph) < 0 || parseFloat(ph) > 14) return alert("Inserisci un valore di pH valido (tra 0 e 14)."); ph = parseFloat(ph); }
    if (type === 'Raccolto') { harvest = document.getElementById('log-harvest').value.trim(); if (harvest === '' && note === '') return alert("Inserisci la quantità raccolta o una nota."); }
    if (type === 'Innesto') {
        graftName = document.getElementById('log-graft-name').value.trim(); if (graftName === '') return alert("Inserisci il nuovo nome della pianta innestata.");
        let nameExists = plantsDatabase.some(p => p.name.toLowerCase() === graftName.toLowerCase() && p.id !== currentPlantId); if (nameExists) return alert(`Errore: Esiste già una pianta salvata con il nome "${graftName}".`);
        const plant = plantsDatabase.find(p => p.id === currentPlantId); plant.name = graftName; plant.origin = 'Innesto';
    }
    if (type === 'Rinvaso / Sistemazione') { newPlacement = document.getElementById('log-placement').value; newPotSize = document.getElementById('log-pot-size').value.trim(); const plant = plantsDatabase.find(p => p.id === currentPlantId); plant.placement = newPlacement; plant.potSize = newPotSize; }
    if(!note && type !== 'Misurazione' && type !== 'Raccolto' && type !== 'Misurazione pH' && type !== 'Rinvaso / Sistemazione' && type !== 'Innesto') { return alert("Inserisci una nota descrittiva dell'evento."); }

    const photoInput = document.getElementById('log-photo');
    if (photoInput.files && photoInput.files[0]) { const base64Img = await compressImageAsync(photoInput.files[0]); finalizeDiaryLog(date, type, note, height, harvest, ph, newPlacement, newPotSize, graftName, base64Img); } 
    else { finalizeDiaryLog(date, type, note, height, harvest, ph, newPlacement, newPotSize, graftName, ""); }
}

function finalizeDiaryLog(date, type, note, height, harvest, ph, placement, potSize, graftName, photoBase64) {
    const plant = plantsDatabase.find(p => p.id === currentPlantId);
    plant.logs.push({ id: Date.now(), date: date, type: type, height: height, harvest: harvest, ph: ph, placement: placement, potSize: potSize, graftName: graftName, note: note, photo: photoBase64 });
    unsavedChanges = true; saveToLocal(); 
    document.getElementById('log-height').value = ''; document.getElementById('log-ph').value = ''; document.getElementById('log-harvest').value = ''; document.getElementById('log-note').value = ''; document.getElementById('log-photo').value = ''; document.getElementById('log-graft-name').value = ''; document.getElementById('log-placement').value = 'Vaso'; document.getElementById('log-pot-size').value = ''; toggleLogPotSize();
    openPlantDetail(currentPlantId); 
}

function deleteLog(logId) {
    if(confirm("Eliminare questo evento? (Nota: se elimini un rinvaso o un innesto, la scheda della pianta NON tornerà automaticamente allo stato precedente, dovrai modificarla a mano).")) {
        const plant = plantsDatabase.find(p => p.id === currentPlantId); plant.logs = plant.logs.filter(l => l.id !== logId); unsavedChanges = true; saveToLocal(); renderTimeline(plant); updateYearDropdown(plant); renderCharts(plant);
    }
}

function renderTimeline(plant) {
    const ul = document.getElementById('detail-timeline'); ul.innerHTML = '';
    const sortedLogs = [...plant.logs].sort((a,b) => new Date(b.date) - new Date(a.date));
    sortedLogs.forEach(log => {
        const li = document.createElement('li');
        let heightStr = (log.type === 'Misurazione' && log.height !== null && log.height !== undefined) ? `<br>📏 <strong>Altezza:</strong> ${log.height} cm` : ''; let phStr = (log.type === 'Misurazione pH' && log.ph !== null && log.ph !== undefined) ? `<br>🧪 <strong>pH:</strong> ${log.ph}` : ''; let harvestStr = (log.type === 'Raccolto' && log.harvest) ? `<br>🧺 <strong>Resa:</strong> ${escapeHTML(log.harvest)}` : '';
        let repotStr = ''; if (log.type === 'Rinvaso / Sistemazione' && log.placement) { repotStr = `<br>🪴 <strong>Nuova sistemazione:</strong> ${escapeHTML(log.placement)}`; if (log.placement === 'Vaso' && log.potSize) repotStr += ` (${escapeHTML(log.potSize)} L)`; }
        let graftStr = ''; if (log.type === 'Innesto' && log.graftName) { graftStr = `<br>🔪 <strong>Nuovo nome pianta:</strong> ${escapeHTML(log.graftName)}`; }
        let imgStr = log.photo ? `<br><img src="${log.photo}" class="timeline-photo" alt="Foto Evento">` : '';
        li.innerHTML = `<div style="display:flex; justify-content:space-between;"><div><span class="timeline-date">${log.date}</span><span class="timeline-type">${log.type}</span></div><button style="color:red; background:none; border:none; cursor:pointer;" onclick="deleteLog(${log.id})">✖</button></div><p style="margin: 8px 0 0 0; font-size: 14px;">${escapeHTML(log.note)}${heightStr}${phStr}${harvestStr}${repotStr}${graftStr}</p>${imgStr}`;
        ul.appendChild(li);
    });
}

function initMap(plant) {
    let lat = plant.lat ? parseFloat(plant.lat) : 41.8719; let lng = plant.lng ? parseFloat(plant.lng) : 12.5674; let zoom = plant.lat ? 15 : 5;
    if (!map) {
        map = L.map('map-container').setView([lat, lng], zoom); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
        map.on('click', function(e) { 
            if(confirm("Impostare la posizione della pianta qui?")) { 
                plant.lat = e.latlng.lat.toFixed(5); plant.lng = e.latlng.lng.toFixed(5); 
                unsavedChanges = true; saveToLocal(); 
                updateMapMarker(plant.lat, plant.lng); 
                openPlantDetail(plant.id); 
            } 
        });
    } else { map.setView([lat, lng], zoom); setTimeout(() => map.invalidateSize(), 300); }
    updateMapMarker(lat, lng, !!plant.lat && !!plant.lng);
}

function updateMapMarker(lat, lng, hasLocation = true) { if(marker) map.removeLayer(marker); if(hasLocation) marker = L.marker([lat, lng]).addTo(map); }

function updateYearDropdown(plant) {
    const select = document.getElementById('chart-year-filter'); const currentSelection = select.value;
    const years = new Set(plant.logs.map(l => l.date ? l.date.substring(0, 4) : 'N/D')); const sortedYears = Array.from(years).sort().reverse();
    select.innerHTML = '<option value="all">Tutti gli anni</option>'; sortedYears.forEach(year => { const opt = document.createElement('option'); opt.value = year; opt.innerText = year; select.appendChild(opt); });
    if (sortedYears.includes(currentSelection)) select.value = currentSelection;
}

function updateChartsFromDropdown() { const plant = plantsDatabase.find(p => p.id === currentPlantId); if(plant) renderCharts(plant); }

function renderCharts(plant) {
    const selectedYear = document.getElementById('chart-year-filter').value; let filteredLogs = selectedYear !== 'all' ? plant.logs.filter(l => l.date.startsWith(selectedYear)) : plant.logs;
    const heightLogs = filteredLogs.filter(l => l.type === 'Misurazione'); heightLogs.sort((a,b) => new Date(a.date) - new Date(b.date));
    if(growthChart) growthChart.destroy();
    growthChart = new Chart(document.getElementById('growthChart').getContext('2d'), { type: 'line', data: { labels: heightLogs.map(l => l.date), datasets: [{ label: 'Altezza Pianta (cm)', data: heightLogs.map(l => l.height), borderColor: '#2e7d32', backgroundColor: 'rgba(46, 125, 50, 0.2)', borderWidth: 2, pointBackgroundColor: '#2e7d32', pointRadius: 5, fill: true, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: `📈 Curva di crescita${selectedYear !== 'all' ? ' - '+selectedYear : ''}` } }, scales: { y: { beginAtZero: true } } } });

    const eventLogs = filteredLogs.filter(l => l.type !== 'Misurazione'); eventLogs.sort((a,b) => new Date(a.date) - new Date(b.date));
    if(eventsChart) eventsChart.destroy();
    const eventLabels = [...new Set(eventLogs.map(l => l.date))]; 
    const yCategories = ['Innesto', 'Rinvaso / Sistemazione', 'Misurazione pH', 'Raccolto', 'Fruttificazione', 'Fioritura', 'Stato di Salute', 'Spostamento', 'Concimazione', 'Trattamento', 'Irrigazione'];

    eventsChart = new Chart(document.getElementById('eventsChart').getContext('2d'), {
        type: 'line', data: { datasets: [{ label: 'Eventi', data: eventLogs.map(l => {
            let text = l.note || ''; if (l.type === 'Misurazione pH' && l.ph) text = `pH: ${l.ph}` + (text ? ` (${text})` : ''); if (l.type === 'Raccolto' && l.harvest) text = `Resa: ${l.harvest}` + (text ? ` (${text})` : ''); if (l.type === 'Rinvaso / Sistemazione' && l.placement) text = `Nuovo: ${l.placement} ${l.potSize ? '('+l.potSize+'L)' : ''}` + (text ? ` (${text})` : ''); if (l.type === 'Innesto' && l.graftName) text = `Nuovo nome: ${l.graftName}` + (text ? ` (${text})` : ''); return { x: l.date, y: l.type, note: text };
        }), backgroundColor: '#f57f17', borderColor: '#f57f17', pointRadius: 8, pointHoverRadius: 12, showLine: false }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: `🌸 Fasi fenologiche ed eventi${selectedYear !== 'all' ? ' - '+selectedYear : ''}` }, legend: { display: false }, tooltip: { callbacks: { label: function(context) { return `Nota: ${context.raw.note}`; } } } }, scales: { x: { type: 'category', labels: eventLabels }, y: { type: 'category', labels: yCategories } } }
    });
}