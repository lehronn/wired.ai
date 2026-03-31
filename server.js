const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const http = require('http');

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

app.post('/auth/verify', express.json(), (req, res) => {
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


// Proxy logic
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
                    res.status(502).json({ error: 'Błąd połączenia z LM Studio (backend AI).' });
                }
            }
        }
    });
    proxy(req, res, next);
});


app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`>>>> WIRED AI SERVER Z LOGAMI PROXY STARTUJE <<<<`);
    console.log(`     Port: ${PORT}`);
    console.log(`     Target LLM: ${LLM_API_URL}`);
    console.log(`=================================================\n`);
});
