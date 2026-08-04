import * as storage from './storage.js';

let videoPlayer, youtubePlayer, currentChannels, currentChannel, currentServers, currentServerIndex;
let hls = null, dashPlayer = null, ytPlayer = null;

export function initPlayer() {
    videoPlayer = document.getElementById('video-player');
    youtubePlayer = document.getElementById('youtube-player');
    
    // Controls
    document.getElementById('close-player').addEventListener('click', closePlayer);
    document.getElementById('play-pause-btn').addEventListener('click', togglePlay);
    document.getElementById('mute-btn').addEventListener('click', toggleMute);
    document.getElementById('volume-slider').addEventListener('input', (e) => {
        videoPlayer.volume = e.target.value;
        videoPlayer.muted = e.target.value == 0;
    });
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
    document.getElementById('pip-btn').addEventListener('click', togglePiP);
    document.getElementById('prev-channel-btn').addEventListener('click', () => playPrevChannel());
    document.getElementById('next-channel-btn').addEventListener('click', () => playNextChannel());
    document.getElementById('retry-btn').addEventListener('click', () => playServer(currentServerIndex));
    document.getElementById('server-select').addEventListener('change', (e) => {
        playServer(parseInt(e.target.value));
    });

    // Keyboard shortcuts when player is open
    document.addEventListener('keydown', handlePlayerKeys);
}

export async function loadChannelIntoPlayer(channelData, channelsList) {
    currentChannel = channelData;
    currentChannels = channelsList;
    
    document.getElementById('player-overlay').classList.add('active');
    document.getElementById('player-title').innerText = channelData.name;
    
    storage.addToHistory(channelData.id);
    
    showSpinner();
    document.getElementById('player-error').style.display = 'none';
    document.getElementById('youtube-player').style.display = 'none';
    videoPlayer.style.display = 'block';

    try {
        const res = await fetch(`/api/channel?id=${channelData.id}`);
        if (!res.ok) throw new Error('API Error');
        const streamData = await res.json();
        
        if (!streamData.servers || streamData.servers.length === 0) {
            throw new Error('No servers available');
        }

        currentServers = streamData.servers.sort((a, b) => (a.priority || 99) - (b.priority || 99));
        populateServerDropdown(currentServers);
        
        // Load last used server or priority 1
        const lastServerName = storage.getLastServer(channelData.id);
        let startIdx = currentServers.findIndex(s => s.name === lastServerName);
        if (startIdx === -1) startIdx = 0;
        
        playServer(startIdx);
    } catch (e) {
        showError("Failed to fetch stream data. " + e.message);
    }
}

function populateServerDropdown(servers) {
    const select = document.getElementById('server-select');
    select.innerHTML = '';
    servers.forEach((s, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.innerText = `${s.name} (${s.type})`;
        select.appendChild(opt);
    });
}

function playServer(index) {
    currentServerIndex = index;
    const server = currentServers[index];
    document.getElementById('server-select').value = index;
    storage.setLastServer(currentChannel.id, server.name);
    
    destroyPlayers();
    showSpinner();
    document.getElementById('player-error').style.display = 'none';

    try {
        if (server.type === 'm3u8') {
            playHLS(server);
        } else if (server.type === 'mpd' || server.type === 'dash') { // Added 'dash' alias
            playDASH(server);
        } else if (server.type === 'youtube') {
            playYouTube(server);
        } else {
            throw new Error('Unsupported stream type');
        }
    } catch (e) {
        handleStreamError(e.message);
    }
}

function playHLS(server) {
    if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(server.url);
        hls.attachMedia(videoPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoPlayer.play();
            hideSpinner();
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) handleStreamError('HLS Error: ' + data.details);
        });
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.src = server.url;
        videoPlayer.addEventListener('loadedmetadata', () => { videoPlayer.play(); hideSpinner(); });
    } else {
        handleStreamError('HLS not supported');
    }
}

function playDASH(server) {
    const url = server.url;
    const protData = {};
    
    if (server.drm === 'widevine' && server.licenseUrl) {
        protData['com.widevine.alpha'] = {
            serverURL: server.licenseUrl,
            httpRequestHeaders: server.headers || {}
        };
    } else if (server.kid && server.key) {
        // ClearKey support for DASH
        protData['org.w3.clearkey'] = {
            clearkeys: {
                [server.kid]: server.key
            }
        };
    }

    dashPlayer = dashjs.MediaPlayer().create();
    dashPlayer.updateSettings({ streaming: { buffer: { fastSwitchEnabled: true } } });
    dashPlayer.setProtectionData(protData);
    dashPlayer.initialize(videoPlayer, url, true);
    
    // FIX: Use string event names instead of dashjs.MediaPlayer.events('...')
    dashPlayer.on('streamInitialized', () => {
        hideSpinner();
    });
    
    dashPlayer.on('error', (e) => {
        handleStreamError('DASH Error: ' + (e.error ? e.error.message : 'Unknown error'));
    });
}

function playYouTube(server) {
    let videoId = server.url.split('v=')[1] || server.url.split('/').pop();
    if (!videoId) return handleStreamError('Invalid YouTube URL');

    videoPlayer.style.display = 'none';
    youtubePlayer.style.display = 'block';
    
    if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(tag);
        window.onYouTubeIframeAPIReady = () => initYTPlayer(videoId);
    } else {
        initYTPlayer(videoId);
    }
}

function initYTPlayer(videoId) {
    if (ytPlayer) ytPlayer.destroy();
    ytPlayer = new YT.Player('youtube-player', {
        videoId: videoId,
        events: {
            'onReady': (e) => { e.target.playVideo(); hideSpinner(); },
            'onError': () => handleStreamError('YouTube Playback Error')
        }
    });
}

function handleStreamError(message) {
    console.error(message);
    // Try next server automatically
    if (currentServerIndex < currentServers.length - 1) {
        console.log("Trying next server...");
        playServer(currentServerIndex + 1);
    } else {
        showError(message || "Stream failed to load.");
    }
}

function showError(msg) {
    hideSpinner();
    document.getElementById('error-message').innerText = msg;
    document.getElementById('player-error').style.display = 'flex';
}

function showSpinner() { document.getElementById('player-spinner').style.display = 'block'; }
function hideSpinner() { document.getElementById('player-spinner').style.display = 'none'; }

function destroyPlayers() {
    if (hls) { hls.destroy(); hls = null; }
    if (dashPlayer) { dashPlayer.reset(); dashPlayer = null; }
    if (ytPlayer) { try { ytPlayer.destroy(); } catch(e){} ytPlayer = null; }
    videoPlayer.src = '';
}

export function playNextChannel() {
    const idx = currentChannels.findIndex(c => c.id === currentChannel.id);
    const next = currentChannels[(idx + 1) % currentChannels.length];
    loadChannelIntoPlayer(next, currentChannels);
}

export function playPrevChannel() {
    const idx = currentChannels.findIndex(c => c.id === currentChannel.id);
    const prev = currentChannels[(idx - 1 + currentChannels.length) % currentChannels.length];
    loadChannelIntoPlayer(prev, currentChannels);
}

function closePlayer() {
    document.getElementById('player-overlay').classList.remove('active');
    destroyPlayers();
}

function togglePlay() {
    if (videoPlayer.paused) videoPlayer.play(); else videoPlayer.pause();
}

function toggleMute() {
    videoPlayer.muted = !videoPlayer.muted;
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.getElementById('player-overlay').requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

async function togglePiP() {
    if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
    } else {
        await videoPlayer.requestPictureInPicture();
    }
}

function handlePlayerKeys(e) {
    const overlay = document.getElementById('player-overlay');
    if (!overlay.classList.contains('active')) return;

    switch(e.key) {
        case 'Escape': closePlayer(); break;
        case 'ArrowRight': playNextChannel(); break;
        case 'ArrowLeft': playPrevChannel(); break;
        case 'Enter': 
            if (document.activeElement.classList.contains('focusable')) return;
            togglePlay(); break;
    }
}
