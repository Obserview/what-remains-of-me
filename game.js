(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = window.FutureMeContent;
  const E = window.FutureMeEngine;
  let lang = 'en', ready = false, panelType = null, selected = null, dialogue = null, introVisible = true;
  let dialogueIndex = 0, dialogueDone = null, focusBefore = null, drag = null, suppressClick = false;
  const timers = new Set();
  const t = key => C.text[key]?.[lang === 'en' ? 0 : 1] || key;
  const src = key => 'assets/v2/' + encodeURIComponent(C.assets[key]);
  const img = (key, cls = '') => `<img src="${src(key)}" alt="${t(key)}" class="${cls}" draggable="false">`;
  const button = (action, label, disabled = false) => `<button data-action="${action}" ${disabled ? 'disabled' : ''}>${t(label)}</button>`;
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  const game = E.createGame((s, previous, event) => {
    render();
    document.dispatchEvent(new CustomEvent('futureme:statechange', { detail: { state: s, previous, event } }));
  });
  const state = () => game.state;
  let idleTimer;
  function blockSceneDuringChat(active) {
    for (const selector of ['.topbar','#stage','#hud','#objective','#inventory']) {
      const element=document.querySelector(selector); if(element) element.inert=active;
    }
  }

  function toast(key) {
    $('toast').textContent = t(key); $('toast').hidden = false;
    later(() => { $('toast').hidden = true; }, 2800);
    if ($('panel').open) $('panel-status').textContent = t(key);
  }
  function texts() {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.querySelectorAll('[data-text]').forEach(el => el.textContent = t(el.dataset.text));
    document.querySelectorAll('[data-asset]').forEach(el => el.src = src(el.dataset.asset));
    $('language').textContent = lang === 'en' ? '中文' : 'EN';
  }
  function render() {
    const s = state();
    texts();
    $('stage').dataset.phase = s.phase;
    $('intro').hidden = !(s.phase === 'opening' && introVisible);
    $('opening').hidden = s.phase !== 'opening' || introVisible;
    $('room').hidden = s.phase === 'opening';
    $('hud').hidden = ['opening','projection','ending'].includes(s.phase);
    $('inventory').hidden = s.phase === 'opening' || ['projection','ending'].includes(s.phase);
    $('ghost').hidden = !s.ghostSeen;
    $('ancestor').hidden = !s.lit;
    $('ancestor').classList.toggle('blessing', s.blessed);
    $('ancestor-pose').src = src(s.blessed ? 'ancestorRaise' : 'ancestor');
    $('staff-reveal').hidden = s.phase !== 'summoning';
    $('room-smoke').hidden = !s.lit;
    $('descendant').classList.toggle('blessed', s.blessed);
    $('descendant').classList.toggle('ritual-pose', panelType === 'ritual' || s.phase === 'summoning');
    $('descendant').classList.toggle('jump', s.phase === 'startled');
    $('stage').classList.toggle('shake', s.phase === 'startled');
    const pose = s.phase === 'startled' ? 'scared' : (panelType === 'ritual' || s.phase === 'summoning') ? 'praying' : 'idle';
    $('pose').src = src(pose);
    $('pose').alt = t('descendant') + ' · ' + pose;
    $('progress-text').textContent = E.progress(s) + '%';
    $('progress').value = E.progress(s);
    $('lantern-image').src = src(s.phase === 'projection' || s.phase === 'ending' ? 'light' : E.progress(s) === 100 ? 'fixed' : 'broken');
    $('lantern').querySelector('.green').hidden = !s.memories.includes('album');
    $('lantern').querySelector('.pink').hidden = !s.memories.includes('polaroid');
    for (const key of ['album','polaroid']) {
      $('slot-' + key).classList.toggle('found', s.memories.includes(key));
      $('slot-' + key).setAttribute('aria-label', t(key));
      $('slot-' + key).textContent = s.memories.includes(key) ? '✦' : key === 'album' ? '01' : '02';
    }
    $('slot-hidden').classList.toggle('found', s.hidden);
    $('slot-hidden').textContent = s.hidden ? '✦' : '???';
    $('portrait').classList.toggle('ready', E.progress(s) === 100 && !s.hidden);
    let goal = !s.ghostSeen ? 'goalExplore' : !s.blessed ? 'goalRitual' : !s.spoke ? 'goalTalk' : s.memories.length < 2 ? 'goalMemory' : E.progress(s) < 100 ? 'goalRepair' : 'goalReady';
    $('objective').textContent = s.phase === 'opening' ? t('outside') : ['projection','ending'].includes(s.phase) ? '' : t(goal);
    $('objective').hidden = ['opening','projection','ending'].includes(s.phase);
    $('inventory-items').innerHTML = inventoryMarkup(s.inventory) || `<span class="empty-bag">${t('emptyBag')}</span>`;
    $('projection').hidden = s.phase !== 'projection';
    $('ending').hidden = s.phase !== 'ending';
    if (s.phase === 'projection') renderProjection();
    if (s.phase === 'ending') $('ending-label').textContent = t(s.hidden ? 'hiddenEnd' : 'basicEnd');
    if (panelType && $('panel').open) renderPanel();
    if (dialogue) renderDialogue();
  }
  function inventoryMarkup(items) {
    return items.map(item => `<button class="item-card ${selected === item ? 'selected' : ''}" data-item="${item}" aria-label="${t(item)}" aria-pressed="${selected === item}">${img(item)}<span>${t(item)}</span></button>`).join('');
  }
  function speak(lines, done = () => {}) {
    closePanel();
    focusBefore = document.activeElement;
    dialogue = lines; dialogueIndex = 0; dialogueDone = done;
    $('dialogue').hidden = false; blockSceneDuringChat(true);
    renderDialogue(); $('dialogue-next').focus({ preventScroll: true });
  }
  function renderDialogue() {
    const line = dialogue[dialogueIndex];
    $('dialogue-speaker').textContent = t(line.speaker || 'descendant');
    $('dialogue-line').textContent = t(line.key);
    const speaker = line.speaker || 'descendant';
    $('dialogue').dataset.speaker = speaker;
    $('dialogue').dataset.phase = state().phase;
    const portrait = speaker === 'ghostName' ? 'ghost' : speaker === 'ancestor' || speaker === 'inscription' ? 'ancestor' : speaker === 'sisterName' ? 'sisterPortrait' : 'idle';
    $('dialogue-portrait').src = src(portrait); $('dialogue-portrait').alt = t(speaker);
    $('dialogue-portrait').className = portrait === 'sisterPortrait' ? 'green-sister' : '';
    const pair = line.key === 'hidden1' || line.key === 'hidden2';
    $('dialogue-companion').hidden = !pair;
    if (pair) $('dialogue-companion').src = src('clay');
    $('dialogue-art').hidden = !line.art;
    if (line.art) $('dialogue-art').src = src(line.art);
    $('dialogue-art').className = line.art === 'sister' ? 'dialogue-memory-art soothe' : 'dialogue-memory-art';
    $('dialogue-next').textContent = t(line.next || 'next');
  }
  $('dialogue-next').addEventListener('click', () => {
    if (!dialogue) return;
    if (++dialogueIndex < dialogue.length) renderDialogue();
    else {
      const done = dialogueDone;
      dialogue = null; dialogueDone = null; $('dialogue').hidden = true; blockSceneDuringChat(false);
      if (focusBefore?.isConnected) focusBefore.focus({ preventScroll: true });
      done();
    }
  });
  $('dialogue').addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); $('dialogue-next').focus(); }
  });
  function start() {
    clearTimers(); closePanel(); dialogue = null; $('dialogue').hidden = true; blockSceneDuringChat(false);
    selected = null; $('toast').hidden = true; $('reward-light').hidden = true;
    introVisible = true; game.send('RESET'); render(); resetIdle();
  }
  function beginOpening() {
    introVisible = false; render();
    speak([{ key:'opening0' }, { key:'opening1' }, { key:'opening2', next:'enter' }], () => { game.send('ENTER'); resetIdle(); });
  }
  $('intro-start').addEventListener('click', beginOpening);
  function closePanel() {
    if ($('panel').open) $('panel').close();
    panelType = null; selected = null;
  }
  function openPanel(type) {
    if (!ready || dialogue || ['startled','summoning','projection','ending'].includes(state().phase)) return;
    panelType = type; selected = null; renderPanel();
    if (!$('panel').open) $('panel').showModal();
    render();
  }
  $('panel-close').addEventListener('click', () => { closePanel(); render(); });
  $('panel').addEventListener('cancel', e => {
    if (state().phase === 'summoning') { e.preventDefault(); return; }
    panelType = null; selected = null; later(render, 0);
  });
  function renderPanel() {
    const s = state();
    $('panel-close').disabled = s.phase === 'summoning';
    $('panel-status').textContent = '';
    let title = '', html = '', items = [];
    if (panelType === 'cabinet' || panelType === 'shelf') {
      const cabinet = panelType === 'cabinet';
      const memory = cabinet ? 'album' : 'polaroid', material = cabinet ? 'bamboo' : 'paper';
      title = t(cabinet ? 'cabinet' : 'shelf');
      html = `<div class="inspect-layout">${img(memory,'inspect-art')}<div><p class="panel-description">${t(cabinet ? 'cabinetDesc' : 'shelfDesc')}</p><div class="panel-actions">${button('memory-' + memory, cabinet ? 'viewAlbum' : 'viewPolaroid', !s.spoke)}`;
      if (s.memories.includes(memory) && !s.inventory.includes(material) && !s.repaired.includes(material)) html += button('take-' + material, cabinet ? 'takeBamboo' : 'takePaper');
      html += `</div>${!s.spoke ? `<p class="helper">${t('notYet')}</p>` : ''}</div></div>`;
    } else if (panelType === 'ritual') {
      title = t('altar');
      html = `<p class="panel-description">${t('altarIntro')}</p><div class="ritual-stage"><div class="tablet-placeholder" aria-label="Ancestral tablet"></div><div class="table-placeholder"></div><img class="static-fruit" src="${src('fruit')}" alt="Offerings on the altar"><img class="static-incense" src="${src('incense')}" alt="Pink incense burner">${s.lit ? '<div class="smoke"><i></i><i></i><i></i></div>' : ''}</div><p class="helper">${t('ritualHelp')}</p><div class="panel-actions">${button('light-incense', 'lightIncense', s.lit)}</div>`;
      items = [];
    } else if (panelType === 'repair') {
      title = t('lantern');
      html = `<p class="panel-description">${t(E.progress(s) === 100 ? 'fixedNotice' : 'repairHelp')}</p><div class="repair-layout"><button class="dropzone repair-zone ${s.repaired.includes('bamboo') ? 'frame-done' : ''}" data-drop="lantern" aria-label="Lantern repair target">${img(E.progress(s) === 100 ? 'fixed' : 'broken')}<i class="memory-light green" ${s.memories.includes('album') ? '' : 'hidden'}></i><i class="memory-light pink" ${s.memories.includes('polaroid') ? '' : 'hidden'}></i></button><div class="repair-steps"><div class="${s.repaired.includes('bamboo') ? 'done' : ''}">${t('frame')} · 50%</div><div class="${s.repaired.includes('paper') ? 'done' : ''}">${t('shade')} · 50%</div><p class="helper">${t('dragHelp')}</p></div></div>`;
      if (E.progress(s) === 100) html += `<div class="panel-actions">${button('project','lightLantern')}${button('keep-looking','keepLooking')}</div>`;
      items = s.inventory.filter(x => ['bamboo','paper'].includes(x));
    } else if (panelType === 'portrait') {
      title = t('portrait');
      html = `<div class="inspect-layout"><div class="portrait-crop" aria-label="Original ancestor portrait"></div><div><p class="panel-description">${t(E.progress(s) === 100 ? 'portraitReady' : 'portraitEarly')}</p>${E.progress(s) === 100 ? button('hidden','turnPortrait') : ''}</div></div>`;
    } else if (panelType === 'restart') {
      title = t('restart'); html = `<p class="panel-description">${t('resetAsk')}</p><div class="panel-actions">${button('reset','yes')}${button('keep-looking','cancel')}</div>`;
    }
    $('panel-title').textContent = title;
    $('panel-content').innerHTML = html;
    $('panel-items').innerHTML = inventoryMarkup(items);
  }
  function encounter() {
    if (!game.send('ENCOUNTER')) return;
    later(() => {
      if (!game.send('SETTLE')) return;
      speak([{ key:'startle' }, { key:'static', speaker:'ghostName' }, { key:'cannotHear' }], resetIdle);
    }, 900);
  }
  function furniture(type) {
    if (state().phase !== 'room') return;
    if (!state().ghostSeen) encounter(); else openPanel(type);
  }
  $('cabinet').addEventListener('click', () => furniture('cabinet'));
  $('bookshelf').addEventListener('click', () => furniture('shelf'));
  $('altar').addEventListener('click', () => {
    if (!state().ghostSeen) speak([{ key:'portraitEarly' }]);
    else if (!state().blessed) openPanel('ritual');
    else speak([{ key:'blessing', speaker:'ancestor', art:'ancestor' }]);
  });
  $('portrait').addEventListener('click', () => openPanel('portrait'));
  $('lantern').addEventListener('click', () => openPanel('repair'));
  $('ghost').addEventListener('click', () => {
    if (state().phase !== 'room') return;
    if (!state().blessed) speak([{ key:'static', speaker:'ghostName' }, { key:'cannotHear' }]);
    else speak([{ key:'ghostClear', speaker:'ghostName' }, { key:'ghostPart', speaker:'ghostName' }], () => game.send('TALK'));
  });
  function memory(id, replay = false) {
    if (!state().spoke || (!replay && state().phase !== 'room')) return;
    const lines = id === 'album' ? [
      { key:'album1', speaker:'sisterName', art:'album' },
      { key:'album2', speaker:'ancestor', art:'sister' },
      { key:'album3', art:'album' }
    ] : [{ key:'polaroid1', art:'polaroid' }, { key:'polaroid2', speaker:'ancestor', art:'polaroid' }, { key:'polaroid3', art:'polaroid' }];
    speak(lines, () => {
      const earned = game.send({ type:'MEMORY', id });
      if (earned) {
        $('reward-light').style.color = id === 'album' ? '#a2ff79' : '#ff18b2';
        $('reward-light').style.background = id === 'album' ? '#a2ff79' : '#ff18b2';
        $('reward-light').style.setProperty('--flight-start-x', id === 'album' ? '12%' : '88%');
        $('reward-light').style.setProperty('--flight-start-y', id === 'album' ? '69%' : '52%');
        $('reward-light').style.animation='none';void $('reward-light').offsetWidth;$('reward-light').style.animation='';
        $('reward-light').hidden = false;
        later(() => { $('reward-light').hidden = true; }, 1900);
        toast(id === 'album' ? 'greenEarned' : 'pinkEarned');
      }
      if (!replay) {
        const reopen = () => { if (state().phase === 'room' && !panelType && !dialogue) openPanel(id === 'album' ? 'cabinet' : 'shelf'); };
        if (earned) later(reopen, 1900); else reopen();
      }
    });
  }
  function showPinkFoxCloseup(afterInspect) {
    let pop=$('fox-closeup');
    if (!pop) {
      pop=document.createElement('div');pop.id='fox-closeup';pop.className='fox-closeup';
      pop.innerHTML=`<section class="fox-focus-card" role="dialog" aria-modal="true" aria-labelledby="fox-closeup-title"><span class="fox-focus-sparkle" aria-hidden="true">✦</span><h2 id="fox-closeup-title"></h2><div class="fox-focus-art"><img id="fox-closeup-image" alt="Enlarged pink fox sculpture"></div><p class="fox-focus-caption" id="fox-closeup-caption"></p><button id="fox-closeup-next" class="fox-focus-next"></button></section>`;
      $('game').appendChild(pop);
    }
    $('fox-closeup-title').textContent=t('clay');
    $('fox-closeup-image').src=src('clay');
    $('fox-closeup-caption').textContent=lang==='zh'?'祖姥姥肖像背后的小雕塑。仔细看看底座上刻的字。':'A small sculpture behind Great-aunt’s portrait. Look closely at its base.';
    $('fox-closeup-next').textContent=lang==='zh'?'查看底座文字 →':'Read the inscription →';
    pop.hidden=false;blockSceneDuringChat(true);
    $('fox-closeup-next').onclick=()=>{pop.hidden=true;blockSceneDuringChat(false);afterInspect();};
    $('fox-closeup-next').focus({preventScroll:true});
  }
  function hiddenMemory() {
    if (E.progress(state()) !== 100 || state().memories.length !== 2) return;
    closePanel();
    showPinkFoxCloseup(() => speak([{ key:'hidden1', speaker:'inscription', art:'clay' }, { key:'hidden2', speaker:'inscription', art:'clay' }, { key:'hidden3', art:'clay' }], () => game.send('HIDDEN')));
  }
  function lightIncense() {
    if (!game.send('LIGHT')) return;
    closePanel(); render(); $('objective').textContent = t('summon');
    later(() => {
      if (state().phase !== 'summoning') return;
      $('ancestor').classList.add('blessing');
      later(() => {
        if (game.send('BLESS')) speak([{ key:'blessing', speaker:'ancestor', art:'ancestor' }]);
      }, 1700);
    }, 2600);
  }
  function drop(item, target) {
    let ok = false, notice = 'wrongDrop';
    if (target === 'lantern' && ['bamboo','paper'].includes(item)) {
      if (item === 'paper' && !state().repaired.includes('bamboo')) { toast('frameFirst'); return; }
      ok = game.send({ type:'REPAIR', item }); notice = item === 'bamboo' ? 'repairedFrame' : 'repairedShade';
    }
    selected = null; render(); toast(ok ? notice : 'wrongDrop');
  }
  document.addEventListener('click', e => {
    if (suppressClick) { suppressClick = false; return; }
    const card = e.target.closest('[data-item]');
    if (card) { selected = selected === card.dataset.item ? null : card.dataset.item; render(); return; }
    const zone = e.target.closest('[data-drop]');
    if (zone && selected) { drop(selected, zone.dataset.drop); return; }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action.startsWith('take-')) { if (game.send({ type:'COLLECT', item:action.slice(5) })) toast('received'); }
    else if (action.startsWith('memory-')) memory(action.slice(7));
    else if (action === 'light-incense') lightIncense();
    else if (action === 'hidden') hiddenMemory();
    else if (action === 'project') { closePanel(); game.send('PROJECT'); }
    else if (action === 'keep-looking') { closePanel(); render(); }
    else if (action === 'reset') start();
  });
  // Pointer-based drag supports mouse, pen and touch; click-select is the keyboard alternative.
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-item]');
    if (!el || e.button !== 0) return;
    drag = { item:el.dataset.item, el, x:e.clientX, y:e.clientY, moved:false, preview:null };
    el.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
      drag.moved = true; drag.el.classList.add('dragging');
      drag.preview = document.createElement('img'); drag.preview.src = src(drag.item); drag.preview.className = 'drag-preview';
      ($('panel').open ? $('panel') : document.body).append(drag.preview);
    }
    if (!drag.moved) return;
    drag.preview.style.left = e.clientX - 45 + 'px'; drag.preview.style.top = e.clientY - 45 + 'px';
    document.querySelectorAll('.dropzone').forEach(x => x.classList.remove('over'));
    document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]')?.classList.add('over');
  });
  function endDrag(e, cancel = false) {
    if (!drag) return;
    const d = drag; drag = null; d.preview?.remove(); d.el.classList.remove('dragging');
    document.querySelectorAll('.dropzone').forEach(x => x.classList.remove('over'));
    if (d.moved) {
      suppressClick = true; later(() => { suppressClick = false; }, 0);
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
      if (target && !cancel) drop(d.item, target.dataset.drop);
    }
  }
  document.addEventListener('pointerup', e => endDrag(e));
  document.addEventListener('pointercancel', e => endDrag(e, true));
  function renderProjection() {
    const s = state(), i = s.projection;
    $('projection-number').textContent = `0${i + 1} / 0${s.hidden ? 3 : 2}`;
    $('projection-line').textContent = t('projection' + (i + 1));
    $('projection-art').className = 'projection-art ' + ['sister','polaroid','cuddle'][i];
    $('projection-art').innerHTML = i === 0 ? img('album','memory-photo') + img('sister') + img('sister','tap-hand') : img(i === 1 ? 'polaroid' : 'cuddle');
  }
  $('projection-next').addEventListener('click', () => game.send('NEXT_PROJECTION'));
  $('play-again').addEventListener('click', start);
  $('slot-album').addEventListener('click', () => { if (state().memories.includes('album') && state().phase === 'room') memory('album', true); });
  $('slot-polaroid').addEventListener('click', () => { if (state().memories.includes('polaroid') && state().phase === 'room') memory('polaroid', true); });
  $('slot-hidden').addEventListener('click', () => { if (state().hidden && state().phase === 'room') hiddenMemory(); });
  $('restart').addEventListener('click', () => { if (ready) openPanel('restart'); });
  $('language').addEventListener('click', () => { lang = lang === 'en' ? 'zh' : 'en'; render(); });
  function hideGuide() { $('idle-hint').hidden=true; }
  function resetIdle() { hideGuide();if(idleTimer)clearTimeout(idleTimer);idleTimer=setTimeout(showGuide,8000); }
  function showGuide() {
    if(!ready)return;
    const s=state();let target=null,help=t('idleHint');
    if(!$('fox-closeup')?.hidden && $('fox-closeup'))target=$('fox-closeup-next');
    else if(dialogue)target=$('dialogue-next');
    else if(introVisible&&s.phase==='opening')target=$('intro-start');
    else if($('panel').open)target=$('panel').querySelector('[data-action="light-incense"]:not(:disabled),[data-action="memory-album"]:not(:disabled),[data-action="memory-polaroid"]:not(:disabled),[data-action="project"]:not(:disabled),[data-action="take-bamboo"]:not(:disabled),[data-action="take-paper"]:not(:disabled),[data-action="hidden"]:not(:disabled),[data-drop="lantern"],#panel-close');
    else if(s.phase==='projection')target=$('projection-next');
    else if(s.phase==='ending')target=$('play-again');
    else if(s.phase==='room') {
      if(!s.ghostSeen){target=$('cabinet');help=t('goalExplore');}
      else if(!s.blessed){target=$('altar');help=t('prayerPrompt');}
      else if(!s.spoke)target=$('ghost');
      else if(s.memories.length<2)target=!s.memories.includes('album')?$('cabinet'):$('bookshelf');
      else target=$('lantern');
    }
    if(!target||target.hidden||target.disabled)return;
    const r=target.getBoundingClientRect();if(!r.width||!r.height)return;
    const x=Math.max(46,Math.min(window.innerWidth-46,r.left+r.width/2));const y=Math.max(46,Math.min(window.innerHeight-65,r.top+r.height/2));
    $('idle-hint').style.left=x+'px';$('idle-hint').style.top=y+'px';
    $('idle-hint').querySelector('.hint-label').textContent=help;
    $('idle-hint').hidden=false;
  }
  ['pointerdown','keydown','touchstart','wheel'].forEach(type=>document.addEventListener(type,resetIdle,{passive:true,capture:true}));
  async function preload() {
    $('loading').hidden = false; $('retry').hidden = true; $('loading-message').textContent = t('loading');
    try {
      await Promise.all(Object.keys(C.assets).map(key => new Promise((resolve, reject) => {
        const image = new Image(); image.onload = resolve; image.onerror = reject; image.src = src(key);
      })));
      ready = true; $('loading').hidden = true; start();
    } catch { $('loading-message').textContent = t('loadError'); $('retry').hidden = false; }
  }
  $('retry').addEventListener('click', preload);
  texts(); preload();
})();
