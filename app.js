const roomOverlay = document.getElementById('room-overlay');
const roomInput = document.getElementById('room-input');
const nameInput = document.getElementById('name-input');
const btnEnterRoom = document.getElementById('btn-enter-room');
const btnGenerateRoom = document.getElementById('btn-generate-room');
const roomError = document.getElementById('room-error');
const activeRoomText = document.getElementById('active-room-text');
const myNameText = document.getElementById('my-name-text');
const btnLeave = document.getElementById('btn-leave');
const videoGrid = document.getElementById('video-grid');

const rtcConfig = { iceServers: [{ urls: 'stun:://google.com' }, { urls: 'stun:://google.com' }] };

let localStream = null;
let myId = null;
let ws = null;
let targetRoom = "";
let myUsername = "";
const peerConnections = {};

// Controllo URL per link diretto (es: ?room=codiceStanza)
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) {
    roomInput.value = roomFromUrl;
}

btnGenerateRoom.addEventListener('click', () => {
    roomInput.value = Math.random().toString(36).substring(2, 11);
    roomError.style.display = "none";
});

btnEnterRoom.addEventListener('click', () => {
    const roomCode = roomInput.value.trim().toLowerCase();
    const username = nameInput.value.trim();
    const isAlphanumeric = /^[a-z0-9]+\$/.test(roomCode);
    
    if (!username || roomCode.length < 8 || !isAlphanumeric) {
        roomError.style.display = "block";
        return;
    }
    
    roomError.style.display = "none";
    targetRoom = roomCode;
    myUsername = username;
    
    activeRoomText.innerText = targetRoom;
    myNameText.innerText = myUsername;
    
    // Aggiorna l'URL della barra degli indirizzi per la condivisione tramite copia-incolla
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${targetRoom}`;
    window.history.replaceState({}, '', newUrl);
    
    roomOverlay.style.display = "none";
    avviaApplicazione();
});

function avviaApplicazione() {
    if (localStream) {
        initWebSocket();
    } else {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                localStream = stream;
                addVideoStream(`${myUsername} (Tu)`, stream, true);
                initWebSocket();
            })
            .catch(err => {
                console.error(err);
                alert('Attiva fotocamera e microfono per partecipare.');
                roomOverlay.style.display = "flex";
            });
    }
}

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(`${protocol}${window.location.host}`);

    ws.onmessage = async (message) => {
        const data = JSON.parse(message.data);

        if (data.type === 'welcome') {
            myId = data.id;
            ws.send(JSON.stringify({ type: 'join-room', room: targetRoom, username: myUsername }));
            return;
        }

        switch (data.type) {
            case 'room-peers':
                data.peers.forEach(peer => makeCall(peer.id, peer.username));
                break;
            case 'user-joined':
                console.log(`Utente connesso: ${data.username}`);
                break;
            case 'offer':
                await handleOffer(data.sender, data.username, data.offer);
                break;
            case 'answer':
                if (peerConnections[data.sender]) {
                    await peerConnections[data.sender].setRemoteDescription(new RTCSessionDescription(data.answer));
                }
                break;
            case 'candidate':
                if (peerConnections[data.sender]) {
                    await peerConnections[data.sender].addIceCandidate(new RTCIceCandidate(data.candidate));
                }
                break;
            case 'user-left':
                removeUser(data.id);
                break;
        }
    };
}

// Algoritmo Geometrico Matematico di Calcolo Spazio Finestre (Zoom-Style)
function recalculateLayout() {
    const containers = videoGrid.querySelectorAll('.video-container');
    const count = containers.length;
    if (!count) return;

    const width = videoGrid.clientWidth;
    const height = videoGrid.clientHeight;
    
    let bestWidth = 0;
    let bestHeight = 0;
    let targetAspectRatio = 4 / 3;

    for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        let maxW = Math.floor(width / cols) - 10;
        let maxH = Math.floor(height / rows) - 10;

        if (maxW * (1 / targetAspectRatio) <= maxH) {
            maxH = Math.floor(maxW * (1 / targetAspectRatio));
        } else {
            maxW = Math.floor(maxH * targetAspectRatio);
        }

        if (maxW > bestWidth) {
            bestWidth = maxW;
            bestHeight = maxH;
        }
    }

    containers.forEach(container => {
        container.style.width = `${bestWidth}px`;
        container.style.height = `${bestHeight}px`;
    });
}

window.addEventListener('resize', recalculateLayout);

async function createPeerConnection(peerId, remoteName) {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[peerId] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
        if (event.candidate && ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'candidate', target: peerId, candidate: event.candidate }));
        }
    };

    pc.ontrack = (event) => {
        addVideoStream(remoteName, event.streams[0], false, peerId);
    };

    return pc;
}

async function makeCall(peerId, remoteName) {
    const pc = await createPeerConnection(peerId, remoteName);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'offer', target: peerId, offer: offer, username: myUsername }));
    }
}

async function handleOffer(peerId, remoteName, offer) {
    const pc = await createPeerConnection(peerId, remoteName);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'answer', target: peerId, answer: answer }));
    }
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
    if (isLocal) {
        video.muted = true;
        video.classList.add('local-video');
    }

    const divLabel = document.createElement('div');
    divLabel.className = 'video-label';
    divLabel.innerText = label;

    const controls = document.createElement('div');
    controls.className = 'video-controls';

    if (isLocal) {
        const btnAudio = document.createElement('button');
        btnAudio.className = 'ctrl-btn';
        btnAudio.innerText = 'Muto';
        btnAudio.onclick = () => {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
                btnAudio.innerText = track.enabled ? 'Muto' : 'Sblocca';
                btnAudio.classList.toggle('disabled', !track.enabled);
            });
        };

        const btnVideo = document.createElement('button');
        btnVideo.className = 'ctrl-btn';
        btnVideo.innerText = 'Stop Cam';
        btnVideo.onclick = () => {
            localStream.getVideoTracks().forEach(track => {
                track.enabled = !track.enabled;
                btnVideo.innerText = track.enabled ? 'Stop Cam' : 'Avvia Cam';
                btnVideo.classList.toggle('disabled', !track.enabled);
            });
        };
        controls.append(btnAudio, btnVideo);
    }

    container.append(video, divLabel, controls);
    videoGrid.append(container);
    
    recalculateLayout();
}

function removeUser(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    }
    const el = document.getElementById(`v-${peerId}`);
    if (el) el.remove();
    
    recalculateLayout();
}

btnLeave.addEventListener('click', () => {
    if (ws) { ws.close(); ws = null; }
    for (let peerId in peerConnections) { removeUser(peerId); }
    
    // Rimuove il parametro della stanza dall'URL quando si abbandona la stanza
    window.history.replaceState({}, '', window.location.pathname);
    
    roomOverlay.style.display = "flex";
});
