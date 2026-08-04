import * as storage from './storage.js';

let videoPlayer, youtubePlayer, currentChannels, currentChannel, currentServers, currentServerIndex;
let hls = null, shakaPlayer = null, ytPlayer = null;
let hideControlsTimeout;

export function initPlayer() {
    videoPlayer = document.getElementById('video-player');
    youtubePlayer = document.getElementById('youtube-player');
    
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
    document.getElementById('server-select').addEventListener('change', (e) => playServer(parseInt(e.target.value)));

    // Auto-hide controls logic
    const overlay = document.getElementById('player-overlay');
    overlay.addEventListener('mousemove', showControls);
    overlay.addEventListener('click', showControls);
    overlay.addEventListener('touchstart', showControls);
    
    document.addEventListener('keydown', handlePlayerKeys);
}

function showControls() {
    const overlay = document.getElementById('player-overlay');
    overlay.classList.add('active-controls');
    clearTimeout(hideControlsTimeout);
    hideControlsTimeout = setTimeout(() => {
        overlay.classList.remove('active-controls');
    }, 4000); // Hide after 4 seconds
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
        
        if (!streamData.servers || streamData.servers.length === 0) throw new Error('No servers available');

        currentServers = streamData.servers.sort((a, b) => (a.priority || 99) - (b.priority || 99));
        populateServerDropdown(currentServers);
        
        const lastServerName = storage.getLastServer(channelData.id);
        let startIdx = currentServers.findIndex(s => s.name === lastServerName);
        if (startIdx === -1) startIdx = 0;
        
        playServer(startIdx);
        showControls(); // Start auto-hide timer
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
        if (server.type === 'm3u8') playHLS(server);
        else if (server.type === 'mpd' || server.type === 'dash') playDASH(server);
        else if (server.type === 'youtube') playYouTube(server);
        else throw new Error('Unsupported stream type');
    } catch (e) {
        handleStreamError(e.message);
    }
}

function playHLS(server) {
    if (Hls.isSupported()) {
        hls = new Hls({ maxBufferLength: 30, backBufferLength: 30, enableWorker: true, lowLatencyMode: true });
        hls.loadSource(server.url);
        hls.attachMedia(videoPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { videoPlayer.play(); hideSpinner(); });
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) handleStreamError('HLS Network Error');
                else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                else handleStreamError('HLS Fatal Error');
            }
        });
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.src = server.url;
        videoPlayer.addEventListener('loadedmetadata', () => { videoPlayer.play(); hideSpinner(); });
    } else { handleStreamError('HLS not supported'); }
}

function playDASH(server) {
    if (!shaka.Player.isBrowserSupported()) { handleStreamError('Shaka Player not supported'); return; }
    if (!shakaPlayer) {
        shakaPlayer = new shaka.Player();
        shakaPlayer.attach(videoPlayer);
        shakaPlayer.configure({ streaming: { bufferingGoal: 30, rebufferingGoal: 15, bufferBehind: 30 } });
        shakaPlayer.addEventListener('error', (e) => handleStreamError('DASH Error: ' + (e.detail.message || 'Unknown')));
    }

    const config = { drm: {} };
    if (server.drm) {
        if (server.drm.kid && server.drm.key) config.drm.clearKeys = { [server.drm.kid]: server.drm.key };
        else if (server.drm.type === 'widevine' && server.licenseUrl) config.drm.servers = { 'com.widevine.alpha': server.licenseUrl };
    }
    shakaPlayer.configure(config);

    shakaPlayer.load(server.url).then(() => { videoPlayer.play(); hideSpinner(); })
    .catch((e) => handleStreamError('DASH Load Error: ' + (e.message || 'Failed')));
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
    } else { initYTPlayer(videoId); }
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
    if (currentServerIndex < currentServers.length - 1) playServer(currentServerIndex + 1);
    else showError(message || "Stream failed to load.");
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
    if (shakaPlayer) { shakaPlayer.unload(); shakaPlayer.destroy(); shakaPlayer = null; }
    if (ytPlayer) { try { ytPlayer.destroy(); } catch(e){} ytPlayer = null; }
    videoPlayer.src = '';
}

export function playNextChannel() {
    const idx = currentChannels.findIndex(c => c.id === currentChannel.id);
    loadChannelIntoPlayer(currentChannels[(idx + 1) % currentChannels.length], currentChannels);
}

export function playPrevChannel() {
    const idx = currentChannels.findIndex(c => c.id === currentChannel.id);
    loadChannelIntoPlayer(currentChannels[(idx - 1 + currentChannels.length) % currentChannels.length], currentChannels);
}

function closePlayer() {
    document.getElementById('player-overlay').classList.remove('active');
    destroyPlayers();
}

function togglePlay() { if (videoPlayer.paused) videoPlayer.play(); else videoPlayer.pause(); }
function toggleMute() { videoPlayer.muted = !videoPlayer.muted; }
function toggleFullscreen() {
    if (!document.fullscreenElement) document.getElementById('player-overlay').requestFullscreen();
    else document.exitFullscreen();
}
async function togglePiP() {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (document.pictureInPictureEnabled) await videoPlayer.requestPictureInPicture().catch(()=>{});
}

function handlePlayerKeys(e) {
    const overlay = document.getElementById('player-overlay');
    if (!overlay.classList.contains('active')) return;

    // Re-show controls on any key press
    showControls(); 

    switch(e.key) {
        case 'Escape':
        case 'Back':
            e.preventDefault();
            // If mobile menu is open, close it. Otherwise close player.
            if (document.getElementById('mobile-nav').classList.contains('active')) {
                document.getElementById('mobile-nav').classList.remove('active');
                document.getElementById('overlay-bg').classList.remove('active');
            } else {
                closePlayer();
            }
            break;
        case 'ArrowRight': playNextChannel(); break;
        case 'ArrowLeft': playPrevChannel(); break;
        // Enter/OK only triggers clicks on focused elements. No pause.
        case 'Enter':
        case 'OK':
            if (document.activeElement.classList.contains('focusable')) {
                e.preventDefault();
                document.activeElement.click();
            }
            break;
    }
}
