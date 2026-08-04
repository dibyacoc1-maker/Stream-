const KEYS = {
  FAV: 'sl_favorites',
  HISTORY: 'sl_history',
  THEME: 'sl_theme',
  LAST_SERVER: 'sl_last_server_',
  SEARCH_HIST: 'sl_search_history'
};

export const getFavorites = () => JSON.parse(localStorage.getItem(KEYS.FAV) || '[]');
export const toggleFavorite = (id) => {
  let favs = getFavorites();
  if (favs.includes(id)) favs = favs.filter(f => f !== id);
  else favs.push(id);
  localStorage.setItem(KEYS.FAV, JSON.stringify(favs));
  return favs.includes(id);
};

export const getHistory = () => JSON.parse(localStorage.getItem(KEYS.HISTORY) || '[]');
export const addToHistory = (id) => {
  let hist = getHistory().filter(h => h !== id);
  hist.unshift(id);
  if (hist.length > 20) hist.pop(); // Keep last 20
  localStorage.setItem(KEYS.HISTORY, JSON.stringify(hist));
};

export const getLastServer = (channelId) => localStorage.getItem(KEYS.LAST_SERVER + channelId);
export const setLastServer = (channelId, serverName) => localStorage.setItem(KEYS.LAST_SERVER + channelId, serverName);

export const getSearchHistory = () => JSON.parse(localStorage.getItem(KEYS.SEARCH_HIST) || '[]');
export const addSearchHistory = (query) => {
  if (!query) return;
  let hist = getSearchHistory().filter(h => h !== query);
  hist.unshift(query);
  if (hist.length > 10) hist.pop();
  localStorage.setItem(KEYS.SEARCH_HIST, JSON.stringify(hist));
};