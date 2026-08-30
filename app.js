(() => {
  'use strict';

  const IS_FESTIVAL_RARE = document.body.dataset.collection === 'festival-rare';
  const STORAGE_KEY = IS_FESTIVAL_RARE ? 'festival-rare-logbook-v1' : 'sugo-logbook-clean-v1';
  const APP_ID = IS_FESTIVAL_RARE ? 'festival-rare-logbook' : 'sugo-logbook';
  const DATA_URL = IS_FESTIVAL_RARE ? 'data/festival-rare-characters.json' : 'data/characters.json';
  const ICON_DIR = IS_FESTIVAL_RARE ? 'assets/rare-icons' : 'assets/icons';
  const EXPORT_NAME = IS_FESTIVAL_RARE ? 'festival-rare-logbook' : 'sugo-logbook';
  const EXPORT_TITLE = IS_FESTIVAL_RARE ? '페스 한정 레어 보유/육성 현황' : '스고 보유/육성 현황';
  const categoryConfig = IS_FESTIVAL_RARE ? [
    { id: 'treasure', name: '트레저맵 한정', note: '트레저맵 페스 한정 가챠', accent: '#59d2ba', wide: true },
    { id: 'kizuna', name: '유대결전 한정', note: '유대결전 페스 한정 가챠', accent: '#63b5ff', wide: true },
    { id: 'pirate', name: '해적제 한정', note: '해적제 페스 한정 가챠', accent: '#bb8cff', wide: true },
    { id: 'support', name: '서포트 한정', note: '서폿페스 한정 가챠', accent: '#f2c85e', wide: true }
  ] : [
    { id: 'super', name: '초스고', note: '초스고페스 한정', accent: '#ff7878', wide: true },
    { id: 'anniversary', name: '주년 스고', note: '주년페스 한정', accent: '#f2c85e', wide: true },
    { id: 'pirate', name: '해적제 스고', note: '해적제페스 한정', accent: '#bb8cff', wide: false },
    { id: 'treasure', name: '트맵 스고', note: '트레저 맵 페스 한정', accent: '#59d2ba', wide: false },
    { id: 'kizuna', name: '유대 스고', note: '유대결전 페스 한정', accent: '#63b5ff', wide: false },
    { id: 'regular', name: '일반 스고', note: '통상스고', accent: '#8fa8b7', wide: true }
  ];

  let characters = [];
  let characterById = new Map();
  let state = { mode: 'owned', hideBase: false, hidePreEvolution: false, units: {} };
  let exportBlob = null;
  let exportUrl = null;
  let toastTimer = null;
  const undoStack = [];
  const UNDO_LIMIT = 50;
  const LLB_LABELS = ['', '105', '110', '120', '130', 'MAX'];
  const LLB_COLORS = ['', '#ffc27d', '#ff9b5f', '#ff744f', '#f34843', '#df2537'];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function blankUnitState() {
    return { owned: false, rainbow: false, super: false, pirate: false, llb: 0, hidden: false };
  }

  function unitState(id) {
    if (!state.units[id]) state.units[id] = blankUnitState();
    return state.units[id];
  }

  function normalizeUnit(raw) {
    return {
      owned: Boolean(raw?.owned),
      rainbow: Boolean(raw?.rainbow),
      super: Boolean(raw?.super),
      pirate: Boolean(raw?.pirate),
      llb: Math.max(0, Math.min(5, Number(raw?.llb) || 0)),
      hidden: Boolean(raw?.hidden)
    };
  }

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!stored || typeof stored !== 'object') return;
      state.mode = ['owned', 'rainbow', 'super', 'pirate', 'llb', 'hide'].includes(stored.mode) ? stored.mode : 'owned';
      state.hideBase = Boolean(stored.hideBase);
      state.hidePreEvolution = Boolean(stored.hidePreEvolution);
      if (stored.units && typeof stored.units === 'object') {
        Object.entries(stored.units).forEach(([id, value]) => {
          state.units[id] = normalizeUnit(value);
        });
      }
    } catch (error) {
      console.warn('저장 데이터를 읽지 못했습니다.', error);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function cloneState() {
    return JSON.parse(JSON.stringify(state));
  }

  function rememberUndo() {
    undoStack.push(cloneState());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    $('#undo')?.removeAttribute('disabled');
  }

  function undoLastChange() {
    const previous = undoStack.pop();
    if (!previous) {
      showToast('되돌릴 작업이 없습니다.');
      return;
    }
    state = previous;
    saveState();
    syncView();
    showToast('마지막 작업을 되돌렸습니다.');
  }

  function isAvailable(character) {
    const current = unitState(character.id);
    return !current.hidden
      && !(state.hideBase && character.evolutionOf)
      && !(state.hidePreEvolution && character.evolvesTo);
  }

  function getCategoryCharacters(category) {
    const list = characters.filter((character) => character.category === category);
    const categoryById = new Map(list.map((character) => [character.id, character]));
    const ordered = [];
    const added = new Set();

    function appendEvolutionChain(character) {
      if (!character || added.has(character.id)) return;
      added.add(character.id);
      ordered.push(character);
      appendEvolutionChain(categoryById.get(character.evolvesTo));
    }

    list.forEach((character) => {
      if (!categoryById.has(character.evolutionOf)) appendEvolutionChain(character);
    });
    list.forEach(appendEvolutionChain);
    return ordered;
  }

  function getAvailableCharacters(category) {
    return getCategoryCharacters(category).filter(isAvailable);
  }

  function iconPath(id) {
    return `${ICON_DIR}/${id}.png`;
  }

  function createUnit(character) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'unit';
    button.dataset.id = character.id;
    button.dataset.search = `${character.id} ${character.name}`.toLocaleLowerCase('ko');
    button.title = `${character.name} · No.${character.id} · ★${character.stars}`;
    button.setAttribute('aria-label', button.title);

    const image = document.createElement('img');
    image.src = iconPath(character.id);
    image.alt = '';
    image.loading = character.category === 'super' ? 'eager' : 'lazy';
    image.decoding = 'async';
    button.append(image);

    const id = document.createElement('span');
    id.className = 'unit__id';
    id.textContent = character.id;
    button.append(id);
    return button;
  }

  function renderChecklists() {
    const root = $('#checklists');
    root.replaceChildren();
    categoryConfig.forEach((category) => {
      const details = document.createElement('details');
      details.className = `checklist${category.wide ? '' : ' checklist--compact'}`;
      details.dataset.category = category.id;
      details.style.setProperty('--accent', category.accent);
      details.open = true;

      const summary = document.createElement('summary');
      summary.className = 'checklist__summary';
      summary.innerHTML = `<div><h2>${category.name}</h2><p>${category.note}</p></div><span class="checklist__count" data-category-count></span><button type="button" class="category-toggle" data-category-toggle="${category.id}" role="switch" aria-checked="false" aria-label="${category.name} 전체선택"><span class="category-toggle__track" aria-hidden="true"></span><span class="category-toggle__label">선택</span></button><span class="checklist__chevron">⌄</span>`;
      details.append(summary);

      const grid = document.createElement('div');
      grid.className = 'unit-grid';
      grid.dataset.grid = category.id;
      getCategoryCharacters(category.id).forEach((character) => grid.append(createUnit(character)));
      details.append(grid);
      root.append(details);
    });
  }

  function applyUnitAppearance(button, current) {
    button.classList.toggle('is-owned', current.owned);
    button.classList.toggle('is-rainbow', current.rainbow || current.super);
    button.classList.toggle('is-super', current.super);
    button.classList.toggle('has-pirate-key', current.pirate);
    button.setAttribute('aria-pressed', String(current.owned));

    let key = $('.unit__key', button);
    if (current.pirate && !key) {
      key = document.createElement('img');
      key.className = 'unit__key';
      key.src = 'assets/pirate-limit-key.webp';
      key.alt = '';
      button.append(key);
    } else if (!current.pirate && key) {
      key.remove();
    }

    let level = $('.unit__llb', button);
    if (current.llb > 0 && !level) {
      level = document.createElement('span');
      level.className = 'unit__llb';
      button.append(level);
    }
    if (current.llb > 0) {
      level.innerHTML = `<span class="unit__llb-prefix">Lv.</span><span class="unit__llb-value">${LLB_LABELS[current.llb]}</span>`;
      level.style.setProperty('--llb-color', LLB_COLORS[current.llb]);
    }
    else if (level) level.remove();
  }

  function syncView() {
    const query = $('#search').value.trim().toLocaleLowerCase('ko');
    let searchMatches = 0;
    $$('.unit[data-id]').forEach((button) => {
      const character = characterById.get(Number(button.dataset.id));
      const current = unitState(character.id);
      applyUnitAppearance(button, current);
      const visible = isAvailable(character) && (!query || button.dataset.search.includes(query));
      button.hidden = !visible;
      if (visible) searchMatches += 1;
    });

    categoryConfig.forEach((category) => {
      const available = getAvailableCharacters(category.id);
      const owned = available.filter((character) => unitState(character.id).owned).length;
      const unchecked = available.length - owned;
      const label = $(`[data-category="${category.id}"] [data-category-count]`);
      label.innerHTML = `<b>${available.length}</b>종 <span>[-${unchecked}]</span>`;
      const categoryToggle = $(`[data-category-toggle="${category.id}"]`);
      const allOwned = available.length > 0 && owned === available.length;
      categoryToggle.classList.toggle('is-active', allOwned);
      categoryToggle.setAttribute('aria-checked', String(allOwned));
      categoryToggle.setAttribute('aria-label', `${category.name} ${allOwned ? '전체해제' : '전체선택'}`);
      categoryToggle.title = allOwned ? `${category.name} 전체해제` : `${category.name} 전체선택`;
      $('.category-toggle__label', categoryToggle).textContent = allOwned ? '해제' : '선택';
      categoryToggle.disabled = available.length === 0;
      const grid = $(`[data-grid="${category.id}"]`);
      const hasSearchMatch = $$('.unit:not([hidden])', grid).length > 0;
      grid.closest('.checklist').hidden = Boolean(query) && !hasSearchMatch;
    });

    $('#empty-search').hidden = !query || searchMatches > 0;
    updateCounters();
    updateModeControls();
  }

  function updateCounters() {
    const available = characters.filter(isAvailable);
    const count = (key) => available.filter((character) => unitState(character.id)[key]).length;
    const owned = count('owned');
    const total = available.length;
    const rainbow = available.filter((character) => unitState(character.id).rainbow || unitState(character.id).super).length;
    const superCount = count('super');
    const pirate = count('pirate');
    $('#count-owned').textContent = `${owned} / ${total}`;
    $('#count-rainbow').textContent = `${rainbow} / ${total}`;
    $('#count-super').textContent = `${superCount} / ${total}`;
    $('#count-pirate').textContent = `${pirate} / ${total}`;
    const hidden = characters.filter((character) => unitState(character.id).hidden).length;
    $('#hidden-count').textContent = hidden;
  }

  function updateModeControls() {
    $$('.mode').forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
    });
    if ($('#undo')) $('#undo').disabled = undoStack.length === 0;
    const evolvedButton = $('#toggle-base');
    const evolvedLabel = IS_FESTIVAL_RARE ? '진화 후 형태' : '초진화 형태';
    evolvedButton.textContent = `${evolvedLabel} ${state.hideBase ? '표시' : '제거'}`;
    evolvedButton.classList.toggle('is-active', state.hideBase);
    const preEvolutionButton = $('#toggle-pre-evolution');
    if (preEvolutionButton) {
      const preEvolutionLabel = IS_FESTIVAL_RARE ? '진화 전 형태' : '초진화 전 형태';
      preEvolutionButton.textContent = `${preEvolutionLabel} ${state.hidePreEvolution ? '표시' : '제거'}`;
      preEvolutionButton.classList.toggle('is-active', state.hidePreEvolution);
    }
  }

  function mutateCharacter(id) {
    rememberUndo();
    const current = unitState(id);
    if (state.mode === 'owned') {
      current.owned = !current.owned;
      if (!current.owned) Object.assign(current, { rainbow: false, super: false, pirate: false, llb: 0 });
    } else if (state.mode === 'rainbow') {
      current.rainbow = !current.rainbow;
      current.super = false;
      if (current.rainbow) current.owned = true;
    } else if (state.mode === 'super') {
      current.super = !current.super;
      current.rainbow = false;
      if (current.super) current.owned = true;
    } else if (state.mode === 'pirate') {
      current.pirate = !current.pirate;
      if (current.pirate) current.owned = true;
    } else if (state.mode === 'llb') {
      current.llb = (current.llb + 1) % 6;
      if (current.llb) current.owned = true;
    } else if (state.mode === 'hide') {
      Object.assign(current, blankUnitState(), { hidden: true });
    }
    saveState();
    syncView();
  }

  function selectAllOwned() {
    rememberUndo();
    characters.filter(isAvailable).forEach((character) => {
      unitState(character.id).owned = true;
    });
    saveState();
    syncView();
    showToast('캐릭터를 모두 선택했습니다.');
  }

  function toggleCategoryOwned(categoryId) {
    const available = getAvailableCharacters(categoryId);
    if (!available.length) return;
    const allOwned = available.every((character) => unitState(character.id).owned);
    rememberUndo();
    available.forEach((character) => {
      const current = unitState(character.id);
      current.owned = !allOwned;
      if (allOwned) Object.assign(current, { rainbow: false, super: false, pirate: false, llb: 0 });
    });
    saveState();
    syncView();
    const categoryName = categoryConfig.find((category) => category.id === categoryId)?.name || '해당 항목';
    showToast(`${categoryName}를 모두 ${allOwned ? '해제' : '선택'}했습니다.`);
  }

  function renderHiddenList() {
    const root = $('#hidden-list');
    root.replaceChildren();
    const hidden = characters.filter((character) => unitState(character.id).hidden);
    if (!hidden.length) {
      root.innerHTML = '<p class="sheet__help">지운 캐릭터가 없습니다.</p>';
      return;
    }
    hidden.forEach((character) => {
      const button = createUnit(character);
      button.dataset.restoreId = character.id;
      button.removeAttribute('data-id');
      root.append(button);
    });
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }

  function loadImage(src, timeout = 8000) {
    return new Promise((resolve) => {
      const image = new Image();
      const timer = setTimeout(() => resolve(null), timeout);
      image.onload = () => { clearTimeout(timer); resolve(image); };
      image.onerror = () => { clearTimeout(timer); resolve(null); };
      image.src = src;
    });
  }

  async function loadImagesWithProgress(list, onProgress) {
    const result = new Map();
    let cursor = 0;
    let finished = 0;
    const workers = Array.from({ length: 12 }, async () => {
      while (cursor < list.length) {
        const item = list[cursor++];
        const image = await loadImage(iconPath(item.id));
        result.set(item.id, image);
        finished += 1;
        if (finished % 15 === 0 || finished === list.length) onProgress(finished, list.length);
      }
    });
    await Promise.all(workers);
    return result;
  }

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fill();
  }

  async function makeShareImage() {
    const expandedCategoryIds = new Set(
      $$('.checklist[data-category]')
        .filter((section) => section.open)
        .map((section) => section.dataset.category)
    );
    const available = characters.filter((character) => expandedCategoryIds.has(character.category) && isAvailable(character));
    $('#export-status').textContent = `캐릭터 이미지를 불러오는 중 0 / ${available.length}`;
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('400 13px "S-Core Dream"'),
      document.fonts.load('700 18px "S-Core Dream"'),
      document.fonts.load('800 20px "S-Core Dream"')
    ]);
    const [images, keyImage] = await Promise.all([
      loadImagesWithProgress(available, (done, total) => { $('#export-status').textContent = `캐릭터 이미지를 불러오는 중 ${done} / ${total}`; }),
      loadImage('assets/pirate-limit-key.webp')
    ]);

    const width = 1200;
    const margin = 38;
    const icon = 58;
    const gap = 8;
    const columns = 17;
    const sectionGap = 18;
    const headerHeight = 126;
    const uiFont = '"S-Core Dream", sans-serif';
    const sections = categoryConfig.filter((category) => expandedCategoryIds.has(category.id)).map((category) => {
      const units = getAvailableCharacters(category.id);
      const rows = Math.max(1, Math.ceil(units.length / columns));
      return { ...category, units, height: 72 + rows * (icon + gap) + 14 };
    });
    const footerHeight = 48;
    const height = headerHeight + sections.reduce((sum, category) => sum + category.height + sectionGap, 0) + margin + footerHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#17100b');
    background.addColorStop(.5, '#2b1c12');
    background.addColorStop(1, '#100b08');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(171,133,70,.035)';
    for (let line = -height; line < width; line += 110) {
      context.save();
      context.translate(line, 0);
      context.rotate(-Math.PI / 4);
      context.fillRect(0, 0, 2, height * 2);
      context.restore();
    }
    context.fillStyle = '#e8e1d6';
    context.font = `800 21px ${uiFont}`;
    context.fillText(EXPORT_TITLE, margin, 33);
    context.fillStyle = '#9f8b65';
    context.font = `400 11px ${uiFont}`;
    context.fillText('ONE PIECE TREASURE CRUISE · 비공식 팬 제작 도구', margin, 48);
    const owned = available.filter((character) => unitState(character.id).owned).length;
    const rainbow = available.filter((character) => unitState(character.id).rainbow || unitState(character.id).super).length;
    const superCount = available.filter((character) => unitState(character.id).super).length;
    const pirate = available.filter((character) => unitState(character.id).pirate).length;
    const metrics = [['전체', owned], ['무지개', rainbow], ['초무지개', superCount], ['해적제한돌', pirate]];
    metrics.forEach(([label, value], index) => {
      const x = margin + index * 275;
      context.fillStyle = '#362319';
      roundedRect(context, x, 59, 255, 52, 7);
      context.strokeStyle = '#80683a';
      context.lineWidth = 2;
      context.beginPath(); context.roundRect(x, 59, 255, 52, 7); context.stroke();
      context.fillStyle = '#b9aa8a'; context.font = `500 12px ${uiFont}`; context.fillText(label, x + 14, 79);
      context.fillStyle = '#f0ebe3'; context.font = `800 17px ${uiFont}`; context.fillText(`${value} / ${available.length}`, x + 14, 101);
    });

    let y = headerHeight;
    sections.forEach((category) => {
      context.fillStyle = '#2b1c12';
      roundedRect(context, margin, y, width - margin * 2, category.height, 16);
      context.strokeStyle = '#7d622e';
      context.lineWidth = 2;
      context.beginPath(); context.roundRect(margin, y, width - margin * 2, category.height, 16); context.stroke();
      context.fillStyle = '#4d2018';
      roundedRect(context, margin + 8, y + 8, width - margin * 2 - 16, 42, 9);
      context.fillStyle = '#9a7b3e';
      roundedRect(context, margin + 17, y + 19, 5, 27, 3);
      context.fillStyle = '#eee8dc'; context.font = `800 20px ${uiFont}`; context.fillText(category.name, margin + 34, y + 40);
      const unchecked = category.units.filter((character) => !unitState(character.id).owned).length;
      context.fillStyle = '#b9a474'; context.font = `500 13px ${uiFont}`;
      context.fillText(`총 ${category.units.length}종  [-${unchecked}]`, width - margin - 150, y + 39);

      category.units.forEach((character, index) => {
        const current = unitState(character.id);
        const x = margin + 18 + (index % columns) * (icon + gap);
        const rowY = y + 58 + Math.floor(index / columns) * (icon + gap);
        context.save();
        context.globalAlpha = current.owned ? 1 : .28;
        const image = images.get(character.id);
        if (current.rainbow || current.super) {
          const rainbowGradient = typeof context.createConicGradient === 'function'
            ? context.createConicGradient(0, x + icon / 2, rowY + icon / 2)
            : context.createLinearGradient(x - 3, rowY - 3, x + icon + 3, rowY + icon + 3);
          if (current.super) {
            const superPattern = ['#52d9ff', '#ffe53d', '#ff3154', '#bd4cff'];
            const repeats = 8;
            for (let repeat = 0; repeat < repeats; repeat += 1) {
              superPattern.forEach((color, colorIndex) => {
                rainbowGradient.addColorStop((repeat + colorIndex / superPattern.length) / repeats, color);
              });
            }
            rainbowGradient.addColorStop(1, superPattern[0]);
          } else {
            [[0, '#f04f67'], [1 / 3, '#a75be0'], [2 / 3, '#f2cf45'], [1, '#f04f67']]
              .forEach(([stop, color]) => rainbowGradient.addColorStop(stop, color));
          }
          context.fillStyle = rainbowGradient;
          roundedRect(context, x - 3, rowY - 3, icon + 6, icon + 6, 8);
        } else if (current.owned) {
          context.fillStyle = '#17100b'; roundedRect(context, x - 2, rowY - 2, icon + 4, icon + 4, 7);
        }
        if (image) context.drawImage(image, x, rowY, icon, icon);
        else { context.fillStyle = '#332217'; roundedRect(context, x, rowY, icon, icon, 6); }
        context.restore();
        context.save();
        const idText = String(character.id);
        context.font = `800 8px ${uiFont}`;
        const idWidth = context.measureText(idText).width + 7;
        context.fillStyle = 'rgba(23,16,11,.92)';
        roundedRect(context, x - 3, rowY - 5, idWidth, 12, 4);
        context.fillStyle = '#fff';
        context.textAlign = 'left';
        context.textBaseline = 'alphabetic';
        context.fillText(idText, x, rowY + 4);
        context.restore();
        if (current.pirate && keyImage) {
          context.save();
          context.shadowColor = 'rgba(0,0,0,.9)';
          context.shadowBlur = 4;
          context.drawImage(keyImage, x + icon - 18, rowY - 7, 26, 26);
          context.restore();
        }
        if (current.llb > 0) {
          const llbValue = LLB_LABELS[current.llb];
          const baseline = rowY + icon - 4;
          context.textAlign = 'left';
          context.textBaseline = 'alphabetic';
          context.font = '800 7px sans-serif';
          const prefixWidth = context.measureText('Lv.').width;
          context.font = '900 9px sans-serif';
          const valueWidth = context.measureText(llbValue).width;
          const boxWidth = prefixWidth + valueWidth + 7;
          const boxX = x + icon - boxWidth - 2;
          context.fillStyle = 'rgba(2,7,11,.82)';
          roundedRect(context, boxX, baseline - 11, boxWidth, 14, 4);
          context.shadowColor = 'rgba(0,0,0,.95)';
          context.shadowBlur = 2;
          context.font = '800 7px sans-serif';
          context.fillStyle = '#fff';
          context.fillText('Lv.', boxX + 3, baseline);
          const valueGradient = context.createLinearGradient(0, baseline - 9, 0, baseline + 1);
          valueGradient.addColorStop(0, '#fff');
          valueGradient.addColorStop(.28, '#fff');
          valueGradient.addColorStop(1, LLB_COLORS[current.llb]);
          context.font = '900 9px sans-serif';
          context.fillStyle = valueGradient;
          context.fillText(llbValue, boxX + 3 + prefixWidth, baseline);
          context.shadowBlur = 0;
        }
      });
      y += category.height + sectionGap;
    });

    context.textAlign = 'center';
    context.fillStyle = '#95876e';
    context.font = `500 10px ${uiFont}`;
    context.fillText('© Eiichiro Oda/Shueisha, Toei Animation © Bandai Namco Entertainment Inc.', width / 2, height - 30);
    context.globalAlpha = .78;
    context.font = `400 9px ${uiFont}`;
    context.fillText('This is an unofficial fan-made tool and is not affiliated with or endorsed by the rights holders or the official service.', width / 2, height - 14);
    context.globalAlpha = 1;
    context.textAlign = 'left';

    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG 변환 실패')), 'image/png'));
  }

  async function exportImage() {
    const dialog = $('#export-dialog');
    dialog.showModal();
    $('#download-image').hidden = true;
    $('#export-preview').replaceChildren();
    try {
      exportBlob = await makeShareImage();
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      exportUrl = URL.createObjectURL(exportBlob);
      const preview = new Image();
      preview.src = exportUrl;
      preview.alt = `${EXPORT_TITLE} 이미지 미리보기`;
      $('#export-preview').append(preview);
      $('#export-status').textContent = '이미지가 완성되었습니다.';
      $('#download-image').hidden = false;
    } catch (error) {
      console.error(error);
      $('#export-status').textContent = '이미지 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.';
    }
  }

  function bindEvents() {
    $('#mode-picker').addEventListener('click', (event) => {
      const button = event.target.closest('[data-mode]');
      if (!button) return;
      state.mode = button.dataset.mode;
      saveState();
      updateModeControls();
    });

    $('#checklists').addEventListener('click', (event) => {
      const categoryToggle = event.target.closest('[data-category-toggle]');
      if (categoryToggle) {
        event.preventDefault();
        event.stopPropagation();
        toggleCategoryOwned(categoryToggle.dataset.categoryToggle);
        return;
      }
      const button = event.target.closest('.unit[data-id]');
      if (button) mutateCharacter(Number(button.dataset.id));
    });

    $('#search').addEventListener('input', syncView);
    document.addEventListener('keydown', (event) => {
      const active = document.activeElement;
      const editingText = active?.matches('input, textarea, [contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !editingText) {
        event.preventDefault();
        undoLastChange();
        return;
      }
      if (event.key === '/' && document.activeElement !== $('#search')) {
        event.preventDefault(); $('#search').focus();
      }
    });
    $('#undo')?.addEventListener('click', undoLastChange);
    $('#select-owned-all')?.addEventListener('click', selectAllOwned);
    $('#toggle-base').addEventListener('click', () => { rememberUndo(); state.hideBase = !state.hideBase; saveState(); syncView(); });
    $('#toggle-pre-evolution')?.addEventListener('click', () => { rememberUndo(); state.hidePreEvolution = !state.hidePreEvolution; saveState(); syncView(); });
    $('#restore-hidden').addEventListener('click', () => {
      rememberUndo();
      characters.forEach((character) => { unitState(character.id).hidden = false; });
      saveState(); syncView(); showToast('지운 캐릭터를 모두 복구했습니다.');
    });
    $('#show-hidden').addEventListener('click', () => { renderHiddenList(); $('#hidden-dialog').showModal(); });
    $('#hidden-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-restore-id]');
      if (!button) return;
      rememberUndo();
      unitState(Number(button.dataset.restoreId)).hidden = false;
      button.remove(); saveState(); syncView();
      if (!$('#hidden-list').children.length) renderHiddenList();
    });
    $('#reset').addEventListener('click', () => {
      if (!confirm('모든 체크 현황을 초기화할까요?')) return;
      rememberUndo();
      state = { mode: 'owned', hideBase: false, hidePreEvolution: false, units: {} };
      saveState(); syncView(); showToast('체크리스트를 초기화했습니다.');
    });
    $('#backup').addEventListener('click', () => $('#backup-dialog').showModal());
    $('#download-save').addEventListener('click', () => {
      const payload = { app: APP_ID, version: 1, exportedAt: new Date().toISOString(), state };
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${EXPORT_NAME}-save.json`);
    });
    $('#upload-save').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        if (payload.app !== APP_ID || !payload.state?.units) throw new Error('잘못된 저장파일');
        rememberUndo();
        state = {
          mode: payload.state.mode || 'owned',
          hideBase: Boolean(payload.state.hideBase),
          hidePreEvolution: Boolean(payload.state.hidePreEvolution),
          units: {}
        };
        Object.entries(payload.state.units).forEach(([id, value]) => { state.units[id] = normalizeUnit(value); });
        saveState(); syncView(); $('#backup-dialog').close(); showToast('저장파일을 불러왔습니다.');
      } catch (error) {
        showToast('올바른 저장파일이 아닙니다.');
      } finally {
        event.target.value = '';
      }
    });
    $('#export-image').addEventListener('click', exportImage);
    $('#download-image').addEventListener('click', () => exportBlob && downloadBlob(exportBlob, `${EXPORT_NAME}.png`));
  }

  async function start() {
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      characters = await response.json();
      characterById = new Map(characters.map((character) => [Number(character.id), character]));
      loadState();
      renderChecklists();
      bindEvents();
      syncView();
      if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').catch((error) => console.warn('오프라인 캐시를 시작하지 못했습니다.', error));
      }
    } catch (error) {
      console.error(error);
    }
  }

  start();
})();
