document.addEventListener('DOMContentLoaded', () => {
    
    // --- VARIABLES ---
    const views = {
        upload: document.getElementById('view-upload'),
        search: document.getElementById('view-search')
    };
    
    const inputs = {
        search: document.getElementById('search-input'),
        file: document.getElementById('file-upload')
    };

    const btns = {
        settings: document.getElementById('btn-settings'),
        gotoSearch: document.getElementById('btn-goto-search'),
        info: document.getElementById('btn-info'),
        closeModal: document.getElementById('btn-close-modal'),
        closeDetails: document.getElementById('btn-close-details'),
        theme: document.getElementById('theme-toggle')
    };

    const ui = {
        loader: document.getElementById('loading-indicator'),
        uploadStatus: document.getElementById('upload-status'),
        dataExistsMsg: document.getElementById('data-exists-msg'),
        results: document.getElementById('results-container'),
        infoModal: document.getElementById('info-modal'),
        detailsModal: document.getElementById('details-modal'),
        detailsContent: document.getElementById('details-content'),
        sun: document.querySelector('.sun-icon'),
        moon: document.querySelector('.moon-icon')
    };

    let sheetData = [];
    const STORAGE_KEY = 'hebichs_local_data_v1';

    // --- INIT ---
    function init() {
        loadTheme();
        const stored = localStorage.getItem(STORAGE_KEY);
        
        if (stored) {
            // Data found in storage? Process it and go to search.
            try {
                processData(JSON.parse(stored));
                switchView('search');
            } catch(e) {
                console.error("Data corrupted", e);
                switchView('upload');
            }
        } else {
            // No data? Show upload screen.
            switchView('upload');
        }
    }

    // --- VIEW MANAGEMENT ---
    function switchView(viewName) {
        Object.keys(views).forEach(key => {
            const el = views[key];
            if (key !== viewName) {
                el.classList.remove('active-view');
                setTimeout(() => el.classList.add('hidden'), 400); 
            }
        });
        const target = views[viewName];
        target.classList.remove('hidden');
        setTimeout(() => {
            target.classList.add('active-view');
            if(viewName === 'search') inputs.search.focus();
        }, 50);
    }

    // --- EVENT LISTENERS ---
    inputs.file.addEventListener('change', handleFileUpload);
    btns.gotoSearch.addEventListener('click', () => switchView('search'));
    btns.settings.addEventListener('click', () => {
        inputs.search.value = ''; 
        // Show that data exists if they go back to settings
        if(localStorage.getItem(STORAGE_KEY)) ui.dataExistsMsg.classList.remove('hidden');
        switchView('upload');
    });

    // --- FILE HANDLING ---
    function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        ui.uploadStatus.classList.remove('hidden');
        ui.uploadStatus.textContent = "Reading file...";

        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                // Safety check for library
                if (typeof XLSX === 'undefined') {
                    throw new Error("SheetJS library not loaded. Check CodePen JS Settings or Internet.");
                }

                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawJson = XLSX.utils.sheet_to_json(worksheet, {defval: ""});
                
                // Normalize keys (remove spaces, lowercase)
                const normalizedData = rawJson.map(row => {
                    const newRow = {};
                    Object.keys(row).forEach(key => {
                        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                        newRow[cleanKey] = row[key];
                    });
                    return newRow;
                });

                // Save and Process
                localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedData));
                
                ui.uploadStatus.textContent = "Success! Loading...";
                
                setTimeout(() => {
                    ui.uploadStatus.classList.add('hidden');
                    processData(normalizedData);
                    switchView('search');
                }, 1000);

            } catch (error) {
                console.error(error);
                ui.uploadStatus.textContent = "Error: " + error.message;
            }
        };
        reader.readAsArrayBuffer(file);
    }

    // --- DATA PROCESSING ---
    function processData(rawData) {
        let lastHouseName = "";

        sheetData = rawData.map(row => {
            const locData = parseLocation(row['map']);
            const family = row['othermembersinfamily'] || "";
            
            // Flexible key check for Family Name
            let rawFamilyName = row['familynamehousename'] || row['familyname'] || "";
            
            // Fill-down logic for house names
            if (rawFamilyName !== "") {
                lastHouseName = rawFamilyName;
            }
            const finalFamilyName = lastHouseName;

            const name = row['name'] || "Unknown";
            const dobStr = row['dob'] ? row['dob'].toString() : "-";
            const annStr = row['anniversary'] ? row['anniversary'].toString() : "-";

            return {
                familyName: finalFamilyName,
                name: name,
                family: family,
                relationRaw: row['relation'] || "",
                dob: dobStr,
                dobCountdown: getDaysUntil(dobStr),
                anniversary: annStr,
                annCountdown: getDaysUntil(annStr),
                contact: row['contactnumber'] || "-",
                address: locData.address,
                mapLink: locData.url,
                searchStr: (name + " " + family + " " + finalFamilyName).toLowerCase()
            };
        });
    }

    // --- HELPERS ---
    function getDaysUntil(dateStr) {
        if (!dateStr || dateStr === '-' || dateStr.toLowerCase() === 'na') return null;
        const parts = dateStr.split('/');
        if(parts.length < 2) return null;
        const today = new Date();
        const currentYear = today.getFullYear();
        let targetDate = new Date(currentYear, parseInt(parts[1]) - 1, parseInt(parts[0]));
        if (targetDate < today && targetDate.getDate() !== today.getDate()) {
            targetDate.setFullYear(currentYear + 1);
        }
        const diffTime = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
        if (diffTime === 0) return "Today! 🎂";
        return `in ${diffTime} days`;
    }

    function formatRelations(familyStr, relationStr) {
        if (!familyStr) return '<p>No family listed</p>';
        const family = familyStr.toString().split(',').map(s => s.trim());
        const relations = relationStr ? relationStr.toString().split(',').map(s => s.trim()) : [];
        let html = '<div class="relation-list">';
        family.forEach((member, index) => {
            const rel = relations[index] || 'Family'; 
            html += `<div class="relation-row"><span class="rel-label">${rel}:</span> <span class="rel-name">${member}</span></div>`;
        });
        html += '</div>';
        return html;
    }

    function parseLocation(mapString) {
        if (!mapString || mapString === '-') return { address: 'Not Available', url: '' };
        const parts = mapString.toString().split('http');
        let address = parts[0].trim();
        if (address.endsWith('/')) address = address.slice(0, -1).trim();
        let url = parts.length > 1 ? 'http' + parts[1] : '';
        return { address, url };
    }

    // --- SEARCH RENDERING ---
    inputs.search.addEventListener('input', (e) => {
        renderResults(e.target.value.toLowerCase().trim());
    });

    function renderResults(query) {
        ui.results.innerHTML = '';
        if (query.length === 0) return;
        const matches = sheetData.filter(row => row.searchStr.includes(query));
        if (matches.length === 0) {
            ui.results.innerHTML = `<div class="glass-card" style="padding:15px; opacity:0.7">No results found</div>`;
            return;
        }
        matches.forEach(row => {
            const card = document.createElement('div');
            card.className = 'result-card';
            const regex = new RegExp(`(${query})`, 'gi');
            const hName = row.name.replace(regex, '<span class="highlight">$1</span>');
            const hFamily = row.family ? row.family.replace(regex, '<span class="highlight">$1</span>') : "";
            const hHouse = row.familyName ? row.familyName.replace(regex, '<span class="highlight">$1</span>') : "";
            card.innerHTML = `
                <div class="result-info">
                    <h4>${hName}</h4>
                    <p class="sub-text" style="font-weight:600; color:var(--primary-color)">${hHouse}</p>
                    <p class="sub-text" style="font-size:11px; margin-top:2px;">${hFamily}</p>
                </div>
                <div class="icon-arrow"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></div>
            `;
            card.addEventListener('click', () => openDetails(row));
            ui.results.appendChild(card);
        });
    }

    function openDetails(row) {
        const relationHTML = formatRelations(row.family, row.relationRaw);
        let dobHTML = row.dob;
        if(row.dobCountdown) dobHTML += ` <span class="countdown-tag">${row.dobCountdown}</span>`;
        let annHTML = row.anniversary;
        if(row.annCountdown) annHTML += ` <span class="countdown-tag">${row.annCountdown}</span>`;
        const familyNameDisplay = row.familyName && row.familyName !== '-' ? row.familyName : 'Not Listed';

        const html = `
            <h2>${row.name}</h2>
            <div class="detail-item full-width" style="margin-bottom:15px; background:var(--highlight); text-align:center;">
                <span style="font-size:11px; text-transform:uppercase; opacity:0.6;">Family / House Name</span>
                <div style="font-weight:700; font-size:16px; margin-top:2px;">${familyNameDisplay}</div>
            </div>
            <div class="section-title">Relations</div>
            ${relationHTML}
            <div class="detail-grid">
                <div class="detail-item"><strong>Birthday</strong> <div>${dobHTML}</div></div>
                <div class="detail-item"><strong>Anniversary</strong> <div>${annHTML}</div></div>
                <div class="detail-item full-width">
                    <strong>Contact Number</strong>
                    <div class="copy-row">
                        <span>${row.contact}</span>
                        ${row.contact !== '-' ? `<button class="copy-btn" onclick="copyToClipboard('${row.contact}')">Copy</button>` : ''}
                    </div>
                </div>
                <div class="detail-item full-width">
                    <strong>Address</strong>
                    <div class="copy-row">
                        <span>${row.address}</span>
                        <button class="copy-btn" onclick="copyToClipboard('${row.address}')">Copy</button>
                    </div>
                </div>
                 <div class="detail-item full-width">
                    <strong>Google Maps Link</strong>
                    <div class="copy-row">
                        <span style="font-size:12px; opacity:0.7; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; display:block; max-width:180px;">${row.mapLink || 'No Link'}</span>
                        ${row.mapLink ? `<button class="copy-btn" onclick="copyToClipboard('${row.mapLink}')">Copy Link</button>` : ''}
                    </div>
                </div>
            </div>
        `;
        ui.detailsContent.innerHTML = html;
        ui.detailsModal.classList.remove('hidden');
    }

    window.copyToClipboard = (text) => { navigator.clipboard.writeText(text).then(() => { alert("Copied!"); }); };

    // --- THEME ---
    btns.theme.addEventListener('click', () => {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        setTheme(!isDark);
    });

    function setTheme(isDark) {
        document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        if (isDark) {
            ui.sun.classList.add('hidden');
            ui.moon.classList.remove('hidden');
        } else {
            ui.sun.classList.remove('hidden');
            ui.moon.classList.add('hidden');
        }
    }

    function loadTheme() {
        const saved = localStorage.getItem('theme');
        if (saved) setTheme(saved === 'dark');
        else setTheme(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    // --- MODALS ---
    btns.info.addEventListener('click', () => ui.infoModal.classList.remove('hidden'));
    btns.closeModal.addEventListener('click', () => ui.infoModal.classList.add('hidden'));
    btns.closeDetails.addEventListener('click', () => ui.detailsModal.classList.add('hidden'));

    // Start
    init();
});