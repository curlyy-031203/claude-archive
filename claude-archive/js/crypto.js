/* =================================================================
   crypto.js · 加密层
   PBKDF2 派生密钥 + AES-GCM 加密
   主密码不存任何地方；密钥只活在内存里
   ================================================================= */

(function () {
  const PBKDF2_ITERATIONS = 250000;
  const KEY_LENGTH = 256;           // bits
  const SALT_LENGTH = 16;           // bytes
  const IV_LENGTH = 12;             // bytes (AES-GCM 推荐)

  /* —— base64 工具（兼容 Unicode） —— */
  function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function strToBytes(s) {
    return new TextEncoder().encode(s);
  }

  function bytesToStr(b) {
    return new TextDecoder().decode(b);
  }

  /* —— 生成随机盐 / IV —— */
  function generateSalt() {
    const salt = new Uint8Array(SALT_LENGTH);
    crypto.getRandomValues(salt);
    return bytesToBase64(salt);
  }

  function generateIV() {
    const iv = new Uint8Array(IV_LENGTH);
    crypto.getRandomValues(iv);
    return iv;
  }

  /* —— PBKDF2 派生主密钥 —— */
  async function deriveKey(password, saltBase64) {
    const salt = base64ToBytes(saltBase64);

    const baseKey = await crypto.subtle.importKey(
      'raw',
      strToBytes(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: KEY_LENGTH },
      false,                // 不可导出
      ['encrypt', 'decrypt']
    );
  }

  /* —— AES-GCM 加密 —— */
  async function encrypt(cryptoKey, plaintext) {
    const iv = generateIV();
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      strToBytes(plaintext)
    );
    return {
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    };
  }

  /* —— AES-GCM 解密 —— */
  async function decrypt(cryptoKey, ivBase64, ciphertextBase64) {
    const iv = base64ToBytes(ivBase64);
    const ciphertext = base64ToBytes(ciphertextBase64);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      ciphertext
    );
    return bytesToStr(new Uint8Array(plaintext));
  }

  /* —— 验证密码：尝试解密一个已知 token —— */
  async function verifyPassword(cryptoKey, ivBase64, ciphertextBase64, expectedPlain) {
    try {
      const plain = await decrypt(cryptoKey, ivBase64, ciphertextBase64);
      return plain === expectedPlain;
    } catch (_) {
      return false;
    }
  }

  /* —— 内嵌 IV 的加密 / 解密：返回 / 接受一个 base64 字符串 —— */
  async function encryptCombined(cryptoKey, plaintext) {
    const iv = generateIV();
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      strToBytes(plaintext)
    );
    const ctBytes = new Uint8Array(ciphertext);
    const combined = new Uint8Array(iv.length + ctBytes.length);
    combined.set(iv, 0);
    combined.set(ctBytes, iv.length);
    return bytesToBase64(combined);
  }

  async function decryptCombined(cryptoKey, combinedBase64) {
    const combined = base64ToBytes(combinedBase64);
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      ciphertext
    );
    return bytesToStr(new Uint8Array(plaintext));
  }

  /* —— 暴露 API —— */
  window.CryptoLayer = {
    generateSalt,
    deriveKey,
    encrypt,
    decrypt,
    encryptCombined,
    decryptCombined,
    verifyPassword,
    PBKDF2_ITERATIONS
  };
})();
