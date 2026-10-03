const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Legge la porta assegnata dall'hosting gratuito o usa la 3000 per i test in locale
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? './index.html' : `.${req.url}`;
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    if (extname === '.css') contentType = 'text/css';
    if (extname === '.js') contentType = 'text/javascript';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404);
            res.end('File non trovato');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const wss = new WebSocketServer({ server });
const clients = new Map();

wss.on('connection', (ws) => {
    const userId = Math.random().toString(36).substring(2, 9);
    clients.set(userId, ws);
    
    // Invia al nuovo utente il suo ID e la lista degli altri già connessi
    ws.send(JSON.stringify({ type: 'welcome', id: userId, peers: Array.from(clients.keys()).filter(id => id !== userId) }));
    broadcast({ type: 'user-joined', id: userId }, userId);

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.target && clients.has(data.target)) {
            data.sender = userId;
            clients.get(data.target).send(JSON.stringify(data));
        } else if (data.type === 'chat') {
            data.sender = userId;
            broadcast(data);
        }
    });

    ws.on('close', () => {
        clients.delete(userId);
        broadcast({ type: 'user-left', id: userId });
    });
});

function broadcast(data, excludeUserId = null) {
    const payload = JSON.stringify(data);
    clients.forEach((ws, id) => {
        if (id !== excludeUserId && ws.readyState === 1) {
            ws.send(payload);
        }
    });
}

// Configura il server per ascoltare su tutte le interfacce di rete (0.0.0.0) come richiesto da Render/Railway
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server in esecuzione sulla porta ${PORT}`);
});
