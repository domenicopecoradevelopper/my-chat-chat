const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    // Gestione ed isolamento pulito dell'URL ignorando i parametri per link rapidi (?room=...)
    const cleanUrl = req.url.split('?')[0];
    let filePath = cleanUrl === '/' ? './index.html' : `.${cleanUrl}`;
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    if (extname === '.js') contentType = 'text/javascript';

    fs.readFile(filePath, (error, content) => {
        if (error) { res.writeHead(404); res.end('File non trovato'); }
        else { res.writeHead(200, { 'Content-Type': contentType }); res.end(content, 'utf-8'); }
    });
});

const wss = new WebSocketServer({ server });
const clients = new Map(); // userId -> { ws, room, username }

wss.on('connection', (ws) => {
    const userId = Math.random().toString(36).substring(2, 9);
    clients.set(userId, { ws, room: null, username: null });
    
    ws.send(JSON.stringify({ type: 'welcome', id: userId }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        const clientData = clients.get(userId);

        if (data.type === 'join-room') {
            clientData.room = data.room;
            clientData.username = data.username;
            
            const peersInRoom = [];
            clients.forEach((info, id) => {
                if (id !== userId && info.room === data.room) {
                    peersInRoom.push({ id: id, username: info.username });
                    
                    // Notifica istantanea bidirezionale della stanza per agganciare il P2P WebRTC
                    if (info.ws.readyState === 1) {
                        info.ws.send(JSON.stringify({ type: 'user-joined', id: userId, username: clientData.username }));
                    }
                }
            });

            ws.send(JSON.stringify({ type: 'room-peers', peers: peersInRoom }));
            return;
        }

        if (data.target && clients.has(data.target)) {
            data.sender = userId;
            clients.get(data.target).ws.send(JSON.stringify(data));
        }
    });

    ws.on('close', () => {
        const clientData = clients.get(userId);
        clients.delete(userId);
        if (clientData && clientData.room) {
            clients.forEach((info) => {
                if (info.room === clientData.room && info.ws.readyState === 1) {
                    info.ws.send(JSON.stringify({ type: 'user-left', id: userId }));
                }
            });
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server attivo sulla porta ${PORT}`);
});
