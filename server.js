const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const http = require('http');

// Resilient Imports for Branch Two
let pdf, mammoth, xlsx;
try {
    pdf = require('pdf-parse');
    mammoth = require('mammoth');
    xlsx = require('xlsx');
} catch (e) {
    console.error('[Startup Warning]: Document/Data libraries (pdf-parse/mammoth/xlsx) missing. Some features disabled.');
}

const app = express();
const PORT = process.env.PORT || 8090;
const LLM_API_URL = process.env.LLM_HOST || 'http://192.168.15.15:1234'; 
const APP_PASSWORD = process.env.APP_PASSWORD || 'sezam';
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== 'false'; // Domyślnie true, chyba że jawnio powiesz 'false'

app.use(cors());

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Simple Authorization Middleware
const authMiddleware = (req, res, next) => {
    if (!REQUIRE_AUTH || !APP_PASSWORD) return next();

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader === `Bearer ${APP_PASSWORD}`) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized. Invalid password." });
    }
};

// Protect API routes
app.use('/api', authMiddleware);

// Proxy logic (MUST BE BEFORE express.json() for streaming)
app.use('/api/v1', (req, res, next) => {
    const proxy = createProxyMiddleware({
        target: LLM_API_URL,
        changeOrigin: true,
        pathRewrite: (path, req) => {
            const original = req.originalUrl.split('?')[0];
            // Dla modeli chcemy natywną odpowiedź LM Studio (z loaded_instances)
            if (original === '/api/v1/models') {
                console.log(`[Proxy] NATIVE: ${original} -> ${original}`);
                return original;
            }
            // Dla czatu i pozostałych, używamy standardowego /v1
            const finalPath = original.replace('/api/v1', '/v1');
            console.log(`[Proxy] OPENAI: ${original} -> ${finalPath}`);
            return finalPath;
        },
        on: {
            proxyReq: (proxyReq, req, res) => {
                console.log(`[Proxy] Sending ${req.method} to ${LLM_API_URL}${proxyReq.path}`);
                proxyReq.removeHeader('authorization');
            },
            error: (err, req, res) => {
                console.error('[Proxy Error]:', err.message);
                if (!res.headersSent) {
                    res.status(502).json({ error: 'Błąd połączenia z LM Studio lub przekroczenie czasu oczekiwania.' });
                }
            }
        },
        timeout: 600000,      // 10 minut na odpowiedź
        proxyTimeout: 600000 // 10 minut na połączenie
    });
    proxy(req, res, next);
});

// JSON Parsing (ONLY AFTER PROXY to avoid consuming body stream)
app.use(express.json({ limit: '20mb' }));

// --- Document Extraction Endpoint ---
app.post('/api/extract-text', async (req, res) => {
    try {
        const { base64, filename, mimeType } = req.body;
        if (!base64) return res.status(400).json({ error: 'Brak danych pliku' });
        
        const buffer = Buffer.from(base64.split(',')[1], 'base64');
        let extractedText = '';

        // Lazy Loading Libraries for NAS Resilience
        if (mimeType === 'application/pdf') {
            try { pdf = require('pdf-parse'); } catch(e) { throw new Error('Biblioteka pdf-parse jest niedostępna (instalacja trwa).'); }
            const data = await pdf(buffer);
            extractedText = data.text;
        } else if (filename.endsWith('.docx')) {
            try { mammoth = require('mammoth'); } catch(e) { throw new Error('Biblioteka mammoth jest niedostępna (instalacja trwa).'); }
            const result = await mammoth.extractRawText({ buffer: buffer });
            extractedText = result.value;
        } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls') || filename.endsWith('.csv')) {
            try { xlsx = require('xlsx'); } catch(e) { throw new Error('Biblioteka xlsx (Excel) jest niedostępna (instalacja trwa).'); }
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]]; 
            extractedText = xlsx.utils.sheet_to_csv(sheet);
        } else if (mimeType.startsWith('text/') || filename.endsWith('.md') || filename.endsWith('.txt') || filename.endsWith('.json') || filename.endsWith('.xml')) {
            extractedText = buffer.toString('utf8');
        } else {
            return res.status(400).json({ error: 'Nieobsługiwany format dokumentu' });
        }

        res.json({ text: extractedText, filename: filename });
    } catch (err) {
        console.error('[Doc Extraction Error]:', err);
        res.status(500).json({ error: 'Błąd podczas odczytu dokumentu: ' + err.message });
    }
});

app.post('/auth/verify', (req, res) => {
    if (!REQUIRE_AUTH || !APP_PASSWORD) {
        return res.json({ success: true, message: "No password required" });
    }
    const { password } = req.body;
    if (password === APP_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

// Endpoint to check status of LLM backend — uses simple TCP socket, no HTTP edge cases
app.get('/api/status', (req, res) => {
    const urlObj = new URL(LLM_API_URL);
    const host = urlObj.hostname;
    const port = parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80);

    const net = require('net');
    const socket = new net.Socket();
    let done = false;

    socket.setTimeout(3000);

    socket.connect(port, host, () => {
        if (!done) {
            done = true;
            socket.destroy();
            res.json({ status: 'online' });
        }
    });

    socket.on('timeout', () => {
        if (!done) {
            done = true;
            socket.destroy();
            res.json({ status: 'offline', details: 'timeout' });
        }
    });

    socket.on('error', (err) => {
        if (!done) {
            done = true;
            res.json({ status: 'offline', details: err.message });
        }
    });
});


// Endpoint to check status of LLM backend


// Diagnostic Info Endpoint
app.get('/api/info', (req, res) => {
    // Basic auth check if password exists
    const authHeader = req.headers['authorization'];
    if (REQUIRE_AUTH && APP_PASSWORD && authHeader !== `Bearer ${APP_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const libs = {
        pdf: !!pdf,
        docx: !!mammoth,
        xlsx: !!xlsx
    };

    // Also check resolve as fallback
    try { if(!libs.pdf) { require.resolve('pdf-parse'); libs.pdf = 'reload_required'; } } catch(e){}
    try { if(!libs.docx) { require.resolve('mammoth'); libs.docx = 'reload_required'; } } catch(e){}
    try { if(!libs.xlsx) { require.resolve('xlsx'); libs.xlsx = 'reload_required'; } } catch(e){}

    res.json({
        status: 'online',
        libraries: libs,
        node_version: process.version,
        platform: process.platform,
        uptime: process.uptime()
    });
});

app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`>>>> WIRED AI SERVER Z LOGAMI PROXY STARTUJE <<<<`);
    console.log(`     Port: ${PORT}`);
    console.log(`     Target LLM: ${LLM_API_URL}`);
    console.log(`=================================================\n`);
});
