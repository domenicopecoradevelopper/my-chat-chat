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

let localStream = null;
let peer = null;
let targetRoom = "";
let myUsername = "";
const activeCalls = {};

const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) roomInput.value = roomFromUrl;

btnGenerateRoom.addEventListener('click', () => {
    roomInput.value = Math.random().toString(36).substring(2, 11);
    roomError.style.display = "none";
});

btnEnterRoom.addEventListener('click', () => {
    const roomCode = roomInput.value.trim().toLowerCase();
    const username = nameInput.value.trim();
    
    if (!username || roomCode.length < 8 || !/^[a-z0-9]+$/.test(roomCode)) {
        roomError.style.display = "block";
        return;
    }
    
    roomError.style.display = "none";
    targetRoom = roomCode;
    myUsername = username;
    
    activeRoomText.innerText = targetRoom;
    myNameText.innerText = myUsername;
    
    window.history.replaceState({}, '', `${window.location.origin}${window.location.pathname}?room=${targetRoom}`);
    roomOverlay.style.display = "none";
    
    avviaMedia();
});

function avviaMedia() {
    if (localStream) {
        addVideoStream(`${myUsername} (Tu)`, localStream, true);
        connettiPeerCloud();
    } else {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                localStream = stream;
                addVideoStream(`${myUsername} (Tu)`, stream, true);
                connettiPeerCloud();
            })
            .catch(err => {
                console.error(err);
                alert('Attiva fotocamera e microfono per partecipare.');
                roomOverlay.style.display = "flex";
            });
    }
}

function connettiPeerCloud() {
    // Generiamo un ID unico composto da: nomeStanza + separatore + stringaCasuale
    const myUniqueId = `${targetRoom}---${myUsername}---${Math.random().toString(36).substring(2, 6)}`;
    
    peer = new Peer(myUniqueId, {
        debug: 1,
        config: { iceServers: [{ urls: 'stun:://google.com' }, { urls: 'stun:://google.com' }] }
    });

    peer.on('open', (id) => {
        console.log("Connesso al Cloud PeerJS con ID:", id);
        
        // Cerca tutti gli altri client connessi globalmente e filtra quelli nella stessa stanza
        setTimeout(() => {
            peer.listAllPeers((allPeers) => {
                allPeers.forEach(peerId => {
                    if (peerId.startsWith(`${targetRoom}---`) && peerId !== myUniqueId) {
                        const parts = peerId.split('---');
                        const remoteUsername = parts[1];
                        
                        console.log("Chiamata verso l'utente remoto:", remoteUsername);
                        const call = peer.call(peerId, localStream);
                        gestisciFlussoChiamata(call, remoteUsername, peerId);
                    }
                });
            });
        }, 1500); // Ritardo per dare tempo al cloud di registrare la nostra presenza
    });

    // Risposta automatica alle chiamate in entrata
    peer.on('call', (call) => {
        call.answer(localStream);
        const parts = call.peer.split('---');
        const remoteUsername = parts[1];
        console.log("Ricezione chiamata da:", remoteUsername);
        gestisciFlussoChiamata(call, remoteUsername, call.peer);
    });
}

function gestisciFlussoChiamata(call, remoteName, peerId) {
    call.on('stream', (remoteStream) => {
        addVideoStream(remoteName, remoteStream, false, peerId);
        activeCalls[peerId] = call;
    });
    
    call.on('close', () => {
        rimuoviVideoUtente(peerId);
    });
}

function recalculateLayout() {
    const containers = videoGrid.querySelectorAll('.video-container');
    const count = containers.length;
    if (!count) return;
    const width = videoGrid.clientWidth;
    const height = videoGrid.clientHeight;
    let bestWidth = 0, bestHeight = 0, targetAspectRatio = 4 / 3;
    for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        let maxW = Math.floor(width / cols) - 10;
        let maxH = Math.floor(height / rows) - 10;
        if (maxW * (1 / targetAspectRatio) <= maxH) maxH = Math.floor(maxW * (1 / targetAspectRatio));
        else maxW = Math.floor(maxH * targetAspectRatio);
        if (maxW > bestWidth) { bestWidth = maxW; bestHeight = maxH; }
    }
    containers.forEach(c => { c.style.width = `${bestWidth}px`; c.style.height = `${bestHeight}px`; });
}

window.addEventListener('resize', recalculateLayout);

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
    if (isLocal) { video.muted = true; video.classList.add('local-video'); }
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
            localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; btnAudio.innerText = t.enabled ? 'Muto' : 'Sblocca'; btnAudio.classList.toggle('disabled', !t.enabled); });
        };
        const btnVideo = document.createElement('button');
        btnVideo.className = 'ctrl-btn';
        btnVideo.innerText = 'Stop Cam';
        btnVideo.onclick = () => {
            localStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled; btnVideo.innerText = t.enabled ? 'Stop Cam' : 'Avvia Cam'; btnVideo.classList.toggle('disabled', !t.enabled); });
        };
        controls.append(btnAudio, btnVideo);
    }
    container.append(video, divLabel, controls);
    videoGrid.append(container);
    recalculateLayout();
}

function rimuoviVideoUtente(peerId) {
    if (activeCalls[peerId]) {
        activeCalls[peerId].close();
        delete activeCalls[peerId];
    }
    const el = document.getElementById(`v-${peerId}`);
    if (el) el.remove();
    recalculateLayout();
}

btnLeave.addEventListener('click', () => {
    if (peer) { peer.destroy(); peer = null; }
    for (let pId in activeCalls) { rimuoviVideoUtente(pId); }
    videoGrid.innerHTML = '';
    window.history.replaceState({}, '', window.location.pathname);
    roomOverlay.style.display = "flex";
});
