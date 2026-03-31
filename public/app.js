/**
 * Wired AI: One
 * Modern Chat Interface using Bootstrap 5 & Vanilla JS
 */

// --- Constants & Globals ---
let authToken = localStorage.getItem('wired-ai-auth') || '';
let chatHistory = JSON.parse(localStorage.getItem('wired-ai-history') || '[]');
let systemPrompt = localStorage.getItem('wired-ai-system-prompt') || 'You are a helpful AI assistant. Respond concisely and professionally.';
let currentLang = localStorage.getItem('wired-ai-lang') || 'pl';
let isStreaming = false;
let abortController = null;
let messageQueue = [];

const translations = {
    pl: {
        status_checking: "Sprawdzanie...",
        status_online: "Działa",
        status_offline: "Offline",
        status_error: "Błąd",
        select_model: "Wybierz model...",
        prompt_title: "Instrukcje Systemowe",
        prompt_desc: "Zdefiniuj sposób zachowania AI dla wszystkich przyszłych wiadomości.",
        prompt_placeholder: "Np. 'Zawsze odpowiadaj po polsku w sposób uprzejmy'",
        btn_reset: "Reset",
        btn_save: "Zapisz",
        menu_clear: "Wyczyść czat",
        menu_export: "Eksportuj JSON",
        menu_theme: "Motyw",
        theme_dark: "Ciemny",
        theme_light: "Jasny",
        input_placeholder: "Zadaj pytanie...",
        clear_confirm: "Wyczyścić historię czatu?",
        login_title: "Wprowadź hasło",
        login_btn: "Wejdź",
        error_auth: "Błędne hasło",
        error_model: "Wybierz model przed wysłaniem wiadomości.",
        error_offline: "Usługa aktualnie nie działa — brak połączenia z serwerem AI.",
        welcome_msg: "Witaj w **Wired AI: One**! 🤖✨\n\nJestem Twoim zaawansowanym asystentem na Synology. Potrafię:\n- 📝 **Analizować tekst** i odpowiadać na pytania.\n- 📄 **Czytać dokumenty** (PDF, Word, TXT, MD).\n- 🖼️ **Oglądać wiele obrazów** jednocześnie (Multi-Vision).\n\nW czym mogę Ci dzisiaj pomóc? 🚀"
    },
    en: {
        status_checking: "Checking...",
        status_online: "Online",
        status_offline: "Offline",
        status_error: "Error",
        select_model: "Select model...",
        prompt_title: "System Instructions",
        prompt_desc: "Define how the AI should behave for all future messages.",
        prompt_placeholder: "e.g. 'Always respond concisely and professionally'",
        btn_reset: "Reset",
        btn_save: "Save",
        menu_clear: "Clear Chat",
        menu_export: "Export JSON",
        menu_theme: "Theme",
        theme_dark: "Dark",
        theme_light: "Light",
        input_placeholder: "Ask a question...",
        clear_confirm: "Clear chat history?",
        login_title: "Enter password",
        login_btn: "Enter",
        error_auth: "Invalid password",
        error_model: "Please select a model before sending.",
        error_offline: "Service currently unavailable — no connection to AI server.",
        welcome_msg: "Welcome to **Wired AI: One**! 🤖✨\n\nI am your advanced assistant on Synology. I can:\n- 📝 **Analyze text** and answer questions.\n- 📄 **Read documents** (PDF, Word, TXT, MD).\n- 🖼️ **See multiple images** at once (Multi-Vision).\n\nHow can I help you today? 🚀"
    }
};

// --- DOM Elements ---
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const authInput = document.getElementById('auth-input');
const loginError = document.getElementById('login-error');

const messagesWrapper = document.getElementById('messages-wrapper');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const modelSelector = document.getElementById('model-selector');
const aiStatusText = document.getElementById('ai-status-text');
const aiStatusContainer = document.getElementById('ai-status');

const promptModal = new bootstrap.Modal(document.getElementById('prompt-modal'));
const infoModal = new bootstrap.Modal(document.getElementById('info-modal'));
const promptInput = document.getElementById('system-prompt-input');
const savePromptBtn = document.getElementById('save-prompt-btn');
const resetPromptBtn = document.getElementById('reset-prompt-btn');

const clearHistoryBtn = document.getElementById('clear-history-btn');
const exportBtn = document.getElementById('export-btn');

// --- Vision Elements ---
const imageUpload = document.getElementById('image-upload');
const uploadBtn = document.getElementById('upload-btn');
const imagePreviewContainer = document.getElementById('image-preview-container');

let currentImages = []; // Array of { id, base64 }

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initLang();
    initApp();
    setupEventListeners();
    registerSW();
});

function registerSW() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(err => {
                console.log('SW registration failed: ', err);
            });
        });
    }
}

async function initApp() {
    // Check Auth requirement from server
    try {
        const req = await fetch('/auth/verify', { method: 'POST', headers: {'Content-Type': 'application/json'} });
        const res = await req.json();
        
        if (res.success && res.message === "No password required") {
            showApp();
        } else if (authToken) {
            const isValid = await verifyToken(authToken);
            if (isValid) showApp();
            else showLogin();
        } else {
            showLogin();
        }
    } catch (e) {
        showLogin();
    }
}

function showApp() {
    loginOverlay.classList.add('d-none');
    fetchModels();
    renderHistory();
    pollStatus();
    setInterval(pollStatus, 15000);
    promptInput.value = systemPrompt;
}

function showLogin() {
    loginOverlay.classList.remove('d-none');
}

async function verifyToken(token) {
    try {
        const req = await fetch('/api/status', { headers: { 'Authorization': `Bearer ${token}` } });
        return req.ok;
    } catch (e) { return false; }
}

// --- State & Storage ---
function saveHistory() { 
    const historyToSave = chatHistory.slice(-50);
    try {
        localStorage.setItem('wired-ai-history', JSON.stringify(historyToSave));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.warn('[Storage]: Memory full, stripping old images to clear space...');
            // Backup strategy: strip images from older messages (starting from first 20)
            const cleanedHistory = historyToSave.map((msg, index) => {
                if (index < 30 && Array.isArray(msg.content)) {
                    // Replace base64 images with placeholder strings
                    const filteredContent = msg.content.map(c => 
                        c.type === 'image_url' ? { type: 'text', text: '[Zdjęcie usunięte z lokalnego cache by oszczędzać miejsce]' } : c
                    );
                    return { ...msg, content: filteredContent };
                }
                return msg;
            });
            
            try {
                localStorage.setItem('wired-ai-history', JSON.stringify(cleanedHistory));
            } catch (e2) {
                // Final fallback: save only text for everything
                console.error('[Storage]: Still full, saving text only.');
                const textOnly = historyToSave.map(msg => ({
                    role: msg.role,
                    content: Array.isArray(msg.content) ? 
                        msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n') || '[Obraz]' : 
                        msg.content
                }));
                localStorage.setItem('wired-ai-history', JSON.stringify(textOnly));
            }
        }
    }
}
function clearHistory() { 
    if(confirm('Wyczyścić historię czatu?')) {
        chatHistory = []; 
        saveHistory(); 
        messagesWrapper.innerHTML = '';
    }
}

// --- UI Rendering ---
function renderHistory() {
    messagesWrapper.innerHTML = '';
    if (chatHistory.length === 0) {
        // Show welcome assistant message if history is empty
        const welcomeText = translations[currentLang].welcome_msg;
        appendMessageUI('assistant', welcomeText);
        return;
    }
    chatHistory.forEach(msg => appendMessageUI(msg.role, msg.content, msg.stats));
}

function appendMessageUI(role, content, stats = null, isQueued = false) {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${role === 'user' ? 'message-user' : 'message-ai'}`;
    if (isQueued) bubble.classList.add('message-queued');
    
    // Content Container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    bubble.appendChild(contentDiv);

    // Queue Indicator
    if (isQueued) {
        const qStat = document.createElement('div');
        qStat.className = 'queue-status';
        qStat.innerHTML = '<i class="bi bi-clock"></i> W kolejce do AI...';
        bubble.appendChild(qStat);
    }

    // Render Images if any
    if (role === 'user' && Array.isArray(content)) {
        const images = content.filter(c => c.type === 'image_url');
        const textObj = content.find(c => c.type === 'text');
        
        if (images.length > 0) {
            const grid = document.createElement('div');
            grid.className = 'message-images-grid';
            images.forEach(img => {
                const imgEl = document.createElement('img');
                imgEl.src = img.image_url.url;
                imgEl.className = 'message-image shadow-sm';
                grid.appendChild(imgEl);
            });
            bubble.insertBefore(grid, contentDiv);
        }
        contentDiv.innerHTML = textObj ? textObj.text.replace(/\n/g, '<br>') : '';
    } else {
        contentDiv.innerHTML = role === 'assistant' ? marked.parse(content) : content.replace(/\n/g, '<br>');
    }

    // Performance Stats (if AI)
    if (role === 'assistant' && stats) {
        const statsDiv = document.createElement('div');
        statsDiv.className = 'performance-badge';
        statsDiv.innerHTML = `<span><i class="bi bi-speedometer2"></i> ${stats.tps} t/s</span> <span><i class="bi bi-clock"></i> ${stats.duration}s</span>`;
        bubble.appendChild(statsDiv);
    }

    // Copy Button
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-link p-0 text-muted';
    copyBtn.innerHTML = '<i class="bi bi-copy"></i>';
    copyBtn.title = 'Kopiuj';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(content);
        copyBtn.innerHTML = '<i class="bi bi-check2"></i>';
        setTimeout(() => copyBtn.innerHTML = '<i class="bi bi-copy"></i>', 2000);
    };
    actionsDiv.appendChild(copyBtn);
    bubble.appendChild(actionsDiv);

    messagesWrapper.appendChild(bubble);
    scrollToBottom();
    return {
        bubble,
        updateContent: (newContent) => {
            contentDiv.innerHTML = marked.parse(newContent);
            content = newContent; // Update content for copy function
            scrollToBottom();
        },
        updateStats: (s) => {
            const sd = document.createElement('div');
            sd.className = 'performance-badge';
            sd.innerHTML = `<span><i class="bi bi-speedometer2"></i> ${s.tps} t/s</span> <span><i class="bi bi-clock"></i> ${s.duration}s</span>`;
            bubble.insertBefore(sd, actionsDiv);
        }
    };
}

function scrollToBottom() {
    const main = document.querySelector('main');
    main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' });
}

// --- API Interactions ---
async function fetchModels() {
    try {
        const req = await fetch('/api/v1/models', { headers: { 'Authorization': `Bearer ${authToken}` } });
        const res = await req.json();
        console.log('[DEBUG] Full Models Response:', res);
        
        let models = [];
        if (Array.isArray(res)) {
            models = res;
        } else if (res.data && Array.isArray(res.data)) {
            models = res.data;
        } else if (res.models && Array.isArray(res.models)) {
            models = res.models;
        }

        if (models.length > 0) {
            modelSelector.innerHTML = `<option value="" id="opt-select-model">${translations[currentLang].select_model}</option>`;
            
            // Sort: loaded models first
            const sortedModels = models.sort((a, b) => {
                const aLoaded = (a.loaded_instances && a.loaded_instances.length > 0) || a.state === 'loaded' || a.loaded === true;
                const bLoaded = (b.loaded_instances && b.loaded_instances.length > 0) || b.state === 'loaded' || b.loaded === true;
                return bLoaded - aLoaded;
            });

            const loadedModels = sortedModels.filter(m => (m.loaded_instances && m.loaded_instances.length > 0) || m.state === 'loaded' || m.loaded === true);
            
            sortedModels.forEach(m => {
                const opt = document.createElement('option');
                const isLoaded = (m.loaded_instances && m.loaded_instances.length > 0) || m.state === 'loaded' || m.loaded === true;
                const modelId = m.id || m.key;
                const modelName = m.display_name || m.id || m.key;
                
                opt.value = modelId;
                opt.textContent = isLoaded ? `● ${modelName} (Loaded)` : modelName;
                if (isLoaded) opt.classList.add('text-success');
                modelSelector.appendChild(opt);
            });

            const lastModel = localStorage.getItem('wired-ai-last-model');
            if (loadedModels.length === 1) {
                const autoId = loadedModels[0].id || loadedModels[0].key;
                modelSelector.value = autoId;
                localStorage.setItem('wired-ai-last-model', autoId);
            } else if (lastModel && sortedModels.some(m => (m.id === lastModel || m.key === lastModel))) {
                modelSelector.value = lastModel;
            }
        }
    } catch (e) {
        console.error('Failed to fetch models', e);
    }
}

async function pollStatus() {
    try {
        const req = await fetch('/api/status', { headers: { 'Authorization': `Bearer ${authToken}` } });
        const res = await req.json();
        if (res.status === 'online') {
            aiStatusContainer.className = 'badge rounded-pill status-badge status-online';
            aiStatusText.textContent = translations[currentLang].status_online;
            toggleOfflineMode(false);
        } else {
            aiStatusContainer.className = 'badge rounded-pill status-badge status-offline';
            aiStatusText.textContent = translations[currentLang].status_offline;
            toggleOfflineMode(true);
        }
    } catch (e) {
        aiStatusContainer.className = 'badge rounded-pill status-badge status-offline';
        aiStatusText.textContent = translations[currentLang].status_error;
        toggleOfflineMode(true);
    }
}

function toggleOfflineMode(isOffline) {
    const warning = document.getElementById('offline-warning');
    const inputContainer = document.getElementById('input-container');
    
    if (isOffline) {
        warning.classList.remove('d-none');
        messageInput.disabled = true;
        setStreamingMode(false); // Reset generating state on offline
        inputContainer.style.opacity = '0.5';
        inputContainer.style.pointerEvents = 'none';
        document.getElementById('offline-msg').textContent = translations[currentLang].error_offline;
    } else {
        warning.classList.add('d-none');
        messageInput.disabled = false;
        inputContainer.style.opacity = '1';
        inputContainer.style.pointerEvents = 'auto';
    }
}
async function sendMessage() {
    const rawMessage = messageInput.value.trim();
    const rawImages = [...currentImages];
    const selectedModel = modelSelector.value;

    if (isStreaming) {
        if (!rawMessage && rawImages.length === 0) return;
        // Queue the message with UI reference
        const uiOutput = appendMessageUI('user', rawImages.length > 0 ? 
            [{type:'text', text: rawMessage}, ...rawImages.map(img => ({type:'image_url', image_url: {url: img.base64}}))] : 
            rawMessage, null, true
        );
        messageQueue.push({ message: rawMessage, images: rawImages, uiRef: uiOutput.bubble });
        messageInput.value = '';
        messageInput.style.height = 'auto';
        clearAllImages();
        return;
    }

    const message = rawMessage;
    const currentImgs = rawImages.filter(i => i.type === 'image' || !i.type); // backward comp
    const currentDocs = rawImages.filter(i => i.type === 'document');
    
    if ((!message && rawImages.length === 0)) return;
    if (!selectedModel) {
        alert(translations[currentLang].error_model);
        return;
    }

    setStreamingMode(true);
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Integrate document text as context
    let docContext = currentDocs.map(d => `[PLIK: ${d.filename}]\n${d.text}\n---`).join('\n');
    let finalPrompt = docContext ? `${docContext}\n\n${message}` : message;

    let apiContent = finalPrompt;
    let uiContentForHistory = finalPrompt;
    
    if (currentImgs.length > 0) {
        apiContent = [
            { type: "text", text: finalPrompt },
            ...currentImgs.map(img => ({ type: "image_url", image_url: { url: img.base64 } }))
        ];
        uiContentForHistory = apiContent; 
    }

    chatHistory.push({ role: 'user', content: apiContent });
    saveHistory();
    appendMessageUI('user', uiContentForHistory);
    
    // Clear Vision State for the message just sent
    clearAllImages();

    const startTime = performance.now();
    let ttft = 0; // Time to first token
    let tokenCount = 0;
    
    const uiController = appendMessageUI('assistant', '...');
    let fullResponse = '';

    try {
        // Smart History: Merge consecutive roles to avoid API errors (especially with Vision/Reasoning models)
        const massagedMessages = [{ role: 'system', content: systemPrompt }];
        
        chatHistory.forEach(msg => {
            const last = massagedMessages[massagedMessages.length - 1];
            if (last && last.role === msg.role) {
                // Merge content
                if (typeof last.content === 'string' && typeof msg.content === 'string') {
                    last.content += "\n" + msg.content;
                } else {
                    // Handle multimodal merging (arrays)
                    const lastArr = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
                    const msgArr = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
                    last.content = [...lastArr, ...msgArr];
                }
            } else {
                massagedMessages.push({ ...msg });
            }
        });

        const bodyData = {
            model: selectedModel,
            stream: true,
            messages: massagedMessages
        };
        console.log('[API Request Content (Massaged)]:', bodyData);

        abortController = new AbortController();
        const response = await fetch('/api/v1/chat/completions', {
            method: 'POST',
            signal: abortController.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(bodyData)
        });

        if (!response.ok) throw new Error('Serwer zwrócił błąd: ' + response.status);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    if (line.includes('[DONE]')) continue;
                    try {
                        const data = JSON.parse(line.slice(6));
                        const text = data.choices[0]?.delta?.content || "";
                        if (text) {
                            if (!ttft) ttft = (performance.now() - startTime) / 1000;
                            fullResponse += text;
                            tokenCount++; 
                            uiController.updateContent(fullResponse);
                        }
                    } catch (e) {}
                }
            }
        }

        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(1);
        const estimatedTokens = Math.ceil(fullResponse.length / 4); // Heuristic
        const tps = (estimatedTokens / duration).toFixed(1);

        const stats = { tps, duration };
        uiController.updateStats(stats);
        chatHistory.push({ role: 'assistant', content: fullResponse, stats });
        saveHistory();

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('[Vision API]: Generation aborted by user.');
            uiController.updateContent(`*Anulowano przez użytkownika.*`);
        } else {
            console.error('[Vision API Error]:', err);
            uiController.updateContent(`⚠ Błąd: ${err.message}`);
        }
    } finally {
        setStreamingMode(false);
        // Process next in queue
        if (messageQueue.length > 0) {
            const next = messageQueue.shift();
            // Clear queue UI state if exists
            if (next.uiRef) {
                next.uiRef.classList.remove('message-queued');
                const qStat = next.uiRef.querySelector('.queue-status');
                if (qStat) qStat.remove();
            }
            messageInput.value = next.message;
            currentImages = next.images;
            sendMessage();
        }
    }
}

function setStreamingMode(enabled) {
    isStreaming = enabled;
    if (enabled) {
        sendBtn.classList.add('btn-danger', 'stop-mode');
        sendBtn.classList.remove('btn-primary');
        sendBtn.innerHTML = '<i class="bi bi-stop-fill"></i>';
    } else {
        sendBtn.classList.add('btn-primary');
        sendBtn.classList.remove('btn-danger', 'stop-mode');
        sendBtn.innerHTML = '<i class="bi bi-send-fill"></i>';
        abortController = null;
    }
}

function stopGeneration() {
    if (abortController) {
        abortController.abort();
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const password = authInput.value;
        const req = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const res = await req.json();
        if (res.success) {
            authToken = res.token;
            localStorage.setItem('wired-ai-auth', authToken);
            showApp();
        } else {
            loginError.classList.remove('d-none');
        }
    };

    sendBtn.onclick = sendMessage;
    messageInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Auto-resize textarea
    messageInput.oninput = () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
    };

    // Modals
    document.getElementById('system-prompt-btn').onclick = () => promptModal.show();
    document.getElementById('info-btn').onclick = () => infoModal.show();
    savePromptBtn.onclick = () => {
        systemPrompt = promptInput.value;
        localStorage.setItem('wired-ai-system-prompt', systemPrompt);
        promptModal.hide();
    };
    resetPromptBtn.onclick = () => {
        promptInput.value = 'You are a helpful AI assistant. Respond concisely and professionally.';
    };

    clearHistoryBtn.onclick = clearHistory;
    
    // Language switching
    document.getElementById('lang-pl').onclick = () => setLang('pl');
    document.getElementById('lang-en').onclick = () => setLang('en');
    
    // Theme switching
    document.querySelectorAll('.theme-link').forEach(link => {
        link.onclick = (e) => {
            const theme = e.target.dataset.theme;
            setTheme(theme);
        };
    });

    modelSelector.onchange = (e) => {
        localStorage.setItem('wired-ai-last-model', e.target.value);
    };

    exportBtn.onclick = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chatHistory, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "wired_ai_history.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    // --- Vision Listeners ---
    uploadBtn.onclick = () => imageUpload.click();
    imageUpload.onchange = handleImageSelect;
}

function handleImageSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
        const id = Date.now() + Math.random().toString(16).slice(2);
        
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                currentImages.push({ id, type: 'image', base64: event.target.result });
                renderPreviews();
            };
            reader.readAsDataURL(file);
        } else {
            // Document handling
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target.result;
                try {
                    const res = await fetch('/api/extract-text', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                        body: JSON.stringify({ base64, filename: file.name, mimeType: file.type })
                    });
                    const data = await res.json();
                    if (data.text) {
                        currentImages.push({ id, type: 'document', text: data.text, filename: file.name, mimeType: file.type });
                        renderPreviews();
                    } else {
                        console.error('[Doc Error]:', data.error);
                    }
                } catch (err) { console.error('[Fetch Error]:', err); }
            };
            reader.readAsDataURL(file);
        }
    });
}

function renderPreviews() {
    imagePreviewContainer.innerHTML = '';
    if (currentImages.length === 0) {
        imagePreviewContainer.classList.add('d-none');
        return;
    }

    imagePreviewContainer.classList.remove('d-none');
    currentImages.forEach((img, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'preview-image-wrapper';
        
        if (img.type === 'document') {
            const isPdf = img.mimeType === 'application/pdf';
            const isDocx = img.filename.endsWith('.docx');
            const iconClass = isPdf ? 'bi-file-pdf text-danger' : (isDocx ? 'bi-file-word text-primary' : 'bi-file-earmark-text text-info');
            
            wrapper.innerHTML = `
                <div class="preview-thumbnail doc-card d-flex flex-column align-items-center justify-content-center p-2">
                    <i class="bi ${iconClass} fs-3"></i>
                    <small class="doc-name-small mt-1 text-truncate" style="max-width: 70px;">${img.filename}</small>
                </div>
                <button class="btn btn-danger remove-image-pill" onclick="removeImage('${img.id}')">
                    <i class="bi bi-x"></i>
                </button>
            `;
        } else {
            wrapper.innerHTML = `
                <img src="${img.base64}" class="preview-thumbnail shadow-sm">
                <button class="btn btn-danger remove-image-pill" onclick="removeImage('${img.id}')">
                    <i class="bi bi-x"></i>
                </button>
            `;
        }
        imagePreviewContainer.appendChild(wrapper);
    });
}

function removeImage(id) {
    currentImages = currentImages.filter(img => img.id !== id);
    renderPreviews();
}

// Make globally available for onclick
window.removeImage = removeImage;

function clearAllImages() {
    currentImages = [];
    imageUpload.value = '';
    renderPreviews();
}

function initTheme() {
    const savedTheme = localStorage.getItem('wired-ai-theme') || 'auto';
    setTheme(savedTheme);
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('wired-ai-theme', theme);
}

function initLang() {
    setLang(currentLang);
}

function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('wired-ai-lang', lang);
    
    // Update active UI state
    document.getElementById('lang-pl').classList.toggle('active', lang === 'pl');
    document.getElementById('lang-en').classList.toggle('active', lang === 'en');
    
    // Apply translations
    const t = translations[lang];
    document.getElementById('ai-status-text').textContent = t.status_checking;
    document.getElementById('opt-select-model').textContent = t.select_model;
    document.getElementById('modal-title-text').textContent = t.prompt_title;
    document.getElementById('lbl-model').textContent = t.select_model.split('...')[0]; // Simple label
    document.getElementById('lbl-lang').textContent = lang === 'pl' ? 'Język Interfejsu' : 'Interface Language';
    document.getElementById('lbl-prompt').textContent = t.prompt_title;
    document.getElementById('system-prompt-input').placeholder = t.prompt_placeholder;
    document.getElementById('reset-prompt-btn').textContent = t.btn_reset;
    document.getElementById('save-prompt-btn').textContent = t.btn_save;
    document.getElementById('clear-history-btn').innerHTML = `<i class="bi bi-trash3 me-2"></i>${t.menu_clear}`;
    document.getElementById('export-btn').innerHTML = `<i class="bi bi-download me-2"></i>${t.menu_export}`;
    document.querySelector('.dropdown-header').textContent = t.menu_theme;
    document.querySelector('[data-theme="dark"]').textContent = t.theme_dark;
    document.querySelector('[data-theme="light"]').textContent = t.theme_light;
    document.getElementById('message-input').placeholder = t.input_placeholder;
    document.getElementById('login-msg').textContent = t.login_title;
    document.querySelectorAll('#login-form button').forEach(b => b.textContent = t.login_btn);
    document.getElementById('login-error').textContent = t.error_auth;

    // Re-render if empty to update welcome message language
    if (chatHistory.length === 0) renderHistory();
}
