export function initRemote() {
  document.addEventListener('keydown', handleNavigation);
  
  // Auto focus first element
  setTimeout(() => {
    const firstFocusable = document.querySelector('.focusable');
    if (firstFocusable) firstFocusable.focus();
  }, 500);
}

function handleNavigation(e) {
  // If inside an input, don't hijack arrows
  if (e.target.tagName === 'INPUT') return;
  
  const active = document.activeElement;
  if (!active.classList.contains('focusable')) {
    const first = document.querySelector('.focusable');
    if (first) first.focus();
    return;
  }
  
  const rect = active.getBoundingClientRect();
  let bestElement = null;
  let bestScore = Infinity;
  
  switch (e.key) {
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
      e.preventDefault();
      const focusables = Array.from(document.querySelectorAll('.focusable:not([disabled])'));
      
      focusables.forEach(el => {
        if (el === active) return;
        const r = el.getBoundingClientRect();
        let score = Infinity;
        
        if (e.key === 'ArrowRight' && r.left > rect.left) score = Math.abs(r.top - rect.top) + (r.left - rect.left);
        if (e.key === 'ArrowLeft' && r.left < rect.left) score = Math.abs(r.top - rect.top) + (rect.left - r.left);
        if (e.key === 'ArrowDown' && r.top > rect.top) score = Math.abs(r.left - rect.left) + (r.top - rect.top);
        if (e.key === 'ArrowUp' && r.top < rect.top) score = Math.abs(r.left - rect.left) + (rect.top - r.top);
        
        if (score < bestScore) {
          bestScore = score;
          bestElement = el;
        }
      });
      
      if (bestElement) bestElement.focus();
      break;
      
    case 'Enter':
    case 'OK':
      e.preventDefault();
      active.click();
      break;
      
    case 'Back':
    case 'Escape':
      // Handled in player.js for player, but if on home, do nothing or exit app
      break;
  }
}