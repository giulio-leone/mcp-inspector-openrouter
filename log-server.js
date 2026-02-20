const http = require('http');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'debug.log');

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    if (req.method === 'POST' && req.url === '/log') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const logLine = `[${new Date().toISOString()}] [${data.type}] ${JSON.stringify(data.payload, null, 2)}\n\n`;
                fs.appendFileSync(LOG_FILE, logLine);
                console.log(`Logged: ${data.type}`);
                res.writeHead(200);
                res.end('OK');
            } catch (e) {
                console.error('Failed to parse log:', e);
                res.writeHead(400);
                res.end('Bad Request');
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(3005, () => {
    console.log('Log server listening on port 3005. Appending to debug.log...');
});
