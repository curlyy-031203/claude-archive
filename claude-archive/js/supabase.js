/* =================================================================
   supabase.js · 数据库层
   conversations / context_cards 的加密 CRUD
   title 和 content 各自独立加密（IV 内嵌在密文里）
   ================================================================= */

(function () {
  let client = null;
  let cryptoKey = null;

  const SCHEMA_VERSION = 'v2'; // 标识 IV 内嵌方案，存到 iv 列做版本标记

  /* —— 初始化 Supabase 客户端 —— */
  function init(url, anonKey) {
    client = window.supabase.createClient(url, anonKey, {
      auth: { persistSession: false }
    });
  }

  function setCryptoKey(key) {
    cryptoKey = key;
  }

  function requireReady() {
    if (!client) throw new Error('Supabase 客户端未初始化');
    if (!cryptoKey) throw new Error('未解锁');
  }

  /* ============================================================
     Conversations
     ============================================================ */

  async function listConversations() {
    requireReady();
    const { data, error } = await client
      .from('conversations')
      .select('id, title_encrypted, tags, source, message_count, word_count, conversation_date, created_at, updated_at')
      .order('conversation_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 解密 title
    const rows = await Promise.all(data.map(async (row) => {
      let title = '(无标题)';
      try {
        title = await window.CryptoLayer.decryptCombined(cryptoKey, row.title_encrypted);
      } catch (e) {
        console.warn('解密 title 失败', row.id, e);
      }
      return {
        id: row.id,
        title: title,
        tags: row.tags || [],
        source: row.source,
        messageCount: row.message_count,
        wordCount: row.word_count,
        conversationDate: row.conversation_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    }));

    return rows;
  }

  async function getConversation(id) {
    requireReady();
    const { data, error } = await client
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    const title = await window.CryptoLayer.decryptCombined(cryptoKey, data.title_encrypted);
    const contentJson = await window.CryptoLayer.decryptCombined(cryptoKey, data.content_encrypted);
    const content = JSON.parse(contentJson);

    return {
      id: data.id,
      title: title,
      messages: content.messages || [],
      rawText: content.rawText || '',
      tags: data.tags || [],
      source: data.source,
      messageCount: data.message_count,
      wordCount: data.word_count,
      conversationDate: data.conversation_date,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async function createConversation({ title, messages, rawText, tags, source, conversationDate }) {
    requireReady();

    // 计算字数和消息数
    const messageCount = messages ? messages.length : 0;
    const wordCount = rawText
      ? rawText.length
      : (messages || []).reduce((s, m) => s + (m.text || '').length, 0);

    const titleEnc = await window.CryptoLayer.encryptCombined(cryptoKey, title || '(无标题)');
    const contentEnc = await window.CryptoLayer.encryptCombined(
      cryptoKey,
      JSON.stringify({
        messages: messages || [],
        rawText: rawText || ''
      })
    );

    const { data, error } = await client
      .from('conversations')
      .insert({
        title_encrypted: titleEnc,
        content_encrypted: contentEnc,
        iv: SCHEMA_VERSION,
        tags: tags || [],
        source: source || 'manual',
        message_count: messageCount,
        word_count: wordCount,
        conversation_date: conversationDate || new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  }

  async function createConversationsBatch(items) {
    requireReady();
    // 并发加密（控制在 10 条以内一组以免内存炸）
    const rows = [];
    for (const item of items) {
      const titleEnc = await window.CryptoLayer.encryptCombined(cryptoKey, item.title || '(无标题)');
      const contentEnc = await window.CryptoLayer.encryptCombined(
        cryptoKey,
        JSON.stringify({
          messages: item.messages || [],
          rawText: item.rawText || ''
        })
      );
      const wordCount = item.rawText
        ? item.rawText.length
        : (item.messages || []).reduce((s, m) => s + (m.text || '').length, 0);

      rows.push({
        title_encrypted: titleEnc,
        content_encrypted: contentEnc,
        iv: SCHEMA_VERSION,
        tags: item.tags || [],
        source: item.source || 'claude_export',
        message_count: (item.messages || []).length,
        word_count: wordCount,
        conversation_date: item.conversationDate || new Date().toISOString()
      });
    }

    // Supabase 分批插入（每批 100 条）
    const BATCH = 100;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const { error } = await client.from('conversations').insert(slice);
      if (error) throw error;
      inserted += slice.length;
    }
    return inserted;
  }

  async function updateConversationTags(id, tags) {
    requireReady();
    const { error } = await client
      .from('conversations')
      .update({ tags: tags, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async function deleteConversation(id) {
    requireReady();
    const { error } = await client.from('conversations').delete().eq('id', id);
    if (error) throw error;
  }

  /* ============================================================
     Context Cards
     ============================================================ */

  async function listCards() {
    requireReady();
    const { data, error } = await client
      .from('context_cards')
      .select('id, title_encrypted, source_conversation_ids, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = await Promise.all(data.map(async (row) => {
      let title = '(无标题)';
      try {
        title = await window.CryptoLayer.decryptCombined(cryptoKey, row.title_encrypted);
      } catch (e) {
        console.warn('解密 card title 失败', row.id, e);
      }
      return {
        id: row.id,
        title: title,
        sourceIds: row.source_conversation_ids || [],
        createdAt: row.created_at
      };
    }));

    return rows;
  }

  async function getCard(id) {
    requireReady();
    const { data, error } = await client.from('context_cards').select('*').eq('id', id).single();
    if (error) throw error;

    const title = await window.CryptoLayer.decryptCombined(cryptoKey, data.title_encrypted);
    const content = await window.CryptoLayer.decryptCombined(cryptoKey, data.content_encrypted);

    return {
      id: data.id,
      title: title,
      content: content,
      sourceIds: data.source_conversation_ids || [],
      createdAt: data.created_at
    };
  }

  async function createCard({ title, content, sourceIds }) {
    requireReady();
    const titleEnc = await window.CryptoLayer.encryptCombined(cryptoKey, title || '(无标题)');
    const contentEnc = await window.CryptoLayer.encryptCombined(cryptoKey, content || '');

    const { data, error } = await client
      .from('context_cards')
      .insert({
        title_encrypted: titleEnc,
        content_encrypted: contentEnc,
        iv: SCHEMA_VERSION,
        source_conversation_ids: sourceIds || []
      })
      .select()
      .single();
    if (error) throw error;
    return data.id;
  }

  async function deleteCard(id) {
    requireReady();
    const { error } = await client.from('context_cards').delete().eq('id', id);
    if (error) throw error;
  }

  /* —— 测试连接（解锁后调用） —— */
  async function testConnection() {
    requireReady();
    const { error } = await client.from('conversations').select('id').limit(1);
    if (error) throw error;
    return true;
  }

  window.DataLayer = {
    init,
    setCryptoKey,
    testConnection,
    listConversations,
    getConversation,
    createConversation,
    createConversationsBatch,
    updateConversationTags,
    deleteConversation,
    listCards,
    getCard,
    createCard,
    deleteCard
  };
})();
