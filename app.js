(() => {
  'use strict';

  const STORAGE_KEY = 'sugo-logbook-clean-v1';
  const categoryConfig = [
    { id: 'super', name: '초스고', note: '초스고페스 한정', accent: '#ff7878', wide: true },
    { id: 'anniversary', name: '주년 스고', note: '주년페스 한정', accent: '#f2c85e', wide: true },
    { id: 'pirate', name: '해적제 스고', note: '해적제페스 한정', accent: '#bb8cff', wide: false },
    { id: 'treasure', name: '트맵 스고', note: '트레저 맵 페스 한정', accent: '#59d2ba', wide: false },
    { id: 'kizuna', name: '유대 스고', note: '유대 결전 페스 한정', accent: '#63b5ff', wide: false },
    { id: 'regular', name: '일반 스고', note: '"통언뜬"', accent: '#8fa8b7', wide: true }
  ];

  let characters = [];
  let characterById = new Map();
  let state = { mode: 'owned', hideBase: false, units: {} };
  let exportBlob = null;
  let exportUrl = null;
  let toastTimer = null;

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

  function isAvailable(character) {
    const current = unitState(character.id);
    return !current.hidden && !(state.hideBase && character.baseForm);
  }

  function getAvailableCharacters(category) {
    return characters.filter((character) => character.category === category && isAvailable(character));
  }

  function iconPath(id) {
    return `assets/icons/${id}.png`;
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
      summary.innerHTML = `<div><h2>${category.name}</h2><p>${category.note}</p></div><span class="checklist__count" data-category-count></span><span class="checklist__chevron">⌄</span>`;
      details.append(summary);

      const grid = document.createElement('div');
      grid.className = 'unit-grid';
      grid.dataset.grid = category.id;
      characters.filter((character) => character.category === category.id).forEach((character) => grid.append(createUnit(character)));
      details.append(grid);
      root.append(details);
    });
  }

  function applyUnitAppearance(button, current) {
    button.classList.toggle('is-owned', current.owned);
    button.classList.toggle('is-rainbow', current.rainbow || current.super);
    button.classList.toggle('is-super', current.super);
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
    if (current.llb > 0) level.textContent = current.llb;
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
    const percent = total ? Math.round((owned / total) * 100) : 0;

    $('#count-owned').textContent = `${owned} / ${total}`;
    $('#count-rainbow').textContent = `${rainbow} / ${total}`;
    $('#count-super').textContent = `${superCount} / ${total}`;
    $('#count-pirate').textContent = `${pirate} / ${total}`;
    $('#progress-percent').textContent = `${percent}%`;
    $('#progress-ring').style.strokeDashoffset = String(314.16 * (1 - percent / 100));
    const hidden = characters.filter((character) => unitState(character.id).hidden).length;
    $('#hidden-count').textContent = hidden;
  }

  function updateModeControls() {
    $$('.mode').forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
    });
    $('#select-all').disabled = state.mode === 'hide';
    $('#toggle-base').textContent = state.hideBase ? '초진화 캐릭터 표시' : '초진화 목록에서 제거';
  }

  function mutateCharacter(id) {
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

  function applyModeToAll() {
    if (state.mode === 'hide') return;
    characters.filter(isAvailable).forEach((character) => {
      const current = unitState(character.id);
      if (state.mode === 'owned') current.owned = true;
      if (state.mode === 'rainbow') Object.assign(current, { owned: true, rainbow: true, super: false });
      if (state.mode === 'super') Object.assign(current, { owned: true, rainbow: false, super: true });
      if (state.mode === 'pirate') Object.assign(current, { owned: true, pirate: true });
      if (state.mode === 'llb') Object.assign(current, { owned: true, llb: 5 });
    });
    saveState();
    syncView();
    showToast('현재 모드를 전체 캐릭터에 적용했습니다.');
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
    const available = characters.filter(isAvailable);
    $('#export-status').textContent = `캐릭터 이미지를 불러오는 중 0 / ${available.length}`;
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
    const headerHeight = 190;
    const sections = categoryConfig.map((category) => {
      const units = getAvailableCharacters(category.id);
      const rows = Math.max(1, Math.ceil(units.length / columns));
      return { ...category, units, height: 72 + rows * (icon + gap) + 14 };
    });
    const height = headerHeight + sections.reduce((sum, category) => sum + category.height + sectionGap, 0) + margin;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#07131f');
    background.addColorStop(.5, '#0b1e2c');
    background.addColorStop(1, '#07131f');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(85,216,210,.08)';
    context.beginPath(); context.arc(140, 40, 240, 0, Math.PI * 2); context.fill();

    context.fillStyle = '#55d8d2';
    context.font = '800 14px sans-serif';
    context.fillText('SUGO LOG · MY VOYAGE', margin, 42);
    context.fillStyle = '#edf5f7';
    context.font = '800 38px sans-serif';
    context.fillText('나의 스고 항해일지', margin, 88);

    const owned = available.filter((character) => unitState(character.id).owned).length;
    const rainbow = available.filter((character) => unitState(character.id).rainbow || unitState(character.id).super).length;
    const superCount = available.filter((character) => unitState(character.id).super).length;
    const pirate = available.filter((character) => unitState(character.id).pirate).length;
    const metrics = [['전체', owned], ['무지개', rainbow], ['초무지개', superCount], ['해적제한돌', pirate]];
    metrics.forEach(([label, value], index) => {
      const x = margin + index * 275;
      context.fillStyle = 'rgba(255,255,255,.055)';
      roundedRect(context, x, 112, 255, 56, 10);
      context.fillStyle = '#91a4b0'; context.font = '13px sans-serif'; context.fillText(label, x + 14, 135);
      context.fillStyle = '#edf5f7'; context.font = '800 18px sans-serif'; context.fillText(`${value} / ${available.length}`, x + 14, 158);
    });

    let y = headerHeight;
    sections.forEach((category) => {
      context.fillStyle = 'rgba(16,42,57,.94)';
      roundedRect(context, margin, y, width - margin * 2, category.height, 16);
      context.fillStyle = category.accent;
      roundedRect(context, margin + 17, y + 19, 5, 27, 3);
      context.fillStyle = '#edf5f7'; context.font = '800 20px sans-serif'; context.fillText(category.name, margin + 34, y + 40);
      const unchecked = category.units.filter((character) => !unitState(character.id).owned).length;
      context.fillStyle = '#91a4b0'; context.font = '13px sans-serif';
      context.fillText(`총 ${category.units.length}종  [-${unchecked}]`, width - margin - 150, y + 39);

      category.units.forEach((character, index) => {
        const current = unitState(character.id);
        const x = margin + 18 + (index % columns) * (icon + gap);
        const rowY = y + 58 + Math.floor(index / columns) * (icon + gap);
        context.save();
        context.globalAlpha = current.owned ? 1 : .28;
        const image = images.get(character.id);
        if (current.super || current.rainbow) {
          const color = current.super ? '#d68aff' : '#62e4bb';
          context.fillStyle = color; roundedRect(context, x - 2, rowY - 2, icon + 4, icon + 4, 7);
        } else if (current.owned) {
          context.fillStyle = '#ff6e69'; roundedRect(context, x - 2, rowY - 2, icon + 4, icon + 4, 7);
        }
        if (image) context.drawImage(image, x, rowY, icon, icon);
        else { context.fillStyle = '#172f3e'; roundedRect(context, x, rowY, icon, icon, 6); }
        context.restore();
        if (current.pirate && keyImage) context.drawImage(keyImage, x + icon - 19, rowY + 2, 18, 18);
        if (current.llb > 0) {
          context.fillStyle = '#8bd8ff'; context.beginPath(); context.arc(x + icon - 9, rowY + icon - 9, 9, 0, Math.PI * 2); context.fill();
          context.fillStyle = '#052033'; context.font = '800 10px sans-serif'; context.textAlign = 'center'; context.fillText(String(current.llb), x + icon - 9, rowY + icon - 5.5); context.textAlign = 'left';
        }
      });
      y += category.height + sectionGap;
    });

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
      preview.alt = '스고 항해일지 이미지 미리보기';
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
      const button = event.target.closest('.unit[data-id]');
      if (button) mutateCharacter(Number(button.dataset.id));
    });

    $('#search').addEventListener('input', syncView);
    document.addEventListener('keydown', (event) => {
      if (event.key === '/' && document.activeElement !== $('#search')) {
        event.preventDefault(); $('#search').focus();
      }
    });
    $('#select-all').addEventListener('click', applyModeToAll);
    $('#toggle-base').addEventListener('click', () => { state.hideBase = !state.hideBase; saveState(); syncView(); });
    $('#restore-hidden').addEventListener('click', () => {
      characters.forEach((character) => { unitState(character.id).hidden = false; });
      saveState(); syncView(); showToast('지운 캐릭터를 모두 복구했습니다.');
    });
    $('#show-hidden').addEventListener('click', () => { renderHiddenList(); $('#hidden-dialog').showModal(); });
    $('#hidden-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-restore-id]');
      if (!button) return;
      unitState(Number(button.dataset.restoreId)).hidden = false;
      button.remove(); saveState(); syncView();
      if (!$('#hidden-list').children.length) renderHiddenList();
    });
    $('#reset').addEventListener('click', () => {
      if (!confirm('모든 체크 현황을 초기화할까요?')) return;
      state = { mode: 'owned', hideBase: false, units: {} };
      saveState(); syncView(); showToast('체크리스트를 초기화했습니다.');
    });
    $('#backup').addEventListener('click', () => $('#backup-dialog').showModal());
    $('#download-save').addEventListener('click', () => {
      const payload = { app: 'sugo-logbook', version: 1, exportedAt: new Date().toISOString(), state };
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'sugo-logbook-save.json');
    });
    $('#upload-save').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        if (payload.app !== 'sugo-logbook' || !payload.state?.units) throw new Error('잘못된 저장파일');
        state = { mode: payload.state.mode || 'owned', hideBase: Boolean(payload.state.hideBase), units: {} };
        Object.entries(payload.state.units).forEach(([id, value]) => { state.units[id] = normalizeUnit(value); });
        saveState(); syncView(); $('#backup-dialog').close(); showToast('저장파일을 불러왔습니다.');
      } catch (error) {
        showToast('올바른 저장파일이 아닙니다.');
      } finally {
        event.target.value = '';
      }
    });
    $('#export-image').addEventListener('click', exportImage);
    $('#download-image').addEventListener('click', () => exportBlob && downloadBlob(exportBlob, 'sugo-logbook.png'));
  }

  async function start() {
    try {
      const response = await fetch('data/characters.json');
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
