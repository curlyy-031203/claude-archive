/* =================================================================
   deepseek.js · AI 摘要层
   调用 DeepSeek API 生成上下文卡片
   ================================================================= */

(function () {
  const API_URL = 'https://api.deepseek.com/v1/chat/completions';
  const MODEL = 'deepseek-chat';

  const LENGTH_TARGETS = {
    short: '300-500 字',
    medium: '600-1000 字',
    long: '1200-1800 字'
  };

  /* —— 拼接对话内容 —— */
  function formatConversationsForPrompt(convs) {
    return convs.map((c, i) => {
      const date = c.conversationDate
        ? new Date(c.conversationDate).toISOString().slice(0, 10)
        : '日期未知';
      const tags = (c.tags || []).join(', ') || '无';
      let body = '';
      if (c.messages && c.messages.length) {
        body = c.messages.map(m => {
          const role = m.role === 'user' || m.role === 'human' ? 'Scarlett' : 'Claude';
          return `${role}: ${m.text || ''}`;
        }).join('\n\n');
      } else if (c.rawText) {
        body = c.rawText;
      }
      return `\n----- 对话 ${i + 1} | ${date} | 标签：${tags} | 标题：${c.title} -----\n${body}\n`;
    }).join('\n');
  }

  /* —— 构造完整 prompt —— */
  function buildPrompt(conversations, options) {
    const length = LENGTH_TARGETS[options.length] || LENGTH_TARGETS.medium;
    const emphasis = options.emphasis ? options.emphasis.trim() : '';

    const systemPrompt = `你的任务：把下面的多段对话提炼成一张"上下文卡片"，给一个全新的 Claude 实例用。Scarlett（卷卷）会把这张卡片粘贴到新对话的开头，让新 Claude 能立刻接上她最近的状态。

要求：

1. 第一人称，从 Scarlett（卷卷）的角度写
2. 按主题分块。常见的块：【职业】【学术】【关系】【自我观察】【近期重要的事】等。块数视内容而定，一般 3-6 个块。每个块的标题用方括号包起来如【职业】，单独一行。
3. 总长度控制在 ${length} 之间
4. 只保留"被复述就会失真"的细节：
   - 具体事件（什么人、什么时间、做了什么、说了什么）
   - 具体感受（不是抽象的"我很难过"，而是"她朋友圈那张合照让我心跳了一下，但十分钟后就过去了"这种带身体感的描述）
   - 具体决定、判断和当下结论
5. 不要叙事化（不要"我跟 Claude 讨论了..." "在某次对话中..." 这种 meta 表达），直接陈述事实
6. 保留 Scarlett 的真实措辞（中英混用、985、核桃编程、自称"卷卷"、撒娇用语等）
7. 不要 meta 分析（不要写"这段对话表明..." "可以看出..."）
8. 不要 Markdown 符号（不要 # ** - 等），用纯文本+块标题的方式
9. 不要前言，不要后语，不要总结性收尾。直接从第一个块的标题开始写。
${emphasis ? `\n10. 这次特别强调：${emphasis}` : ''}

直接输出卡片本身。`;

    const userPrompt = `下面是要提炼的对话内容：

${formatConversationsForPrompt(conversations)}

请按上述要求输出上下文卡片。`;

    return { systemPrompt, userPrompt };
  }

  /* —— 调用 DeepSeek —— */
  async function generateContextCard(apiKey, conversations, options) {
    if (!apiKey) throw new Error('缺少 DeepSeek API key');
    if (!conversations || conversations.length === 0) throw new Error('没有可用对话');

    const { systemPrompt, userPrompt } = buildPrompt(conversations, options || {});

    const body = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.6,
      max_tokens: 4000
    };

    let response;
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('网络错误：' + e.message);
    }

    if (!response.ok) {
      let errText = `DeepSeek API 错误 (${response.status})`;
      try {
        const err = await response.json();
        if (err.error && err.error.message) errText += '：' + err.error.message;
      } catch (_) {}
      throw new Error(errText);
    }

    const data = await response.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('DeepSeek 返回了空响应');

    return text.trim();
  }

  window.DeepSeekLayer = {
    generateContextCard
  };
})();
