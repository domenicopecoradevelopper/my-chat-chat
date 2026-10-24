const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
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
const rooms = new Map(); // roomName -> Map(userId -> { ws, username })

wss.on('connection', (ws) => {
    let currentRoom = null;
    let myUserId = Math.random().toString(36).substring(2, 9);

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'join-room') {
            currentRoom = data.room;
            if (!rooms.has(currentRoom)) {
                rooms.set(currentRoom, new Map());
            }
            
            const roomClients = rooms.get(currentRoom);
            
            // Invia al nuovo arrivato la lista di chi è GIÀ presente nella stanza
            const peersInRoom = [];
            roomClients.forEach((info, id) => {
                peersInRoom.push({ id: id, username: info.username });
            });
            ws.send(JSON.stringify({ type: 'room-peers', peers: peersInRoom, myId: myUserId }));

            // Salva il nuovo utente nella stanza
            roomClients.set(myUserId, { ws, username: data.username });

            // Avvisa TUTTI gli altri utenti già presenti che è entrato qualcuno
            roomClients.forEach((info, id) => {
                if (id !== myUserId && info.ws.readyState === 1) {
                    info.ws.send(JSON.stringify({ type: 'user-joined', id: myUserId, username: data.username }));
                }
            });
            return;
        }

        // Smistamento dei messaggi di rete WebRTC (Offer, Answer, Candidates)
        if (currentRoom && rooms.has(currentRoom)) {
            const roomClients = rooms.get(currentRoom);
            if (data.target && roomClients.has(data.target)) {
                data.sender = myUserId;
                const targetWs = roomClients.get(data.target).ws;
                if (targetWs.readyState === 1) {
                    targetWs.send(JSON.stringify(data));
                }
            }
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms.has(currentRoom)) {
            const roomClients = rooms.get(currentRoom);
            roomClients.delete(myUserId);
            
            // Avvisa i rimasti che l'utente è uscito
            roomClients.forEach((info) => {
                if (info.ws.readyState === 1) {
                    info.ws.send(JSON.stringify({ type: 'user-left', id: myUserId }));
                }
            });

            if (roomClients.size === 0) {
                rooms.delete(currentRoom);
            }
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server attivo sulla porta ${PORT}`);
});
