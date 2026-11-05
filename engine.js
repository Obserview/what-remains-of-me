/* Game rules are independent of the browser. No DOM or timers here. */
(function (root) {
  const initial = () => ({ phase: 'opening', ghostSeen: false, blessed: false, spoke: false,
    inventory: [], memories: [], repaired: [], 
    lit: false, hidden: false, projection: 0 });
  const progress = s => s.repaired.length * 50;
  function reduce(s, event) {
    const e = typeof event === 'string' ? { type: event } : event;
    if (e.type === 'RESET') return initial();
    const n = { ...s, inventory: [...s.inventory], memories: [...s.memories], repaired: [...s.repaired] };
    const room = s.phase === 'room';
    const take = item => { n.inventory = n.inventory.filter(x => x !== item); };
    switch (e.type) {
      case 'ENTER': if (s.phase !== 'opening') return s; n.phase = 'room'; break;
      case 'ENCOUNTER': if (!room || s.ghostSeen) return s; n.ghostSeen = true; n.phase = 'startled'; break;
      case 'SETTLE': if (s.phase !== 'startled') return s; n.phase = 'room'; break;
      case 'COLLECT': {
        if (!room || !s.ghostSeen || s.inventory.includes(e.item)) return s;
        const valid = (e.item === 'bamboo' && s.memories.includes('album') && !s.repaired.includes('bamboo'))
          || (e.item === 'paper' && s.memories.includes('polaroid') && !s.repaired.includes('paper'));
        if (!valid) return s;
        n.inventory.push(e.item); break;
      }
      case 'LIGHT': if (!room || !s.ghostSeen || s.lit) return s; n.lit = true; n.phase = 'summoning'; break;
      case 'BLESS': if (s.phase !== 'summoning') return s; n.blessed = true; n.phase = 'room'; break;
      case 'TALK': if (!room || !s.blessed) return s; n.spoke = true; break;
      case 'MEMORY': if (!room || !s.spoke || !['album', 'polaroid'].includes(e.id) || s.memories.includes(e.id)) return s; n.memories.push(e.id); break;
      case 'REPAIR':
        if (!room || !s.inventory.includes(e.item) || s.repaired.includes(e.item)) return s;
        if (e.item !== 'bamboo' && !(e.item === 'paper' && s.repaired.includes('bamboo'))) return s;
        take(e.item); n.repaired.push(e.item); break;
      case 'HIDDEN': if (!room || progress(s) !== 100 || s.memories.length !== 2 || s.hidden) return s; n.hidden = true; break;
      case 'PROJECT': if (!room || progress(s) !== 100 || s.memories.length !== 2) return s; n.phase = 'projection'; n.projection = 0; break;
      case 'NEXT_PROJECTION':
        if (s.phase !== 'projection') return s;
        if (s.projection + 1 >= (s.hidden ? 3 : 2)) n.phase = 'ending'; else n.projection++;
        break;
      default: return s;
    }
    return n;
  }
  function createGame(onChange = () => {}) {
    let state = initial();
    return { get state() { return state; }, send(event) {
      const next = reduce(state, event);
      if (next === state) return false;
      const before = state; state = next; onChange(state, before, event); return true;
    } };
  }
  const api = { initial, reduce, progress, createGame };
  root.FutureMeEngine = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
