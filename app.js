const statusText = document.getElementById('status-text');
const myIdDisplay = document.getElementById('my-id');
const videoGrid = document.getElementById('video-grid');
const chatWindow = document.getElementById('chat-window');
const chatMessageInput = document.getElementById('chat-message-input');
const btnSendChat = document.getElementById('btn-send-chat');

// Configurazione server STUN di Google per mettere in comunicazione i client fuori dalla rete locale
const rtcConfig = { iceServers: [{ urls: 'stun:://google.com' }, { urls: 'stun:://google.com' }] };

let localStream = null;
let myId = null;
let ws = null;
const peerConnections = {};

// Chiediamo i permessi video immediatamente. Firefox aprirà il popup all'istante
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localStream = stream;
        addVideoStream('Tu (Locale)', stream, true);
        initWebSocket();
    })
    .catch(err => {
        console.error('Errore hardware:', err);
        alert('Per partecipare devi necessariamente abilitare i permessi della telecamera e del microfono.');
    });

function initWebSocket() {
    // Adatta automaticamente il WebSocket a seconda se siamo in locale (ws) o sul server protetto (wss)
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(`${protocol}${window.location.host}`);

    ws.onopen = () => {
        statusText.innerText = "Connesso alla Stanza";
        statusText.style.color = "#28a745";
    };

    ws.onmessage = async (message) => {
        const data = JSON.parse(message.data);

        switch (data.type) {
            case 'welcome':
                myId = data.id;
                myIdDisplay.innerText = myId;
                // Chiamiamo automaticamente tutti gli utenti già presenti nella stanza
                data.peers.forEach(peerId => makeCall(peerId));
                break;
            case 'user-joined':
                console.log(`Nuovo peer connesso alla rete: ${data.id}`);
                break;
            case 'offer':
                await handleOffer(data.sender, data.offer);
                break;
            case 'answer':
                await peerConnections[data.sender].setRemoteDescription(new RTCSessionDescription(data.answer));
                break;
            case 'candidate':
                if (peerConnections[data.sender]) {
                    await peerConnections[data.sender].addIceCandidate(new RTCIceCandidate(data.candidate));
                }
                break;
            case 'chat':
                appendMessage(data.sender === myId ? 'Tu' : `Utente (${data.sender.substring(0,4)})`, data.message);
                break;
            case 'user-left':
                removeUser(data.id);
                break;
        }
    };
}

async function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[peerId] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: 'candidate', target: peerId, candidate: event.candidate }));
        }
    };

    pc.ontrack = (event) => {
        addVideoStream(`Utente (${peerId.substring(0,4)})`, event.streams[0], false, peerId);
    };

    return pc;
}

async function makeCall(peerId) {
    const pc = await createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'offer', target: peerId, offer: offer }));
}

async function handleOffer(peerId, offer) {
    const pc = await createPeerConnection(peerId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'answer', target: peerId, answer: answer }));
}

function sendChat() {
    const text = chatMessageInput.value.trim();
    if (!text) return;
    ws.send(JSON.stringify({ type: 'chat', message: text }));
    chatMessageInput.value = '';
}

btnSendChat.addEventListener('click', sendChat);
chatMessageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });

function appendMessage(sender, msg) {
    const m = document.createElement('div');
    m.className = 'chat-message';
    m.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chatWindow.appendChild(m);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addVideoStream(label, stream, isLocal, peerId = null) {
    const streamId = peerId ? `v-${peerId}` : 'v-local';
    if (document.getElementById(streamId)) return;

    const container = document.createElement('div');
    container.className = 'video-container';
    container.id = streamId;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true;

    const divLabel = document.createElement('div');
    divLabel.className = 'video-label';
    divLabel.innerText = label;

    const controls = document.createElement('div');
    controls.className = 'video-controls';

    if (isLocal) {
        const btnAudio = document.createElement('button');
        btnAudio.className = 'ctrl-btn';
        btnAudio.innerText = 'Muto Audio';
        btnAudio.onclick = () => {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
                btnAudio.innerText = track.enabled ? 'Muto Audio' : 'Attiva Audio';
                btnAudio.classList.toggle('disabled', !track.enabled);
            });
        };

        const btnVideo = document.createElement('button');
        btnVideo.className = 'ctrl-btn';
        btnVideo.innerText = 'Stop Video';
        btnVideo.onclick = () => {
            localStream.getVideoTracks().forEach(track => {
                track.enabled = !track.enabled;
                btnVideo.innerText = track.enabled ? 'Stop Video' : 'Avvia Video';
                btnVideo.classList.toggle('disabled', !track.enabled);
            });
        };

        controls.appendChild(btnAudio);
        controls.appendChild(btnVideo);
    }

    container.append(video, divLabel, controls);
    videoGrid.append(container);
}

function removeUser(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    }
    const el = document.getElementById(`v-${peerId}`);
    if (el) el.remove();
}
