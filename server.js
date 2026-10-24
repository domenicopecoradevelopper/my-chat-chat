const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    // Rileva il percorso del file escludendo in modo nativo e sicuro i parametri (?room=...)
    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;
    
    let filePath = pathname === '/' ? './index.html' : `.${pathname}`;
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    if (extname === '.js') contentType = 'text/javascript';
    if (extname === '.css') contentType = 'text/css';

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
    
    // Invia immediatamente l'ID di benvenuto al client
    ws.send(JSON.stringify({ type: 'welcome', id: userId }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        const clientData = clients.get(userId);

        if (data.type === 'join-room') {
            clientData.room = data.room;
            clientData.username = data.username;
            
            console.log(`[Stanza: ${data.room}] Connesso utente: ${data.username} (${userId})`);
            
            const peersInRoom = [];
            clients.forEach((info, id) => {
                if (id !== userId && info.room === data.room) {
                    peersInRoom.push({ id: id, username: info.username });
                    
                    // Avvisa subito gli utenti già presenti della presenza del nuovo arrivato
                    if (info.ws.readyState === 1) {
                        info.ws.send(JSON.stringify({ type: 'user-joined', id: userId, username: clientData.username }));
                    }
                }
            });
            
            // Fornisce la lista dei presenti all'ultimo utente entrato
            ws.send(JSON.stringify({ type: 'room-peers', peers: peersInRoom }));
            return;
        }

        // Smistamento sicuro e mirato dei pacchetti WebRTC (offer, answer, candidate)
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
    console.log(`🚀 Server di segnalazione attivo sulla porta ${PORT}`);
});
