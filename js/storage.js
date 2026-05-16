/* =================================================================
   storage.js · 本地凭据存储
   localStorage 存配置（Supabase 凭据明文 + DeepSeek key 密文 + salt + verify token）
   不存主密码本身
   ================================================================= */

(function () {
  const STORAGE_KEY = 'claude_archive_config_v1';
  const VERIFY_PLAIN = 'archive_verify_v1';   // 用主密码加密这个字符串，用来验证下次输入的密码

  function read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function write(obj) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }

  function exists() {
    return read() !== null;
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('claude_archive_session_password');
  }

  /* —— 初始化：写入所有配置 —— */
  async function initialize({ supabaseUrl, supabaseAnonKey, deepseekKey, password }) {
    const salt = window.CryptoLayer.generateSalt();
    const cryptoKey = await window.CryptoLayer.deriveKey(password, salt);

    const deepseekEnc = await window.CryptoLayer.encrypt(cryptoKey, deepseekKey);
    const verifyEnc = await window.CryptoLayer.encrypt(cryptoKey, VERIFY_PLAIN);

    write({
      version: 1,
      supabaseUrl,
      supabaseAnonKey,
      salt,
      deepseekIv: deepseekEnc.iv,
      deepseekCt: deepseekEnc.ciphertext,
      verifyIv: verifyEnc.iv,
      verifyCt: verifyEnc.ciphertext,
      createdAt: new Date().toISOString()
    });

    return cryptoKey;
  }

  /* —— 解锁：用密码派生密钥并验证 —— */
  async function unlock(password) {
    const cfg = read();
    if (!cfg) throw new Error('未初始化');

    const cryptoKey = await window.CryptoLayer.deriveKey(password, cfg.salt);
    const ok = await window.CryptoLayer.verifyPassword(
      cryptoKey,
      cfg.verifyIv,
      cfg.verifyCt,
      VERIFY_PLAIN
    );

    if (!ok) throw new Error('密码错误');
    return cryptoKey;
  }

  /* —— 拿到解密后的 DeepSeek key —— */
  async function getDeepseekKey(cryptoKey) {
    const cfg = read();
    if (!cfg) throw new Error('未初始化');
    return window.CryptoLayer.decrypt(cryptoKey, cfg.deepseekIv, cfg.deepseekCt);
  }

  /* —— 拿 Supabase 凭据（不需要解密） —— */
  function getSupabaseConfig() {
    const cfg = read();
    if (!cfg) throw new Error('未初始化');
    return { url: cfg.supabaseUrl, anonKey: cfg.supabaseAnonKey };
  }

  /* —— 会话内记住密码（sessionStorage） —— */
  function rememberPasswordForSession(password) {
    sessionStorage.setItem('claude_archive_session_password', password);
  }

  function getRememberedPassword() {
    return sessionStorage.getItem('claude_archive_session_password');
  }

  function forgetSessionPassword() {
    sessionStorage.removeItem('claude_archive_session_password');
  }

  window.StorageLayer = {
    exists,
    clear,
    initialize,
    unlock,
    getDeepseekKey,
    getSupabaseConfig,
    rememberPasswordForSession,
    getRememberedPassword,
    forgetSessionPassword
  };
})();
