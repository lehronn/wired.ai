const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const http = require('http');

// Resilient Imports (Prevent Deathloop if modules are missing on NAS)
let pdf_parse, mammoth, xlsx;
try {
    const pdfImport = require('pdf-parse');
    // Handle ESM or CJS exports (some environments return an object with .default)
    pdf_parse = typeof pdfImport === 'function' ? pdfImport : (pdfImport.default || pdfImport);
    mammoth = require('mammoth');
    xlsx = require('xlsx');
} catch (e) {
    console.error('[Startup Warning]: Document libraries missing. Re-run npm install in terminal.');
}

const app = express();
const PORT = process.env.PORT || 8090;
const LLM_API_URL = process.env.LLM_HOST || 'http://192.168.15.15:1234'; 
const APP_PASSWORD = process.env.APP_PASSWORD || 'sezam';
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== 'false'; 

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

// Proxy logic
app.use('/api/v1', (req, res, next) => {
    const proxy = createProxyMiddleware({
        target: LLM_API_URL,
        changeOrigin: true,
        pathRewrite: (path, req) => {
            const original = req.originalUrl.split('?')[0];
            if (original === '/api/v1/models') return original;
            return original.replace('/api/v1', '/v1');
        },
        on: {
            proxyReq: (proxyReq) => proxyReq.removeHeader('authorization'),
            error: (err, req, res) => {
                if (!res.headersSent) res.status(502).json({ error: 'Błąd połączenia z backendem LLM.' });
            }
        },
        timeout: 600000,
        proxyTimeout: 600000
    });
    proxy(req, res, next);
});

app.use(express.json({ limit: '20mb' }));

// --- Document Extraction Endpoint ---
app.post('/api/extract-text', async (req, res) => {
    try {
        const { base64, filename, mimeType } = req.body;
        if (!base64) return res.status(400).json({ error: 'Brak danych pliku' });
        
        const buffer = Buffer.from(base64.split(',')[1], 'base64');
        let extractedText = '';

        if (mimeType === 'application/pdf') {
            if (!pdf_parse) throw new Error('Biblioteka pdf-parse jest niedostępna.');
            const data = await pdf_parse(buffer);
            extractedText = data.text;
        } else if (filename.endsWith('.docx')) {
            if (!mammoth) throw new Error('Biblioteka mammoth jest niedostępna.');
            const result = await mammoth.extractRawText({ buffer: buffer });
            extractedText = result.value;
        } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls') || filename.endsWith('.csv')) {
            if (!xlsx) throw new Error('Biblioteka xlsx (Excel) jest niedostępna.');
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

    res.json({
        status: 'online',
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
