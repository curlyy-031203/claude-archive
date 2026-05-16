/* =================================================================
   ui.js · UI 交互层
   所有 DOM 操作、视图切换、模态、列表渲染都在这里
   ================================================================= */

(function () {
  /* —— 状态 —— */
  const state = {
    conversations: [],
    cards: [],
    currentTab: 'conversations',
    searchTerm: '',
    activeTag: null,
    selectedCardSources: new Set(),
    currentDetailId: null,
    currentDetailType: null  // 'conversation' or 'card'
  };

  /* —— 工具：DOM 引用 —— */
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  /* —— 视图切换 —— */
  function showView(name) {
    $$('.view').forEach(v => v.classList.add('hidden'));
    const target = $(`view-${name}`);
    if (target) target.classList.remove('hidden');
  }

  /* —— 模态 —— */
  function openModal(id) {
    $(id).classList.remove('hidden');
  }
  function closeModal(id) {
    $(id).classList.add('hidden');
  }
  function closeAllModals() {
    $$('.modal').forEach(m => m.classList.add('hidden'));
  }

  /* —— Toast —— */
  let toastTimer = null;
  function toast(msg, type) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden', 'error');
    if (type === 'error') t.classList.add('error');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
  }

  /* —— 错误显示 —— */
  function setError(id, msg) {
    const el = $(id);
    if (el) el.textContent = msg || '';
  }

  /* —— 日期格式化 —— */
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const today = new Date();
    const sameYear = d.getFullYear() === today.getFullYear();
    const opts = sameYear
      ? { month: 'numeric', day: 'numeric' }
      : { year: 'numeric', month: 'numeric', day: 'numeric' };
    return d.toLocaleDateString('zh-CN', opts);
  }

  function fmtCount(n) {
    if (n < 1000) return String(n);
    if (n < 10000) return (n / 1000).toFixed(1) + 'k';
    return (n / 10000).toFixed(1) + 'w';
  }

  /* =================================================================
     列表渲染
     ================================================================= */

  function applyFilters(items) {
    const term = state.searchTerm.trim().toLowerCase();
    return items.filter(item => {
      if (state.activeTag && !(item.tags || []).includes(state.activeTag)) return false;
      if (term) {
        const inTitle = (item.title || '').toLowerCase().includes(term);
        const inTags = (item.tags || []).some(t => t.toLowerCase().includes(term));
        if (!inTitle && !inTags) return false;
      }
      return true;
    });
  }

  function renderConversationList() {
    const container = $('list-conversations');
    const items = applyFilters(state.conversations);
    container.innerHTML = '';

    if (items.length === 0) {
      $('empty-state').classList.remove('hidden');
    } else {
      $('empty-state').classList.add('hidden');
    }

    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.dataset.id = item.id;
      div.innerHTML = `
        <h3 class="list-item-title">${escapeHtml(item.title)}</h3>
        <div class="list-item-meta">
          <span>${fmtDate(item.conversationDate || item.createdAt)}</span>
          <span class="list-item-meta-sep"></span>
          <span>${fmtCount(item.messageCount || 0)} 条消息</span>
          <span class="list-item-meta-sep"></span>
          <span>${fmtCount(item.wordCount || 0)} 字</span>
        </div>
        ${item.tags && item.tags.length ? `<div class="list-item-tags">${item.tags.map(t => `<span class="list-item-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      `;
      div.addEventListener('click', () => openConversationDetail(item.id));
      container.appendChild(div);
    });

    $('count-conv').textContent = state.conversations.length;
  }

  function renderCardList() {
    const container = $('list-cards');
    const items = applyFilters(state.cards);
    container.innerHTML = '';

    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.dataset.id = item.id;
      div.innerHTML = `
        <h3 class="list-item-title">${escapeHtml(item.title)}</h3>
        <div class="list-item-meta">
          <span>${fmtDate(item.createdAt)}</span>
          <span class="list-item-meta-sep"></span>
          <span>基于 ${item.sourceIds.length} 段对话</span>
        </div>
      `;
      div.addEventListener('click', () => openCardDetail(item.id));
      container.appendChild(div);
    });

    $('count-cards').textContent = state.cards.length;
  }

  function renderTagFilter() {
    const tagsSet = new Set();
    state.conversations.forEach(c => (c.tags || []).forEach(t => tagsSet.add(t)));
    state.cards.forEach(c => (c.tags || []).forEach(t => tagsSet.add(t)));

    const container = $('tag-filter');
    container.innerHTML = '';

    if (tagsSet.size === 0) return;

    const tags = Array.from(tagsSet).sort();
    tags.forEach(tag => {
      const btn = document.createElement('button');
      btn.className = 'tag-pill' + (state.activeTag === tag ? ' active' : '');
      btn.textContent = tag;
      btn.addEventListener('click', () => {
        state.activeTag = state.activeTag === tag ? null : tag;
        renderTagFilter();
        renderCurrentTab();
      });
      container.appendChild(btn);
    });
  }

  function renderCurrentTab() {
    if (state.currentTab === 'conversations') {
      renderConversationList();
    } else {
      renderCardList();
    }
  }

  /* —— HTML 转义 —— */
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* =================================================================
     Tab 切换
     ================================================================= */

  function setupTabs() {
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        $$('.list').forEach(l => l.classList.remove('active'));
        tab.classList.add('active');
        const name = tab.dataset.tab;
        state.currentTab = name;
        if (name === 'conversations') $('list-conversations').classList.add('active');
        else $('list-cards').classList.add('active');
        renderCurrentTab();
      });
    });
  }

  /* —— 搜索 —— */
  function setupSearch() {
    $('search-input').addEventListener('input', (e) => {
      state.searchTerm = e.target.value;
      renderCurrentTab();
    });
  }

  /* =================================================================
     对话详情
     ================================================================= */

  async function openConversationDetail(id) {
    state.currentDetailId = id;
    state.currentDetailType = 'conversation';
    openModal('modal-detail');
    $('detail-title').textContent = '加载中…';
    $('detail-meta').textContent = '';
    $('detail-body').innerHTML = '<p style="color: var(--text-tertiary)">加载中…</p>';

    try {
      const conv = await window.DataLayer.getConversation(id);
      $('detail-title').textContent = conv.title;
      $('detail-meta').innerHTML = `
        <span>${fmtDate(conv.conversationDate || conv.createdAt)}</span>
        <span>·</span>
        <span>${fmtCount(conv.messages.length)} 条消息</span>
        <span>·</span>
        <span>${fmtCount(conv.wordCount || 0)} 字</span>
        ${conv.tags.length ? '<span>·</span><span>' + conv.tags.map(escapeHtml).join('、') + '</span>' : ''}
      `;

      const body = $('detail-body');
      body.innerHTML = '';
      if (conv.messages && conv.messages.length) {
        conv.messages.forEach(m => {
          const div = document.createElement('div');
          div.className = 'msg';
          div.innerHTML = `
            <div class="msg-role">${m.role === 'user' ? 'Scarlett' : 'Claude'}</div>
            <div class="msg-text">${escapeHtml(m.text)}</div>
          `;
          body.appendChild(div);
        });
      } else if (conv.rawText) {
        const div = document.createElement('div');
        div.className = 'msg';
        div.innerHTML = `<div class="msg-text">${escapeHtml(conv.rawText)}</div>`;
        body.appendChild(div);
      }
    } catch (e) {
      $('detail-body').innerHTML = `<p style="color: var(--danger)">读取失败：${escapeHtml(e.message)}</p>`;
    }
  }

  async function openCardDetail(id) {
    state.currentDetailId = id;
    state.currentDetailType = 'card';
    openModal('modal-detail');
    $('detail-title').textContent = '加载中…';
    $('detail-meta').textContent = '';
    $('detail-body').innerHTML = '<p style="color: var(--text-tertiary)">加载中…</p>';

    try {
      const card = await window.DataLayer.getCard(id);
      $('detail-title').textContent = card.title;
      $('detail-meta').innerHTML = `
        <span>${fmtDate(card.createdAt)}</span>
        <span>·</span>
        <span>基于 ${card.sourceIds.length} 段对话</span>
      `;
      const body = $('detail-body');
      body.innerHTML = `<div class="msg"><div class="msg-text">${escapeHtml(card.content)}</div></div>`;
    } catch (e) {
      $('detail-body').innerHTML = `<p style="color: var(--danger)">读取失败：${escapeHtml(e.message)}</p>`;
    }
  }

  function setupDetailActions() {
    $('detail-delete').addEventListener('click', async () => {
      if (!state.currentDetailId) return;
      if (!confirm('真的要删除吗？此操作不可恢复。')) return;
      try {
        if (state.currentDetailType === 'conversation') {
          await window.DataLayer.deleteConversation(state.currentDetailId);
          state.conversations = state.conversations.filter(c => c.id !== state.currentDetailId);
        } else {
          await window.DataLayer.deleteCard(state.currentDetailId);
          state.cards = state.cards.filter(c => c.id !== state.currentDetailId);
        }
        closeModal('modal-detail');
        renderCurrentTab();
        renderTagFilter();
        toast('已删除');
      } catch (e) {
        toast('删除失败：' + e.message, 'error');
      }
    });

    $('detail-copy').addEventListener('click', async () => {
      const text = $('detail-body').innerText;
      try {
        await navigator.clipboard.writeText(text);
        toast('已复制到剪贴板');
      } catch (_) {
        toast('复制失败，请手动选中', 'error');
      }
    });

    $('detail-edit-tags').addEventListener('click', () => {
      if (state.currentDetailType !== 'conversation') {
        toast('卡片暂不支持标签');
        return;
      }
      const conv = state.conversations.find(c => c.id === state.currentDetailId);
      if (!conv) return;
      $('tags-input').value = (conv.tags || []).join(', ');
      openModal('modal-tags');
    });

    $('tags-save').addEventListener('click', async () => {
      const raw = $('tags-input').value;
      const tags = raw.split(',').map(s => s.trim()).filter(Boolean);
      try {
        await window.DataLayer.updateConversationTags(state.currentDetailId, tags);
        const conv = state.conversations.find(c => c.id === state.currentDetailId);
        if (conv) conv.tags = tags;
        closeModal('modal-tags');
        renderCurrentTab();
        renderTagFilter();
        toast('标签已更新');
        // 也更新详情显示的 meta
        if ($('detail-title') && state.currentDetailId) openConversationDetail(state.currentDetailId);
      } catch (e) {
        toast('保存失败：' + e.message, 'error');
      }
    });
  }

  /* —— 模态关闭按钮统一处理 —— */
  function setupModalClose() {
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-close-modal]')) {
        e.target.closest('.modal').classList.add('hidden');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllModals();
    });
  }

  /* =================================================================
     导入流程
     ================================================================= */

  let importParsedItems = null;

  function setupImport() {
    $('btn-import').addEventListener('click', () => {
      importParsedItems = null;
      $('import-file').value = '';
      $('import-preview').classList.add('hidden');
      $('import-confirm').disabled = true;
      setError('import-error', '');
      openModal('modal-import');
    });

    $$('.import-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.import-tab').forEach(t => t.classList.remove('active'));
        $$('.import-mode').forEach(m => m.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.importMode;
        $(`import-${mode}`).classList.add('active');
      });
    });

    $('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      $('import-preview').classList.remove('hidden');
      $('import-preview').innerHTML = '<span>正在解析…</span>';
      $('import-confirm').disabled = true;
      setError('import-error', '');
      try {
        const items = await window.ParserLayer.parseFile(file);
        if (items.length === 0) throw new Error('没有找到可导入的对话');
        importParsedItems = items;
        const totalMsgs = items.reduce((s, c) => s + c.messages.length, 0);
        $('import-preview').innerHTML = `解析成功：<strong>${items.length}</strong> 段对话，共 <strong>${totalMsgs}</strong> 条消息。`;
        $('import-confirm').disabled = false;
      } catch (e) {
        $('import-preview').classList.add('hidden');
        setError('import-error', e.message);
      }
    });

    $('import-confirm').addEventListener('click', async () => {
      if (!importParsedItems) return;
      const defaultTagsRaw = $('import-default-tags').value;
      const defaultTags = defaultTagsRaw.split(',').map(s => s.trim()).filter(Boolean);

      $('import-confirm').disabled = true;
      $('import-confirm').textContent = '正在导入…';
      setError('import-error', '');

      try {
        const itemsToInsert = importParsedItems.map(item => ({
          ...item,
          tags: [...(item.tags || []), ...defaultTags],
          source: 'claude_export'
        }));
        const n = await window.DataLayer.createConversationsBatch(itemsToInsert);
        toast(`已导入 ${n} 段对话`);
        closeModal('modal-import');
        await refreshConversations();
      } catch (e) {
        setError('import-error', e.message);
      } finally {
        $('import-confirm').disabled = false;
        $('import-confirm').textContent = '导入';
      }
    });

    $('manual-save').addEventListener('click', async () => {
      const title = $('manual-title').value.trim();
      const content = $('manual-content').value.trim();
      const date = $('manual-date').value;
      const tagsRaw = $('manual-tags').value;
      const tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean);

      setError('manual-error', '');

      if (!title) { setError('manual-error', '请填写标题'); return; }
      if (!content) { setError('manual-error', '内容不能为空'); return; }

      const item = window.ParserLayer.buildManualConversation({ title, content, date, tags });
      try {
        await window.DataLayer.createConversation({
          title: item.title,
          messages: item.messages,
          rawText: item.rawText,
          tags: tags,
          source: 'manual',
          conversationDate: item.conversationDate
        });
        toast('已保存');
        $('manual-title').value = '';
        $('manual-content').value = '';
        $('manual-date').value = '';
        $('manual-tags').value = '';
        closeModal('modal-import');
        await refreshConversations();
      } catch (e) {
        setError('manual-error', e.message);
      }
    });
  }

  /* =================================================================
     生成上下文卡片
     ================================================================= */

  function showCardStep(step) {
    $$('.card-step').forEach(s => s.classList.remove('active'));
    $(`card-step-${step}`).classList.add('active');
  }

  function renderCardSelectList(filter) {
    const container = $('card-select-list');
    container.innerHTML = '';
    const term = (filter || '').trim().toLowerCase();
    const items = state.conversations.filter(c => {
      if (!term) return true;
      return (c.title || '').toLowerCase().includes(term) ||
        (c.tags || []).some(t => t.toLowerCase().includes(term));
    });
    if (items.length === 0) {
      container.innerHTML = '<p style="color: var(--text-tertiary); padding: 20px; text-align: center">没有匹配的对话</p>';
      return;
    }
    items.forEach(item => {
      const checked = state.selectedCardSources.has(item.id);
      const div = document.createElement('label');
      div.className = 'select-item' + (checked ? ' selected' : '');
      div.innerHTML = `
        <input type="checkbox" ${checked ? 'checked' : ''} data-id="${item.id}">
        <div class="select-item-content">
          <div class="select-item-title">${escapeHtml(item.title)}</div>
          <div class="select-item-meta">${fmtDate(item.conversationDate || item.createdAt)} · ${fmtCount(item.messageCount || 0)} 条消息${item.tags && item.tags.length ? ' · ' + item.tags.map(escapeHtml).join('、') : ''}</div>
        </div>
      `;
      const cb = div.querySelector('input');
      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (state.selectedCardSources.size >= 20) {
            cb.checked = false;
            toast('一次最多 20 段', 'error');
            return;
          }
          state.selectedCardSources.add(item.id);
          div.classList.add('selected');
        } else {
          state.selectedCardSources.delete(item.id);
          div.classList.remove('selected');
        }
        $('card-selected-count').textContent = `已选 ${state.selectedCardSources.size}`;
        $('card-next').disabled = state.selectedCardSources.size === 0;
      });
      container.appendChild(div);
    });
  }

  function setupCardFlow() {
    $('btn-new-card').addEventListener('click', () => {
      if (state.conversations.length === 0) {
        toast('还没有对话，先导入一些', 'error');
        return;
      }
      state.selectedCardSources = new Set();
      $('card-selected-count').textContent = '已选 0';
      $('card-next').disabled = true;
      $('card-title').value = '';
      $('card-emphasis').value = '';
      $('card-result').value = '';
      setError('card-error', '');
      $('card-select-search').value = '';
      renderCardSelectList('');
      showCardStep('select');
      openModal('modal-card');
    });

    $('card-select-search').addEventListener('input', (e) => {
      renderCardSelectList(e.target.value);
    });

    $('card-next').addEventListener('click', () => {
      if (state.selectedCardSources.size === 0) return;
      // 默认标题
      if (!$('card-title').value) {
        const today = new Date();
        $('card-title').value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')} 上下文卡`;
      }
      showCardStep('config');
    });

    $('card-back').addEventListener('click', () => showCardStep('select'));

    $('card-generate').addEventListener('click', async () => {
      setError('card-error', '');
      const emphasis = $('card-emphasis').value.trim();
      const length = $('card-length').value;

      showCardStep('loading');

      try {
        // 拉取选中对话的完整内容
        const ids = Array.from(state.selectedCardSources);
        const fullConvs = await Promise.all(ids.map(id => window.DataLayer.getConversation(id)));

        // 拿 DeepSeek key
        const dsKey = window.App.getDeepseekKey();

        const cardText = await window.DeepSeekLayer.generateContextCard(
          dsKey,
          fullConvs,
          { length, emphasis }
        );

        $('card-result').value = cardText;
        showCardStep('result');
      } catch (e) {
        setError('card-error', e.message);
        showCardStep('config');
      }
    });

    $('card-regenerate').addEventListener('click', () => showCardStep('config'));

    $('card-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('card-result').value);
        toast('已复制到剪贴板');
      } catch (_) {
        toast('复制失败，请手动选中', 'error');
      }
    });

    $('card-save').addEventListener('click', async () => {
      const title = $('card-title').value.trim() || '(无标题)';
      const content = $('card-result').value.trim();
      if (!content) { toast('内容为空', 'error'); return; }
      try {
        await window.DataLayer.createCard({
          title,
          content,
          sourceIds: Array.from(state.selectedCardSources)
        });
        toast('卡片已保存');
        closeModal('modal-card');
        await refreshCards();
      } catch (e) {
        toast('保存失败：' + e.message, 'error');
      }
    });
  }

  /* =================================================================
     数据刷新
     ================================================================= */

  async function refreshConversations() {
    try {
      state.conversations = await window.DataLayer.listConversations();
      renderConversationList();
      renderTagFilter();
    } catch (e) {
      toast('加载对话失败：' + e.message, 'error');
    }
  }

  async function refreshCards() {
    try {
      state.cards = await window.DataLayer.listCards();
      renderCardList();
    } catch (e) {
      toast('加载卡片失败：' + e.message, 'error');
    }
  }

  async function refreshAll() {
    await Promise.all([refreshConversations(), refreshCards()]);
  }

  /* =================================================================
     初始化
     ================================================================= */

  function init() {
    setupTabs();
    setupSearch();
    setupDetailActions();
    setupModalClose();
    setupImport();
    setupCardFlow();
  }

  window.UI = {
    init,
    showView,
    toast,
    setError,
    refreshAll,
    refreshConversations,
    refreshCards
  };
})();
