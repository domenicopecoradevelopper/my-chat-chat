const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Configura Express per servire tutti i file in automatico senza errori di percorso URL
const app = express();
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Map(); // userId -> { ws, room, username }

wss.on('connection', (ws) => {
    const userId = Math.random().toString(36).substring(2, 9);
    clients.set(userId, { ws, room: null, username: null });
    
    // Invia il messaggio iniziale di benvenuto
    ws.send(JSON.stringify({ type: 'welcome', id: userId }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const clientData = clients.get(userId);

            if (data.type === 'join-room') {
                clientData.room = data.room;
                clientData.username = data.username;
                
                console.log(`[Stanza: ${data.room}] Connesso: ${data.username} (${userId})`);
                
                // Cerca ed elenca i partecipanti già dentro
                const peersInRoom = [];
                clients.forEach((info, id) => {
                    if (id !== userId && info.room === data.room) {
                        peersInRoom.push({ id: id, username: info.username });
                        
                        // Notifica immediatamente chi è già nella stanza
                        if (info.ws.readyState === 1) {
                            info.ws.send(JSON.stringify({ type: 'user-joined', id: userId, username: clientData.username }));
                        }
                    }
                });
                
                // Manda la lista all'utente che è appena entrato
                ws.send(JSON.stringify({ type: 'room-peers', peers: peersInRoom }));
                return;
            }

            // Smista in modo sicuro i messaggi WebRTC (offer, answer, candidate)
            if (data.target && clients.has(data.target)) {
                data.sender = userId;
                const targetClient = clients.get(data.target);
                if (targetClient && targetClient.ws.readyState === 1) {
                    targetClient.ws.send(JSON.stringify(data));
                }
            }
        } catch (e) {
            console.error("Errore lettura messaggio:", e);
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
    console.log(`🚀 Server blindato Express+WS attivo sulla porta ${PORT}`);
});
