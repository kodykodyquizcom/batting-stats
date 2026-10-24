/*
 * 保存先「この端末のブラウザ（localStorage）」との読み書きだけを担当する部品。
 *
 * アプリの画面からは直接使わず、必ず js/storage/store.js を通して使います。
 * 将来サーバーに保存するときは、同じ形（load / save / clear）の部品を
 * もう1つ作って差し替えれば、画面側のコードは変えずに済みます。
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const DEFAULT_KEY = 'batting-stats/db';

  // 保存まわりのエラー（画面にそのまま表示できる日本語メッセージを持たせる）
  function StorageError(message, code, cause) {
    const error = new Error(message);
    error.name = 'StorageError';
    error.code = code || 'UNKNOWN';
    error.cause = cause;
    return error;
  }

  function createLocalStorageAdapter(key) {
    const storageKey = key || DEFAULT_KEY;

    function getStorage() {
      try {
        return window.localStorage;
      } catch (e) {
        throw StorageError('このブラウザではデータを保存できません。プライベートブラウズを解除してください。', 'UNAVAILABLE', e);
      }
    }

    return {
      name: 'localStorage',

      // 保存されているデータを読み込む（まだ何もなければ null）
      load: async function () {
        const raw = getStorage().getItem(storageKey);
        if (raw == null) return null;
        try {
          return JSON.parse(raw);
        } catch (e) {
          // 壊れたデータは消さずに別の名前で残しておく
          const backupKey = storageKey + '/broken-' + Date.now();
          try {
            getStorage().setItem(backupKey, raw);
          } catch (ignored) { /* 退避できなくても読み込み処理は続ける */ }
          throw StorageError('保存データが壊れていたため読み込めませんでした。元のデータは「' + backupKey + '」に残してあります。', 'CORRUPTED', e);
        }
      },

      // データ全体を保存する
      save: async function (data) {
        try {
          getStorage().setItem(storageKey, JSON.stringify(data));
        } catch (e) {
          throw StorageError('データを保存できませんでした。端末の空き容量が不足している可能性があります。', 'SAVE_FAILED', e);
        }
      },

      // 保存データを消す
      clear: async function () {
        getStorage().removeItem(storageKey);
      },

      // 復元する直前のデータを退避しておく（「復元を取り消す」用。1回分だけ）
      saveSnapshot: async function (snapshot) {
        try {
          getStorage().setItem(storageKey + '/before-restore', JSON.stringify(snapshot));
        } catch (e) {
          throw StorageError('今のデータを退避できなかったため、復元を中止しました。端末の空き容量を確認してください。', 'SAVE_FAILED', e);
        }
      },

      loadSnapshot: async function () {
        const raw = getStorage().getItem(storageKey + '/before-restore');
        if (raw == null) return null;
        try {
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      },

      clearSnapshot: async function () {
        getStorage().removeItem(storageKey + '/before-restore');
      },

      // データ形式を新しくする直前に、元のデータをそのままの形で退避する（最初の1回分だけ残す）
      saveMigrationBackup: async function (fromVersion, data) {
        const key = storageKey + '/before-migration-v' + fromVersion;
        if (getStorage().getItem(key) != null) return;
        try {
          getStorage().setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), data: data }));
        } catch (e) {
          throw StorageError('アプリの更新前に今のデータを退避できなかったため、更新を中止しました。記録はそのまま残っています。端末の空き容量を確認してください。', 'SAVE_FAILED', e);
        }
      }
    };
  }

  App.StorageError = StorageError;
  App.createLocalStorageAdapter = createLocalStorageAdapter;
})(window.App);
