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
const myIdDisplay = document.getElementById('my-id');

const rtcConfig = { 
    iceServers: [
        { urls: 'stun:://google.com' },
        { urls: 'stun:://google.com' },
        { urls: 'stun:openrelay.metered.ca:80' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', password: 'openrelayproject' }
    ] 
};

let localStream = null;
let myId = null;
let ws = null;
let targetRoom = "";
let myUsername = "";

const peerConnections = {};
const iceCandidatesQueue = {};

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
    avviaApplicazione();
});

function avviaApplicazione() {
    if (localStream) {
        addVideoStream(`${myUsername} (Tu)`, localStream, true);
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
                alert('Attiva fotocamera e microfono.');
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
            myIdDisplay.innerText = myId;
            ws.send(JSON.stringify({ type: 'join-room', room: targetRoom, username: myUsername }));
            return;
        }
        switch (data.type) {
            case 'room-peers':
                data.peers.forEach(p => createPeerConnection(p.id, p.username, true));
                break;
            case 'user-joined':
                createPeerConnection(data.id, data.username, false);
                break;
            case 'offer':
                await handleOffer(data.sender, data.username, data.offer);
                break;
            case 'answer':
                if (peerConnections[data.sender]) await peerConnections[data.sender].setRemoteDescription(new RTCSessionDescription(data.answer));
                processQueue(data.sender);
                break;
            case 'candidate':
                await handleCandidate(data.sender, data.candidate);
                break;
            case 'user-left':
                removeUser(data.id);
                break;
        }
    };
}

async function createPeerConnection(peerId, remoteName, isInitiator) {
    if (peerConnections[peerId]) return peerConnections[peerId];
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[peerId] = pc;
    iceCandidatesQueue[peerId] = [];
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.onicecandidate = (e) => {
        if (e.candidate && ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'candidate', target: peerId, candidate: e.candidate }));
        }
    };
    pc.ontrack = (e) => {
        if (e.streams && e.streams[0]) addVideoStream(remoteName, e.streams[0], false, peerId);
    };
    pc.onnegotiationneeded = async () => {
        if (isInitiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', target: peerId, offer: offer, username: myUsername }));
        }
    };
    return pc;
}

async function handleOffer(peerId, remoteName, offer) {
    const pc = await createPeerConnection(peerId, remoteName, false);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'answer', target: peerId, answer: answer }));
    processQueue(peerId);
}

async function handleCandidate(peerId, candidate) {
    const pc = peerConnections[peerId];
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.error(e); }
    } else {
        if (!iceCandidatesQueue[peerId]) iceCandidatesQueue[peerId] = [];
        iceCandidatesQueue[peerId].push(candidate);
    }
}

function processQueue(peerId) {
    const pc = peerConnections[peerId];
    const queue = iceCandidatesQueue[peerId];
    if (pc && pc.remoteDescription && pc.remoteDescription.type && queue) {
        while (queue.length > 0) {
            pc.addIceCandidate(new RTCIceCandidate(queue.shift())).catch(e => console.error(e));
        }
    }
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

function removeUser(peerId) {
    if (peerConnections[peerId]) { peerConnections[peerId].close(); delete peerConnections[peerId]; }
    if (iceCandidatesQueue[peerId]) delete iceCandidatesQueue[peerId];
    const el = document.getElementById(`v-${peerId}`);
    if (el) el.remove();
    recalculateLayout();
}

btnLeave.addEventListener('click', () => {
    if (ws) { ws.close(); ws = null; }
    for (let pId in peerConnections) removeUser(pId);
    videoGrid.innerHTML = '';
    myIdDisplay.innerText = '-';
    activeRoomText.innerText = '-';
    window.history.replaceState({}, '', window.location.pathname);
    roomOverlay.style.display = "flex";
});
