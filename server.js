const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Map();

wss.on('connection', (ws) => {
    const userId = Math.random().toString(36).substring(2, 9);
    clients.set(userId, { ws, room: null, username: null });
    
    ws.send(JSON.stringify({ type: 'welcome', id: userId }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const clientData = clients.get(userId);

            if (data.type === 'join-room') {
                clientData.room = data.room;
                clientData.username = data.username;
                
                console.log(`[STANZA: ${data.room}] Nuovo client registrato: ${data.username}`);
                
                const peersInRoom = [];
                clients.forEach((info, id) => {
                    if (id !== userId && info.room === data.room) {
                        peersInRoom.push({ id: id, username: info.username });
                        
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
                const targetClient = clients.get(data.target);
                if (targetClient && targetClient.ws.readyState === 1) {
                    targetClient.ws.send(JSON.stringify(data));
                }
            }
        } catch (e) {
            console.error("Errore pacchetto:", e);
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
