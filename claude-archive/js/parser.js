/* =================================================================
   parser.js · 解析 Claude.ai 导出文件
   支持 .zip（来自 Export Data）或直接 conversations.json
   ================================================================= */

(function () {
  /* —— 从单条 message 提取文本 —— */
  function extractMessageText(msg) {
    // 不同 Claude export 版本可能有不同字段名
    if (typeof msg.text === 'string') return msg.text;

    // 新格式：content 是数组，每项 { type: 'text', text: '...' }
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter(c => c.type === 'text' && typeof c.text === 'string')
        .map(c => c.text)
        .join('\n');
    }

    if (typeof msg.content === 'string') return msg.content;

    return '';
  }

  /* —— 把一条 Claude conversation 转为我们的格式 —— */
  function normalizeConversation(conv) {
    const messages = (conv.chat_messages || conv.messages || []).map(m => {
      const senderRaw = m.sender || m.role || 'unknown';
      const role = (senderRaw === 'human' || senderRaw === 'user') ? 'user' : 'assistant';
      return {
        role: role,
        text: extractMessageText(m),
        createdAt: m.created_at || m.createdAt || null
      };
    }).filter(m => m.text.length > 0);

    return {
      title: conv.name || conv.title || '(无标题)',
      conversationDate: conv.created_at || conv.createdAt || conv.updated_at || null,
      messages: messages,
      sourceUuid: conv.uuid || null
    };
  }

  /* —— 从 conversations.json 内容解析 —— */
  function parseConversationsJson(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('JSON 解析失败：' + e.message);
    }

    let convs;
    if (Array.isArray(data)) {
      convs = data;
    } else if (Array.isArray(data.conversations)) {
      convs = data.conversations;
    } else if (data.chat_messages || data.messages) {
      // 单个对话
      convs = [data];
    } else {
      throw new Error('未识别的 JSON 结构。Claude 导出包里需要的是 conversations.json');
    }

    return convs.map(normalizeConversation).filter(c => c.messages.length > 0);
  }

  /* —— 从 zip 中提取 conversations.json —— */
  async function parseZip(file) {
    if (!window.JSZip) throw new Error('JSZip 未加载');
    const zip = await window.JSZip.loadAsync(file);

    // 找到 conversations.json（可能在根或子目录）
    let target = null;
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      const filename = path.split('/').pop();
      if (filename === 'conversations.json') {
        target = entry;
      }
    });

    if (!target) {
      // 退路：找任何 *.json
      zip.forEach((path, entry) => {
        if (entry.dir) return;
        if (!target && path.endsWith('.json')) {
          target = entry;
        }
      });
    }

    if (!target) throw new Error('zip 里找不到 conversations.json');

    const text = await target.async('string');
    return parseConversationsJson(text);
  }

  /* —— 主入口：根据文件类型分发 —— */
  async function parseFile(file) {
    const name = (file.name || '').toLowerCase();

    if (name.endsWith('.zip')) {
      return parseZip(file);
    }

    if (name.endsWith('.json')) {
      const text = await file.text();
      return parseConversationsJson(text);
    }

    // 试试当 json 读
    try {
      const text = await file.text();
      return parseConversationsJson(text);
    } catch (e) {
      throw new Error('文件类型未识别（请上传 .zip 或 .json）');
    }
  }

  /* —— 手动粘贴：把整段文本作为单条对话 —— */
  function buildManualConversation({ title, content, date, tags }) {
    // 尝试识别简单格式：Human: ... \n Assistant: ...
    const messages = [];
    const lines = content.split(/\r?\n/);
    let currentRole = null;
    let currentText = [];

    const HUMAN_PREFIX = /^(?:human|user|me|i|我|scarlett|卷卷)\s*[:：]/i;
    const ASSISTANT_PREFIX = /^(?:assistant|claude|ai|gpt)\s*[:：]/i;

    function flush() {
      if (currentRole && currentText.length > 0) {
        messages.push({
          role: currentRole,
          text: currentText.join('\n').trim()
        });
      }
      currentText = [];
    }

    for (const line of lines) {
      if (HUMAN_PREFIX.test(line)) {
        flush();
        currentRole = 'user';
        currentText.push(line.replace(HUMAN_PREFIX, '').trim());
      } else if (ASSISTANT_PREFIX.test(line)) {
        flush();
        currentRole = 'assistant';
        currentText.push(line.replace(ASSISTANT_PREFIX, '').trim());
      } else if (currentRole) {
        currentText.push(line);
      }
    }
    flush();

    return {
      title: title || '(无标题)',
      conversationDate: date ? new Date(date).toISOString() : new Date().toISOString(),
      messages: messages,
      rawText: messages.length === 0 ? content : '',  // 无法识别角色就存原始文本
      tags: tags || []
    };
  }

  window.ParserLayer = {
    parseFile,
    parseConversationsJson,
    buildManualConversation
  };
})();
