/* =================================================================
   app.js · 主入口
   决定显示哪个视图、处理认证流程、协调各层
   ================================================================= */

(function () {
  let cryptoKey = null;
  let deepseekKey = null;

  /* —— 进入主界面 —— */
  async function enterMain() {
    window.UI.showView('main');
    await window.UI.refreshAll();
  }

  /* —— 完整解锁流程 —— */
  async function performUnlock(password) {
    cryptoKey = await window.StorageLayer.unlock(password);
    deepseekKey = await window.StorageLayer.getDeepseekKey(cryptoKey);

    const sb = window.StorageLayer.getSupabaseConfig();
    window.DataLayer.init(sb.url, sb.anonKey);
    window.DataLayer.setCryptoKey(cryptoKey);

    await window.DataLayer.testConnection();
  }

  /* —— Setup 表单 —— */
  function bindSetupForm() {
    $('setup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      window.UI.setError('setup-error', '');

      const supabaseUrl = $('setup-supabase-url').value.trim();
      const supabaseAnonKey = $('setup-supabase-anon').value.trim();
      const deepseekKeyInput = $('setup-deepseek-key').value.trim();
      const password = $('setup-password').value;
      const passwordConfirm = $('setup-password-confirm').value;

      if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
        window.UI.setError('setup-error', 'Supabase URL 看起来不对，应该是 https://xxxxx.supabase.co');
        return;
      }
      if (supabaseAnonKey.length < 50) {
        window.UI.setError('setup-error', 'Supabase anon key 太短了，确认下是不是复制完整了');
        return;
      }
      if (!deepseekKeyInput.startsWith('sk-')) {
        window.UI.setError('setup-error', 'DeepSeek API key 一般以 sk- 开头');
        return;
      }
      if (password.length < 12) {
        window.UI.setError('setup-error', '主密码至少 12 个字符');
        return;
      }
      if (password !== passwordConfirm) {
        window.UI.setError('setup-error', '两次输入的密码不一致');
        return;
      }

      const btn = $('setup-form').querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = '正在初始化…';

      try {
        // 1. 加密并存本地
        await window.StorageLayer.initialize({
          supabaseUrl,
          supabaseAnonKey,
          deepseekKey: deepseekKeyInput,
          password
        });

        // 2. 测试 Supabase 连接
        await performUnlock(password);

        window.UI.toast('初始化成功');
        await enterMain();
      } catch (e) {
        // 失败要清空 localStorage，避免下次直接到 unlock 但实际数据不通
        window.StorageLayer.clear();
        window.UI.setError('setup-error', '初始化失败：' + e.message);
        btn.disabled = false;
        btn.textContent = '初始化';
      }
    });
  }

  /* —— Unlock 表单 —— */
  function bindUnlockForm() {
    $('unlock-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      window.UI.setError('unlock-error', '');
      const password = $('unlock-password').value;
      const remember = $('unlock-remember').checked;
      if (!password) return;

      const btn = $('unlock-form').querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = '解锁中…';

      try {
        await performUnlock(password);
        if (remember) window.StorageLayer.rememberPasswordForSession(password);
        $('unlock-password').value = '';
        await enterMain();
      } catch (e) {
        window.UI.setError('unlock-error', e.message);
        btn.disabled = false;
        btn.textContent = '解锁';
      }
    });

    $('unlock-reset').addEventListener('click', () => {
      const ok = confirm('确定要重置吗？\n\n这会清空本地存的所有凭据（Supabase URL、anon key、加密的 DeepSeek key、salt），下次进来要重新填一遍。\n\n你存在 Supabase 里的对话和卡片不会被删，但如果你忘了主密码就解不开了。');
      if (!ok) return;
      window.StorageLayer.clear();
      location.reload();
    });
  }

  /* —— Lock 按钮 —— */
  function bindLockButton() {
    $('btn-lock').addEventListener('click', () => {
      window.StorageLayer.forgetSessionPassword();
      cryptoKey = null;
      deepseekKey = null;
      window.UI.showView('unlock');
      setTimeout(() => $('unlock-password').focus(), 50);
    });
  }

  /* —— 启动 —— */
  async function start() {
    window.UI.init();
    bindSetupForm();
    bindUnlockForm();
    bindLockButton();

    if (!window.StorageLayer.exists()) {
      window.UI.showView('setup');
      return;
    }

    // 检查 session 里有没有记着密码
    const remembered = window.StorageLayer.getRememberedPassword();
    if (remembered) {
      try {
        await performUnlock(remembered);
        await enterMain();
        return;
      } catch (_) {
        // 失败就回到 unlock
        window.StorageLayer.forgetSessionPassword();
      }
    }

    window.UI.showView('unlock');
    setTimeout(() => $('unlock-password').focus(), 50);
  }

  /* —— 对 UI 暴露 deepseek key 访问 —— */
  function getDeepseekKey() {
    if (!deepseekKey) throw new Error('未解锁');
    return deepseekKey;
  }

  /* —— 工具 —— */
  function $(id) { return document.getElementById(id); }

  window.App = { start, getDeepseekKey };

  document.addEventListener('DOMContentLoaded', start);
})();
