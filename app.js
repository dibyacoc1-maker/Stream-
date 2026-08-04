import { initRemote } from './remote.js';
import { initPlayer, loadChannelIntoPlayer, playNextChannel, playPrevChannel } from './player.js';
import { initSearch } from './search.js';
import * as storage from './storage.js';

let allChannels = [];
let currentView = 'home';

async function init() {
    initRemote();
    initPlayer();
    initSearch();
    
    window.addEventListener('scroll', () => {
        document.getElementById('header').classList.toggle('scrolled', window.scrollY > 50);
    });

    showSkeletons();
    try {
        // Changed to absolute path
        const res = await fetch('/data/channels.json');
        if (!res.ok) throw new Error('Network response was not ok');
        
        allChannels = await res.json();
        renderHome();
    } catch (e) {
        document.getElementById('main-content').innerHTML = `<div class="section"><h2 class="section-title">Failed to load channels.</h2><p style="color:var(--text-secondary)">Make sure you are running this via a server (like Vercel) and not opening the file directly.</p></div>`;
    }
}

function showSkeletons() {
    const main = document.getElementById('main-content');
    let html = `<div class="section"><div class="section-title">Loading...</div><div class="grid">`;
    for(let i=0; i<10; i++) html += `<div class="channel-card skeleton"><div class="channel-logo"></div><div class="skeleton-line"></div><div class="skeleton-line" style="width:50%"></div></div>`;
    html += `</div></div>`;
    main.innerHTML = html;
}

function renderHome() {
    currentView = 'home';
    const main = document.getElementById('main-content');
    const favs = storage.getFavorites();
    
    const featured = allChannels.slice(0, 5);
    const trending = [...allChannels].sort(() => Math.random() - 0.5).slice(0, 10);
    const newChannels = allChannels.slice(3, 8);
    
    let html = '';
    
    if (favs.length > 0) {
        html += renderSection('My Favorites', allChannels.filter(c => favs.includes(c.id)));
    }
    
    html += renderSection('Featured', featured);
    html += renderSection('Trending Now', trending);
    html += renderSection('New Channels', newChannels);
    
    main.innerHTML = html;
    attachCardListeners();
}

function renderFavorites() {
    currentView = 'favorites';
    const main = document.getElementById('main-content');
    const favs = storage.getFavorites();
    const favChannels = allChannels.filter(c => favs.includes(c.id));
    
    if (favChannels.length === 0) {
        main.innerHTML = `<div class="section"><h2 class="section-title">No Favorites Yet</h2><p style="color:var(--text-secondary)">Add channels to favorites by clicking the heart icon.</p></div>`;
        return;
    }
    
    main.innerHTML = renderSection('My Favorites', favChannels);
    attachCardListeners();
}

function renderHistory() {
    currentView = 'history';
    const main = document.getElementById('main-content');
    const history = storage.getHistory();
    const historyChannels = history.map(id => allChannels.find(c => c.id === id)).filter(Boolean);
    
    if (historyChannels.length === 0) {
        main.innerHTML = `<div class="section"><h2 class="section-title">No Watch History</h2></div>`;
        return;
    }
    
    main.innerHTML = renderSection('Continue Watching', historyChannels);
    attachCardListeners();
}

export function renderSearchResults(results) {
    currentView = 'search';
    const main = document.getElementById('main-content');
    if (results.length === 0) {
        main.innerHTML = `<div class="section"><h2 class="section-title">No channels found</h2></div>`;
        return;
    }
    main.innerHTML = renderSection('Search Results', results);
    attachCardListeners();
}

function renderSection(title, channels) {
    let cards = '';
    channels.forEach(ch => {
        const isFav = storage.getFavorites().includes(ch.id);
        cards += `
            <div class="channel-card focusable" tabindex="0" data-channel-id="${ch.id}">
                ${isFav ? '<div class="fav-badge">♥</div>' : ''}
                <img class="channel-logo" src="${ch.logo}" alt="${ch.name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 120%22><rect width=%22200%22 height=%22120%22 fill=%22%23333%22/><text x=%22100%22 y=%2260%22 fill=%22%23999%22 font-family=%22Arial%22 font-size=%2214%22 text-anchor=%22middle%22>StreamLive</text></svg>'">
                <div class="channel-info">
                    <div class="channel-name">${ch.name}</div>
                    <div class="channel-meta">
                        <span>${ch.group}</span>
                        <span>${ch.country}</span>
                    </div>
                </div>
            </div>
        `;
    });
    return `<div class="section"><h2 class="section-title">${title}</h2><div class="grid">${cards}</div></div>`;
}

function attachCardListeners() {
    document.querySelectorAll('.channel-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.getAttribute('data-channel-id');
            const channelData = allChannels.find(c => c.id === id);
            loadChannelIntoPlayer(channelData, allChannels);
        });
    });
}

// Navigation
document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
        const action = el.getAttribute('data-action');
        if (action === 'home') renderHome();
        if (action === 'favorites') renderFavorites();
        if (action === 'history') renderHistory();
    });
});

init();
