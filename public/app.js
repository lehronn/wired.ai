// Globals
let authToken = localStorage.getItem('wired-ai-auth') || '';
let chatHistory = JSON.parse(localStorage.getItem('wired-ai-history') || '[]');
let isStreaming = false;

// UI Elements
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const appContainer = document.getElementById('app-container');
const modelSelector = document.getElementById('model-selector');
const themeSelector = document.getElementById('theme-selector');
const messagesContainer = document.getElementById('messages');
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');

const refreshModelsBtn = document.getElementById('refresh-models-btn');
const statusDot = document.getElementById('ai-status-dot');
const statusText = document.getElementById('ai-status-text');

// New UI Elements
const langPlBtn = document.getElementById('lang-pl');
const langEnBtn = document.getElementById('lang-en');
const systemPromptBtn = document.getElementById('system-prompt-btn');
const systemPromptModal = document.getElementById('system-prompt-modal');
const closeModalBtn = document.getElementById('close-modal');
const systemPromptInput = document.getElementById('system-prompt-input');
const savePromptBtn = document.getElementById('save-prompt-btn');
const resetPromptBtn = document.getElementById('reset-prompt-btn');

// State
let currentLang = localStorage.getItem('wired-ai-lang') || 'pl';
let systemPrompt = localStorage.getItem('wired-ai-system-prompt') || 'You are a helpful AI assistant called Wired AI. Respond concisely and professionally.';

const translations = {
    pl: {
        title: "Wired AI",
        status_checking: "Sprawdzanie stanu...",
        status_online: "Usługa AI Działa",
        status_offline: "Brak Modelu (Offline)",
        status_no_conn: "Brak Połączenia",
        select_model: "Wybierz model...",
        theme_auto: "Motyw: Auto",
        theme_light: "Motyw: Jasny",
        theme_dark: "Motyw: Ciemny",
        input_placeholder: "Wpisz wiadomość...",
        prompt_placeholder: "Wpisz instrukcje dla AI...",
        btn_save: "Zapisz",
        btn_reset: "Reset",
        clear_confirm: "Czy na pewno chcesz wyczyścić historię chatu?",
        error_no_model: "Wybierz model z listy — lista ładuje się automatycznie.",
        error_timeout: "⚠ Brak odpowiedzi od modelu w ciągu 60 sekund.",
        error_empty: "⚠ Model odpowiedział pustą wiadomością.",
        error_conn: "⚠ Błąd połączenia z modelem: "
    },
    en: {
        title: "Wired AI",
        status_checking: "Checking status...",
        status_online: "AI Service Online",
        status_offline: "No Model (Offline)",
        status_no_conn: "Connection Error",
        select_model: "Select model...",
        theme_auto: "Theme: Auto",
        theme_light: "Theme: Light",
        theme_dark: "Theme: Dark",
        input_placeholder: "Type a message...",
        prompt_placeholder: "Type instructions for AI...",
        btn_save: "Save",
        btn_reset: "Reset",
        clear_confirm: "Are you sure you want to clear chat history?",
        error_no_model: "Select a model from the list — it loads automatically.",
        error_timeout: "⚠ No response from model within 60 seconds.",
        error_empty: "⚠ Model returned an empty message.",
        error_conn: "⚠ Connection error: "
    }
};

// Configure Marked.js
marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
});

// Start up
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initLang();
    init();
    initModals();
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

function initLang() {
    langPlBtn.onclick = () => setLang('pl');
    langEnBtn.onclick = () => setLang('en');
    applyTranslations();
}

function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('wired-ai-lang', lang);
    applyTranslations();
}

function applyTranslations() {
    const t = translations[currentLang];
    const elAppTitle = document.getElementById('app-title');
    const elOptSelectModel = document.getElementById('opt-select-model');
    const elOptThemeAuto = document.getElementById('opt-theme-auto');
    const elOptThemeLight = document.getElementById('opt-theme-light');
    const elOptThemeDark = document.getElementById('opt-theme-dark');
    
    if (elAppTitle) elAppTitle.textContent = t.title;
    if (elOptSelectModel) elOptSelectModel.textContent = t.select_model;
    if (elOptThemeAuto) elOptThemeAuto.textContent = t.theme_auto;
    if (elOptThemeLight) elOptThemeLight.textContent = t.theme_light;
    if (elOptThemeDark) elOptThemeDark.textContent = t.theme_dark;
    
    if (messageInput) messageInput.placeholder = t.input_placeholder;
    if (systemPromptInput) systemPromptInput.placeholder = t.prompt_placeholder;
    if (savePromptBtn) savePromptBtn.textContent = t.btn_save;
    if (resetPromptBtn) resetPromptBtn.textContent = t.btn_reset;
    
    if (langPlBtn) langPlBtn.classList.toggle('active', currentLang === 'pl');
    if (langEnBtn) langEnBtn.classList.toggle('active', currentLang === 'en');
    
    pollStatus();
}

function initModals() {
    systemPromptBtn.onclick = () => {
        systemPromptInput.value = systemPrompt;
        systemPromptModal.style.display = 'flex';
    };
    closeModalBtn.onclick = () => systemPromptModal.style.display = 'none';
    window.onclick = (e) => { if(e.target == systemPromptModal) systemPromptModal.style.display = 'none'; };
    
    savePromptBtn.onclick = () => {
        systemPrompt = systemPromptInput.value;
        localStorage.setItem('wired-ai-system-prompt', systemPrompt);
        systemPromptModal.style.display = 'none';
    };
    
    resetPromptBtn.onclick = () => {
        systemPrompt = translations[currentLang === 'pl' ? 'pl' : 'en'].title === "Wired AI" ? "You are a helpful AI assistant called Wired AI. Respond concisely and professionally." : "";
        systemPromptInput.value = systemPrompt;
    };
}

function initTheme() {
    const saved = localStorage.getItem('wired-ai-theme') || 'auto';
    themeSelector.value = saved;
    document.documentElement.setAttribute('data-theme', saved);

    themeSelector.addEventListener('change', (e) => {
        const val = e.target.value;
        document.documentElement.setAttribute('data-theme', val);
        localStorage.setItem('wired-ai-theme', val);
    });
}

async function init() {
    if (authToken) {
        const isValid = await verifyToken(authToken);
        if (isValid) {
            showApp();
        } else {
            showLogin(true);
        }
    } else {
        const req = await fetch('/auth/verify', { method: 'POST', headers: {'Content-Type': 'application/json'} });
        const res = await req.json();
        if (res.success && res.message === "No password required") {
            showApp();
        } else {
            showLogin(false);
        }
    }
}

function showLogin(isError) {
    loginOverlay.classList.remove('hidden');
    appContainer.classList.add('hidden');
    if (isError) loginError.classList.remove('hidden');
}

function showApp() {
    loginOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
    
    fetchModels();
    renderHistory();
    scrollToBottom();
    
    if (refreshModelsBtn) {
        refreshModelsBtn.onclick = () => fetchModels();
    }
    
    // Start polling status every 15s
    pollStatus();
    setInterval(pollStatus, 15000);
}

// Polling status from backend
async function pollStatus() {
    const t = translations[currentLang];
    try {
        const req = await fetch('/api/status', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const res = await req.json();
        if(res.status === 'online') {
            statusDot.className = 'status-dot online';
            statusText.textContent = t.status_online;
        } else {
            statusDot.className = 'status-dot offline';
            statusText.textContent = t.status_offline;
        }
    } catch(e) {
        statusDot.className = 'status-dot offline';
        statusText.textContent = t.status_no_conn;
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const pwd = document.getElementById('password-input').value;
    
    const isValid = await verifyToken(pwd);
    if (isValid) {
        authToken = pwd;
        localStorage.setItem('wired-ai-auth', pwd);
        showApp();
    } else {
        loginError.classList.remove('hidden');
    }
});

async function verifyToken(token) {
    try {
        const res = await fetch('/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: token })
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

let modelRetryTimer = null;

async function fetchModels(isRetry = false) {
    // Reset UI
    while(modelSelector.options.length > 1) modelSelector.remove(1);

    const loadingOpt = document.createElement('option');
    loadingOpt.value = '';
    loadingOpt.textContent = isRetry ? 'Ponawiam...' : 'Ładowanie modeli...';
    loadingOpt.disabled = true;
    modelSelector.appendChild(loadingOpt);
    modelSelector.selectedIndex = 1;

    try {
        const res = await fetch('/api/v1/models', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        console.log('[fetchModels] HTTP status:', res.status);
        while(modelSelector.options.length > 1) modelSelector.remove(1);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        console.log('[fetchModels] Response:', JSON.stringify(data));

        // Obsługa różnych formatów API: OpenAI, Ollama, LM Studio
        let models = [];
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            models = data.data.map(m => m.id || m.model_id || m.name || String(m)).filter(Boolean);
        } else if (data.models && Array.isArray(data.models) && data.models.length > 0) {
            models = data.models.map(m => m.name || m.id || String(m)).filter(Boolean);
        } else if (Array.isArray(data) && data.length > 0) {
            models = data.map(m => (typeof m === 'string' ? m : m.id || m.name || String(m))).filter(Boolean);
        }

        if (models.length > 0) {
            if (modelRetryTimer) { clearInterval(modelRetryTimer); modelRetryTimer = null; }
            models.forEach(modelId => {
                const opt = document.createElement('option');
                opt.value = modelId;
                opt.textContent = modelId;
                modelSelector.appendChild(opt);
            });
            modelSelector.selectedIndex = 1;
        } else {
            scheduleModelRetry();
        }
    } catch(e) {
        while(modelSelector.options.length > 1) modelSelector.remove(1);
        console.error('[fetchModels] Błąd:', e);
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = `Błąd połączenia — ponawiam...`;
        opt.disabled = true;
        modelSelector.appendChild(opt);
        modelSelector.selectedIndex = 1;
        scheduleModelRetry();
    }
}

function scheduleModelRetry() {
    if (modelRetryTimer) return; // already scheduled
    modelRetryTimer = setInterval(() => fetchModels(true), 5000);
}

function getSelectedModel() {
    return modelSelector.value;
}

function renderHistory() {
    messagesContainer.innerHTML = '';
    chatHistory.forEach(msg => {
        appendMessageUI(msg.role, msg.content, true);
    });
}

function createCopyButton(textToCopy) {
    const btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.innerHTML = `<svg width="18" height="18" fill="currentColor"><use href="#icon-copy"></use></svg>`;
    btn.onclick = () => {
        navigator.clipboard.writeText(textToCopy).then(() => {
            btn.innerHTML = `<svg width="18" height="18" fill="currentColor"><use href="#icon-check"></use></svg>`;
            btn.classList.add('copied');
            setTimeout(() => {
                btn.innerHTML = `<svg width="18" height="18" fill="currentColor"><use href="#icon-copy"></use></svg>`;
                btn.classList.remove('copied');
            }, 2000);
        });
    };
    
    const wrapper = document.createElement('div');
    wrapper.className = 'copy-wrapper';
    wrapper.appendChild(btn);
    return wrapper;
}

function appendMessageUI(role, content, fromHistory = false, isError = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message-box message-${role === 'user' ? 'user' : 'ai'} ${isError ? 'message-error' : ''}`;
    
    const textDiv = document.createElement('div');
    textDiv.className = 'message-content';
    
    if (isError) {
        textDiv.innerHTML = `<svg width="18" height="18" fill="currentColor" style="flex-shrink:0" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z"></path></svg> <span>${content}</span>`;
    } else if (role === 'ai' || role === 'assistant') {
        textDiv.innerHTML = marked.parse(content);
    } else {
        textDiv.textContent = content;
    }
    
    msgDiv.appendChild(textDiv);
    
    if (!isError) {
        msgDiv.appendChild(createCopyButton(content));
    }
    
    messagesContainer.appendChild(msgDiv);
    if(!fromHistory) scrollToBottom();
    
    return {
        updateContent: (newText) => {
            if (role === 'ai' || role === 'assistant') {
                textDiv.innerHTML = marked.parse(newText);
            } else {
                textDiv.textContent = newText;
            }
            const copyBtn = msgDiv.querySelector('.copy-wrapper');
            if (copyBtn) copyBtn.replaceWith(createCopyButton(newText));
            scrollToBottom();
        }
    }
}

function appendErrorBubble(text) {
    return appendMessageUI('assistant', text, false, true);
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

async function sendMessage() {
    const t = translations[currentLang];
    if(isStreaming) return;
    const content = messageInput.value.trim();
    if (!content) return;
    
    const selectedModel = getSelectedModel();
    if(!selectedModel) {
        appendErrorBubble(t.error_no_model);
        return;
    }

    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    chatHistory.push({ role: 'user', content });
    saveHistory();
    appendMessageUI('user', content);
    
    isStreaming = true;
    sendBtn.innerHTML = `<svg width="24" height="24" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm32-88a8,8,0,0,1-8,8H104a8,8,0,0,1,0-16h48A8,8,0,0,1,160,128Z"></path></svg>`;
    
    // Construct payload with System Prompt
    const messagesPayload = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.map(m => ({ role: m.role, content: m.content }))
    ];
    
    const aiMessageCtrl = appendMessageUI('assistant', '...');
    let fullResponse = "";

    const SEND_ICON = `<svg width="24" height="24" fill="currentColor" viewBox="0 0 256 256"><path d="M231.87,114l-168-95.89A16,16,0,0,0,40.92,37.34L71.55,128,40.92,218.67A16,16,0,0,0,56,240a16.15,16.15,0,0,0,7.93-2.1l168-95.89a16,16,0,0,0,0-27.92Zm-15.83,14L48,223.92,76.4,136H136a8,8,0,0,0,0-16H76.4L48,32.08,216.05,128Z"></path></svg>`;

    let streamTimeout = setTimeout(() => {
        if (isStreaming && fullResponse === '') {
            fullResponse = t.error_timeout;
            aiMessageCtrl.updateContent(fullResponse);
            isStreaming = false;
            clearTimeout(streamTimeout);
            sendBtn.innerHTML = SEND_ICON;
        }
    }, 60000);

    try {
        const response = await fetch('/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: messagesPayload,
                stream: true
            })
        });

        if(!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let done = false;
        
        while (!done) {
            const result = await reader.read();
            done = result.done;
            if (result.value) {
                const chunk = decoder.decode(result.value, { stream: !done });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed === 'data: [DONE]' || trimmed === '[DONE]') { done = true; break; }
                    if (trimmed.startsWith('data: ')) {
                        try {
                            const dataObj = JSON.parse(trimmed.slice(6));
                            const textPart = dataObj.choices?.[0]?.delta?.content
                                         ?? dataObj.choices?.[0]?.message?.content
                                         ?? '';
                            if (textPart) {
                                fullResponse += textPart;
                                aiMessageCtrl.updateContent(fullResponse);
                            }
                        } catch(_) {}
                    }
                }
            }
        }

        if (!fullResponse) fullResponse = t.error_empty;

    } catch(err) {
        fullResponse = t.error_conn + err.message;
        aiMessageCtrl.updateContent(fullResponse);
    } finally {
        clearTimeout(streamTimeout);
        chatHistory.push({ role: 'assistant', content: fullResponse });
        saveHistory();
        isStreaming = false;
        sendBtn.innerHTML = SEND_ICON;
    }
}


function saveHistory() {
    localStorage.setItem('wired-ai-history', JSON.stringify(chatHistory));
}

clearBtn.addEventListener('click', () => {
    if(confirm(translations[currentLang].clear_confirm)) {
        chatHistory = [];
        saveHistory();
        messagesContainer.innerHTML = '';
    }
});

exportBtn.addEventListener('click', () => {
    if(chatHistory.length === 0) {
        alert("Historia jest pusta.");
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chatHistory, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `wired-ai-chat-export-${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
});
