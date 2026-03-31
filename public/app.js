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
        error_offline: "Usługa aktualnie nie działa — brak połączenia z serwerem AI."
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
        error_offline: "Service currently unavailable — no connection to AI server."
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
const promptInput = document.getElementById('system-prompt-input');
const savePromptBtn = document.getElementById('save-prompt-btn');
const resetPromptBtn = document.getElementById('reset-prompt-btn');

const clearHistoryBtn = document.getElementById('clear-history-btn');
const exportBtn = document.getElementById('export-btn');

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
function saveHistory() { localStorage.setItem('wired-ai-history', JSON.stringify(chatHistory.slice(-50))); }
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
    chatHistory.forEach(msg => appendMessageUI(msg.role, msg.content, msg.stats));
}

function appendMessageUI(role, content, stats = null) {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${role === 'user' ? 'message-user' : 'message-ai'}`;
    
    // Content Container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = role === 'assistant' ? marked.parse(content) : content.replace(/\n/g, '<br>');
    bubble.appendChild(contentDiv);

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
        sendBtn.disabled = true;
        inputContainer.style.opacity = '0.5';
        inputContainer.style.pointerEvents = 'none';
        document.getElementById('offline-msg').textContent = translations[currentLang].error_offline;
    } else {
        warning.classList.add('d-none');
        messageInput.disabled = false;
        sendBtn.disabled = false;
        inputContainer.style.opacity = '1';
        inputContainer.style.pointerEvents = 'auto';
    }
}

async function sendMessage() {
    const content = messageInput.value.trim();
    const selectedModel = modelSelector.value;
    
    if (!content || isStreaming) return;
    if (!selectedModel) {
        alert('Wybierz model przed wysłaniem wiadomości.');
        return;
    }

    isStreaming = true;
    sendBtn.disabled = true;
    messageInput.value = '';
    messageInput.style.height = 'auto';

    chatHistory.push({ role: 'user', content });
    saveHistory();
    appendMessageUI('user', content);

    const startTime = performance.now();
    let ttft = 0; // Time to first token
    let tokenCount = 0;
    
    const uiController = appendMessageUI('assistant', '...');
    let fullResponse = '';

    try {
        const response = await fetch('/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                model: selectedModel,
                stream: true,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...chatHistory
                ]
            })
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
        uiController.updateContent(`⚠ Błąd: ${err.message}`);
    } finally {
        isStreaming = false;
        sendBtn.disabled = false;
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

    // System Prompt Modal
    document.getElementById('system-prompt-btn').onclick = () => promptModal.show();
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
}
