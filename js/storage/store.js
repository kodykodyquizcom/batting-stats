/*
 * データの保存・取得・更新・削除をまとめた窓口（App.store）。
 *
 * 画面のコードはデータを扱うとき、必ずこのファイルの関数を使います。
 * 関数はすべて Promise を返す（await で待つ）形にしてあるので、
 * 将来サーバー保存に切り替えても、呼び出す側のコードはそのまま使えます。
 *
 * 保存するデータの形：
 * {
 *   schemaVersion: 1,                       … データ形式のバージョン
 *   players: [{ id, name, createdAt, updatedAt, deletedAt }],
 *   games: [{ id, date, opponent, memo, createdAt, updatedAt, deletedAt }],
 *   plateAppearances: [{ id, gameId, playerId, seq, result, rbi, createdAt, updatedAt, deletedAt }],
 *   settings: { currentPlayerId }
 * }
 *
 * 削除は「deletedAt（削除日時）」を入れるだけで、データ自体は残します。
 * こうしておくと、将来ほかの端末と同期するときに「削除したこと」も伝えられます。
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const SCHEMA_VERSION = 1;

  // データ形式を変えるときは、古い形式から新しい形式への変換をここに追加します。
  // 例）1: function (data) { ...バージョン1→2への変換...; return data; }
  const MIGRATIONS = {};

  const OPPONENT_MAX = 40;
  const MEMO_MAX = 200;

  let adapter = null;
  let db = null;

  // ---------- 小さな道具 ----------

  function nowIso() {
    return new Date().toISOString();
  }

  // 重ならないID（例：3f2b8c1e-...）を作る
  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  // 画面側でうっかり書き換えても保存データに影響しないよう、コピーを渡す
  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function emptyDb() {
    return {
      schemaVersion: SCHEMA_VERSION,
      players: [],
      games: [],
      plateAppearances: [],
      settings: { currentPlayerId: null }
    };
  }

  function isAlive(record) {
    return !record.deletedAt;
  }

  function findAlive(list, id) {
    return list.find(function (r) { return r.id === id && isAlive(r); }) || null;
  }

  function invalid(message) {
    return App.StorageError(message, 'INVALID');
  }

  function notFound(message) {
    return App.StorageError(message, 'NOT_FOUND');
  }

  // ---------- 読み込み時の準備 ----------

  function migrate(data) {
    let version = data.schemaVersion || 1;
    if (version > SCHEMA_VERSION) {
      throw App.StorageError('新しいバージョンのアプリで保存されたデータのため読み込めません。', 'TOO_NEW');
    }
    while (version < SCHEMA_VERSION) {
      data = MIGRATIONS[version](data);
      version += 1;
      data.schemaVersion = version;
    }
    return data;
  }

  function ensureShape(data) {
    const base = emptyDb();
    return {
      schemaVersion: data.schemaVersion,
      players: Array.isArray(data.players) ? data.players : base.players,
      games: Array.isArray(data.games) ? data.games : base.games,
      plateAppearances: Array.isArray(data.plateAppearances) ? data.plateAppearances : base.plateAppearances,
      settings: Object.assign(base.settings, data.settings)
    };
  }

  // 「自分」の選手データがなければ作る（将来の複数選手対応のため）
  function ensureCurrentPlayer(data) {
    if (findAlive(data.players, data.settings.currentPlayerId)) return;
    const now = nowIso();
    const player = { id: createId(), name: '自分', createdAt: now, updatedAt: now, deletedAt: null };
    data.players.push(player);
    data.settings.currentPlayerId = player.id;
  }

  // ---------- 変更と保存 ----------

  // データを変更して保存する。保存に失敗したら変更前の状態に戻す。
  async function commit(change) {
    const before = db;
    db = clone(db);
    try {
      const result = change(db);
      await adapter.save(db);
      return clone(result);
    } catch (e) {
      db = before;
      throw e;
    }
  }

  function requireReady() {
    if (!db) throw App.StorageError('データの準備ができていません。', 'NOT_READY');
  }

  // ---------- 入力チェック ----------

  function cleanGameInput(input, current) {
    const merged = Object.assign({}, current, input);
    const date = String(merged.date || '');
    const opponent = String(merged.opponent || '').trim();
    const memo = String(merged.memo || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) {
      throw invalid('日付が正しくありません。');
    }
    if (!opponent) throw invalid('対戦相手を入力してください。');
    if (opponent.length > OPPONENT_MAX) throw invalid('対戦相手は' + OPPONENT_MAX + '文字以内で入力してください。');
    if (memo.length > MEMO_MAX) throw invalid('メモは' + MEMO_MAX + '文字以内で入力してください。');

    return { date: date, opponent: opponent, memo: memo };
  }

  function cleanPlateAppearanceInput(input, current) {
    const merged = Object.assign({}, current, input);
    if (!App.getResultType(merged.result)) throw invalid('打席結果が正しくありません。');
    let rbi = Number(merged.rbi);
    if (App.RBI_OPTIONS.indexOf(rbi) === -1) throw invalid('打点は0〜4で選んでください。');
    // 本塁打は打者自身が生還するので、打点は最低1
    if (merged.result === 'homerun' && rbi === 0) rbi = 1;
    return { result: merged.result, rbi: rbi };
  }

  function compareGames(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1; // 新しい日付が先
    return a.createdAt < b.createdAt ? 1 : -1;
  }

  // ---------- バックアップ ----------

  const BACKUP_APP = 'batting-stats';
  const MAX_BACKUP_RECORDS = 200000;

  function isIsoDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value).getTime());
  }

  function isTimestamp(value) {
    return typeof value === 'string' && !isNaN(Date.parse(value));
  }

  // バックアップの中身を1件ずつ確認する（おかしなところがあれば、どこが悪いかを伝える）
  function validateRecords(data) {
    const playerIds = new Set();
    const gameIds = new Set();
    const paIds = new Set();

    function where(label, index) {
      return label + '（' + (index + 1) + '件目）';
    }

    function checkCommon(record, label, index, ids) {
      const name = where(label, index);
      if (!record || typeof record !== 'object') throw invalid(name + 'の形式が正しくありません。');
      if (typeof record.id !== 'string' || !record.id) throw invalid(name + 'にIDがありません。');
      if (ids.has(record.id)) throw invalid(name + 'のIDが重複しています。');
      ids.add(record.id);
      if (!isTimestamp(record.createdAt) || !isTimestamp(record.updatedAt)) throw invalid(name + 'の日時が正しくありません。');
      if (record.deletedAt == null) record.deletedAt = null;
      else if (!isTimestamp(record.deletedAt)) throw invalid(name + 'の削除日時が正しくありません。');
      return name;
    }

    data.players.forEach(function (player, i) {
      const name = checkCommon(player, '選手データ', i, playerIds);
      if (typeof player.name !== 'string' || !player.name.trim()) throw invalid(name + 'の名前がありません。');
    });

    data.games.forEach(function (game, i) {
      const name = checkCommon(game, '試合データ', i, gameIds);
      if (!isIsoDate(game.date)) throw invalid(name + 'の日付が正しくありません。');
      if (typeof game.opponent !== 'string' || !game.opponent.trim()) throw invalid(name + 'の対戦相手がありません。');
      if (game.opponent.length > OPPONENT_MAX) throw invalid(name + 'の対戦相手が長すぎます。');
      if (game.memo == null) game.memo = '';
      if (typeof game.memo !== 'string' || game.memo.length > MEMO_MAX) throw invalid(name + 'のメモが正しくありません。');
    });

    const gamesById = {};
    data.games.forEach(function (game) { gamesById[game.id] = game; });

    data.plateAppearances.forEach(function (pa, i) {
      const name = checkCommon(pa, '打席データ', i, paIds);
      if (!gameIds.has(pa.gameId)) throw invalid(name + 'の試合が見つかりません。');
      if (!playerIds.has(pa.playerId)) throw invalid(name + 'の選手が見つかりません。');
      if (!App.getResultType(pa.result)) throw invalid(name + 'の打席結果が正しくありません。');
      if (App.RBI_OPTIONS.indexOf(pa.rbi) === -1) throw invalid(name + 'の打点が正しくありません。');
      if (!Number.isInteger(pa.seq) || pa.seq < 1) throw invalid(name + 'の打席の順番が正しくありません。');
      // 削除済みの試合の打席は、打席も削除済みとして扱う
      const game = gamesById[pa.gameId];
      if (game.deletedAt && !pa.deletedAt) pa.deletedAt = game.deletedAt;
    });
  }

  // バックアップファイルの中身 → このアプリのデータ（おかしければエラー）
  function readBackup(backup) {
    if (!backup || typeof backup !== 'object' || backup.app !== BACKUP_APP || !backup.data || typeof backup.data !== 'object') {
      throw invalid('このアプリのバックアップファイルではありません。');
    }
    if (typeof backup.schemaVersion !== 'number') {
      throw invalid('バックアップファイルの形式が正しくありません（データ形式のバージョンがありません）。');
    }
    const source = backup.data;
    if (!Array.isArray(source.players) || !Array.isArray(source.games) || !Array.isArray(source.plateAppearances)) {
      throw invalid('バックアップファイルの形式が正しくありません（試合や打席のデータがありません）。');
    }
    if (source.players.length + source.games.length + source.plateAppearances.length > MAX_BACKUP_RECORDS) {
      throw invalid('バックアップファイルのデータが多すぎます。');
    }
    const copy = clone(source);
    copy.schemaVersion = backup.schemaVersion;
    const data = ensureShape(migrate(copy));
    validateRecords(data);
    ensureCurrentPlayer(data);
    return data;
  }

  // 「最後の書き出し」は新しいほうを残す（復元で「まだありません」に戻らないように）
  function latestTimestamp() {
    const list = Array.prototype.slice.call(arguments).filter(isTimestamp);
    if (!list.length) return null;
    return list.reduce(function (a, b) { return Date.parse(a) >= Date.parse(b) ? a : b; });
  }

  // 画面に出す「生きている」打席（削除されておらず、今の選手のもの）
  function alivePlateAppearances(data) {
    const playerId = data.settings.currentPlayerId;
    return data.plateAppearances.filter(function (pa) {
      return isAlive(pa) && pa.playerId === playerId;
    });
  }

  // ---------- 公開する関数 ----------

  App.store = {
    SCHEMA_VERSION: SCHEMA_VERSION,

    /**
     * 起動時に1回呼ぶ。保存先から読み込み、必要な準備をする。
     * 戻り値の warning に、利用者へ伝えるべき注意があれば入る。
     */
    init: async function (options) {
      adapter = (options && options.adapter) || App.createLocalStorageAdapter();
      let warning = null;
      let loaded = null;
      try {
        loaded = await adapter.load();
      } catch (e) {
        if (e.code !== 'CORRUPTED') throw e;
        warning = e.message;
      }
      const data = loaded ? ensureShape(migrate(loaded)) : emptyDb();
      ensureCurrentPlayer(data);
      await adapter.save(data);
      db = data;
      return { warning: warning };
    },

    // ----- 選手 -----

    getCurrentPlayer: async function () {
      requireReady();
      return clone(findAlive(db.players, db.settings.currentPlayerId));
    },

    // ----- 試合 -----

    /** 試合の一覧（新しい順） */
    listGames: async function () {
      requireReady();
      return clone(db.games.filter(isAlive).sort(compareGames));
    },

    /** 試合を1件取得（見つからなければ null） */
    getGame: async function (id) {
      requireReady();
      return clone(findAlive(db.games, id));
    },

    /** 試合を追加 */
    createGame: async function (input) {
      requireReady();
      const values = cleanGameInput(input, {});
      return commit(function (data) {
        const now = nowIso();
        const game = Object.assign({ id: createId() }, values, { createdAt: now, updatedAt: now, deletedAt: null });
        data.games.push(game);
        return game;
      });
    },

    /** 試合を更新（変えたい項目だけ渡せばよい） */
    updateGame: async function (id, changes) {
      requireReady();
      return commit(function (data) {
        const game = findAlive(data.games, id);
        if (!game) throw notFound('試合が見つかりません。');
        Object.assign(game, cleanGameInput(changes, game), { updatedAt: nowIso() });
        return game;
      });
    },

    /** 試合を削除（その試合の打席もまとめて削除） */
    deleteGame: async function (id) {
      requireReady();
      return commit(function (data) {
        const game = findAlive(data.games, id);
        if (!game) throw notFound('試合が見つかりません。');
        const now = nowIso();
        game.deletedAt = now;
        game.updatedAt = now;
        data.plateAppearances.forEach(function (pa) {
          if (pa.gameId === id && isAlive(pa)) {
            pa.deletedAt = now;
            pa.updatedAt = now;
          }
        });
        return null;
      });
    },

    // ----- 打席 -----

    /**
     * 打席の一覧（試合ごと・打席順）
     *   options.gameId を渡すと、その試合の打席だけを返す
     */
    listPlateAppearances: async function (options) {
      requireReady();
      const gameId = options && options.gameId;
      const playerId = db.settings.currentPlayerId;
      return clone(db.plateAppearances.filter(function (pa) {
        return isAlive(pa) && pa.playerId === playerId && (!gameId || pa.gameId === gameId);
      }).sort(function (a, b) {
        if (a.gameId !== b.gameId) return a.gameId < b.gameId ? -1 : 1;
        return a.seq - b.seq;
      }));
    },

    /** 打席を追加（打席の順番は自動で最後になる） */
    createPlateAppearance: async function (input) {
      requireReady();
      const values = cleanPlateAppearanceInput(input, {});
      return commit(function (data) {
        if (!findAlive(data.games, input.gameId)) throw notFound('試合が見つかりません。');
        const playerId = data.settings.currentPlayerId;
        const lastSeq = data.plateAppearances.reduce(function (max, pa) {
          return isAlive(pa) && pa.gameId === input.gameId && pa.playerId === playerId ? Math.max(max, pa.seq) : max;
        }, 0);
        const now = nowIso();
        const pa = Object.assign(
          { id: createId(), gameId: input.gameId, playerId: playerId, seq: lastSeq + 1 },
          values,
          { createdAt: now, updatedAt: now, deletedAt: null }
        );
        data.plateAppearances.push(pa);
        return pa;
      });
    },

    /** 打席の結果・打点を更新 */
    updatePlateAppearance: async function (id, changes) {
      requireReady();
      return commit(function (data) {
        const pa = findAlive(data.plateAppearances, id);
        if (!pa) throw notFound('打席が見つかりません。');
        Object.assign(pa, cleanPlateAppearanceInput(changes, pa), { updatedAt: nowIso() });
        return pa;
      });
    },

    /** 打席を削除 */
    deletePlateAppearance: async function (id) {
      requireReady();
      return commit(function (data) {
        const pa = findAlive(data.plateAppearances, id);
        if (!pa) throw notFound('打席が見つかりません。');
        const now = nowIso();
        pa.deletedAt = now;
        pa.updatedAt = now;
        return null;
      });
    },

    // ----- 全体 -----

    /** 保存しているデータの件数と容量 */
    getUsage: async function () {
      requireReady();
      return {
        storage: adapter.name,
        games: db.games.filter(isAlive).length,
        plateAppearances: db.plateAppearances.filter(isAlive).length,
        bytes: new Blob([JSON.stringify(db)]).size,
        lastExportedAt: db.settings.lastExportedAt || null
      };
    },

    // ----- バックアップ -----

    /** バックアップ用に、全データ（削除の記録も含む）をまとめて返す */
    exportData: async function () {
      requireReady();
      return {
        app: BACKUP_APP,
        kind: 'backup',
        schemaVersion: SCHEMA_VERSION,
        exportedAt: nowIso(),
        counts: {
          games: db.games.filter(isAlive).length,
          plateAppearances: alivePlateAppearances(db).length
        },
        data: clone({
          players: db.players,
          games: db.games,
          plateAppearances: db.plateAppearances,
          settings: db.settings
        })
      };
    },

    /** 書き出した日時を記録する（設定画面の「最後の書き出し」用） */
    markExported: async function () {
      requireReady();
      return commit(function (data) {
        data.settings.lastExportedAt = nowIso();
        return null;
      });
    },

    /**
     * バックアップファイルの中身を確認し、復元するとどうなるかを返す（まだ保存はしない）
     * おかしなファイルならエラーになる
     */
    describeBackup: async function (backup) {
      const data = readBackup(backup);
      return {
        exportedAt: isTimestamp(backup.exportedAt) ? backup.exportedAt : null,
        games: data.games.filter(isAlive).length,
        plateAppearances: clone(alivePlateAppearances(data))
      };
    },

    /** バックアップから復元する（今のデータは退避してから、すべて置き換える） */
    restoreBackup: async function (backup) {
      requireReady();
      const data = readBackup(backup);
      data.settings.lastExportedAt = latestTimestamp(db.settings.lastExportedAt, data.settings.lastExportedAt, backup.exportedAt);
      await adapter.saveSnapshot({ takenAt: nowIso(), data: db });
      await adapter.save(data);
      db = data;
      return {
        games: data.games.filter(isAlive).length,
        plateAppearances: alivePlateAppearances(data).length
      };
    },

    /** 「復元を取り消す」で戻せるデータの情報（なければ null） */
    getRestoreSnapshotInfo: async function () {
      requireReady();
      const snapshot = await adapter.loadSnapshot();
      if (!snapshot || !snapshot.data || !Array.isArray(snapshot.data.games)) return null;
      return {
        takenAt: snapshot.takenAt,
        games: snapshot.data.games.filter(isAlive).length,
        plateAppearances: snapshot.data.plateAppearances.filter(isAlive).length
      };
    },

    /** 復元する前のデータに戻す */
    undoRestore: async function () {
      requireReady();
      const snapshot = await adapter.loadSnapshot();
      if (!snapshot || !snapshot.data) throw notFound('戻せるデータがありません。');
      const data = ensureShape(migrate(snapshot.data));
      ensureCurrentPlayer(data);
      data.settings.lastExportedAt = latestTimestamp(db.settings.lastExportedAt, data.settings.lastExportedAt);
      await adapter.save(data);
      db = data;
      await adapter.clearSnapshot();
    },

    /** すべてのデータを消して、最初の状態に戻す */
    clearAll: async function () {
      requireReady();
      await adapter.clear();
      const data = emptyDb();
      ensureCurrentPlayer(data);
      await adapter.save(data);
      db = data;
    }
  };
})(window.App);
