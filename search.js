import { renderSearchResults } from './app.js';
import * as storage from './storage.js';

let allChannels = [];

export function initSearch() {
    const input = document.getElementById('search-input');
    
    // Changed to absolute path
    fetch('/data/channels.json').then(r => r.json()).then(d => allChannels = d);

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length === 0) return;
        
        const results = allChannels.filter(ch => {
            return ch.name.toLowerCase().includes(query) ||
                   ch.group.toLowerCase().includes(query) ||
                   ch.country.toLowerCase().includes(query) ||
                   ch.language.toLowerCase().includes(query) ||
                   ch.type.toLowerCase().includes(query);
        });
        
        storage.addSearchHistory(query);
        renderSearchResults(results);
    });
}
