const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    // Estrae il percorso reale escludendo i parametri di query (?room=...)
    const cleanUrl = req.url.split('?')[0];
    let filePath = cleanUrl === '/' ? './index.html' : `.${cleanUrl}`;
    
    const extname = path.extname(filePath);
    let contentType = 'text/html';
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
const clients = new Map(); // userId -> { ws, room, username }

wss.on('connection', (ws) => {
    const userId = Math.random().toString(36).substring(2, 9);
    clients.set(userId, { ws, room: null, username: null });
    
    // Invia il benvenuto iniziale con il proprio ID temporaneo
    ws.send(JSON.stringify({ type: 'welcome', id: userId }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        const clientData = clients.get(userId);

        if (data.type === 'join-room') {
            clientData.room = data.room;
            clientData.username = data.username;
            
            console.log(`Utente ${clientData.username} (${userId}) entrato nella stanza: ${data.room}`);
            
            const peersInRoom = [];
            clients.forEach((info, id) => {
                if (id !== userId && info.room === data.room) {
                    // Raccoglie gli utenti già presenti per inviarli al nuovo arrivato
                    peersInRoom.push({ id: id, username: info.username });
                    
                    // Avvisa IMMEDIATAMENTE chi era già dentro della presenza del nuovo utente
                    if (info.ws.readyState === 1) {
                        info.ws.send(JSON.stringify({ type: 'user-joined', id: userId, username: clientData.username }));
                    }
                }
            });
            
            // Invia la lista al nuovo arrivato
            ws.send(JSON.stringify({ type: 'room-peers', peers: peersInRoom }));
            return;
        }

        // Smistamento dei messaggi di negoziazione video (offer, answer, candidate)
        if (data.target && clients.has(data.target)) {
            data.sender = userId;
            const targetClient = clients.get(data.target);
            if (targetClient && targetClient.ws.readyState === 1) {
                targetClient.ws.send(JSON.stringify(data));
            }
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
