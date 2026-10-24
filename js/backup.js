/*
 * バックアップ（ファイルの書き出し・読み込み）とCSV書き出し
 *
 * データの中身の確認や置き換えは js/storage/store.js が担当し、
 * このファイルは「ファイルを作る・読む」部分だけを担当します。
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // ファイル名用の日時（例：20261009-1830）
  function stamp(date) {
    return date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) +
      '-' + pad2(date.getHours()) + pad2(date.getMinutes());
  }

  // ファイルとして保存する（ブラウザのダウンロード）
  function downloadFile(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  // ----- JSON（バックアップ） -----

  /** 全試合・全打席をJSONファイルに書き出す。書き出した件数を返す */
  async function exportJson() {
    const backup = await App.store.exportData();
    const filename = 'batting-stats-backup-' + stamp(new Date()) + '.json';
    downloadFile(filename, JSON.stringify(backup, null, 2), 'application/json');
    await App.store.markExported();
    return { filename: filename, counts: backup.counts };
  }

  /** 選ばれたファイルを読み、中身（オブジェクト）を返す */
  async function readJsonFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error('ファイルが大きすぎます。書き出したバックアップファイルを選んでください。');
    }
    const text = await file.text();
    try {
      return JSON.parse(text.replace(/^﻿/, ''));
    } catch (e) {
      throw new Error('JSONファイルとして読み込めませんでした。このアプリで書き出したバックアップファイル（.json）を選んでください。');
    }
  }

  // ----- CSV（成績表） -----

  const CSV_COLUMNS = [
    ['打席', 'pa'], ['打数', 'ab'], ['安打', 'h'], ['打点', 'rbi'],
    ['単打', 'singles'], ['二塁打', 'doubles'], ['三塁打', 'triples'], ['本塁打', 'hr'], ['塁打', 'tb'],
    ['四球', 'bb'], ['死球', 'hbp'], ['三振', 'so'], ['犠打', 'sh'], ['犠飛', 'sf'],
    ['失策', 'roe'], ['野選', 'fc'], ['その他アウト', 'otherOuts']
  ];
  const RATE_COLUMNS = [['打率', 'avg'], ['出塁率', 'obp'], ['長打率', 'slg'], ['OPS', 'ops']];

  // 文字の項目は " で囲む。Excelで数式として動かないよう、= + - @ で始まる文字には ' を付ける
  function textField(value) {
    let text = String(value == null ? '' : value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function statFields(summary) {
    return CSV_COLUMNS.map(function (col) { return String(summary[col[1]]); })
      .concat(RATE_COLUMNS.map(function (col) { return App.ui.formatRate(summary[col[1]]); }));
  }

  /** 試合ごとの成績（古い順）と通算成績のCSVを作る */
  async function buildCsv() {
    const games = (await App.store.listGames()).reverse(); // 古い順
    const plateAppearances = await App.store.listPlateAppearances();
    const venueNames = {};
    const appearances = {};
    for (const game of games) {
      appearances[game.id] = await App.store.getAppearance(game.id);
      if (game.venueId && !(game.venueId in venueNames)) {
        const venue = await App.store.getVenue(game.venueId);
        venueNames[game.venueId] = venue ? venue.name : '';
      }
    }

    const byGame = {};
    plateAppearances.forEach(function (pa) {
      (byGame[pa.gameId] = byGame[pa.gameId] || []).push(pa);
    });

    const header = ['日付', '対戦相手', '試合区分', '球場', '出場', '打順', '守備位置']
      .concat(CSV_COLUMNS.map(function (c) { return c[0]; }))
      .concat(RATE_COLUMNS.map(function (c) { return c[0]; }))
      .concat(['メモ']);

    const rows = games.map(function (game) {
      const summary = App.stats.summarize(byGame[game.id] || []);
      const appearance = App.ui.appearanceText(appearances[game.id]);
      return [game.date, textField(game.opponent), textField(App.gameCategoryLabel(game.category)),
        textField(game.venueId ? venueNames[game.venueId] : ''),
        textField(appearance ? appearance.status : App.UNSET_LABEL),
        textField(appearance ? appearance.order : ''),
        textField(appearance ? appearance.positions : '')]
        .concat(statFields(summary)).concat([textField(game.memo)]);
    });

    const career = App.stats.summarize(plateAppearances);
    rows.push([textField('通算'), textField(games.length + '試合'), '""', '""', '""', '""', '""'].concat(statFields(career)).concat(['""']));

    const lines = [header.map(textField).join(',')].concat(rows.map(function (row) { return row.join(','); }));
    // 先頭の ﻿ は、Excelで開いたときに文字化けしないための印
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /** 成績をCSVファイルに書き出す。試合がなければ null */
  async function exportCsv() {
    const games = await App.store.listGames();
    if (!games.length) return null;
    const filename = 'batting-stats-' + stamp(new Date()) + '.csv';
    downloadFile(filename, await buildCsv(), 'text/csv');
    return { filename: filename, games: games.length };
  }

  App.backup = {
    exportJson: exportJson,
    readJsonFile: readJsonFile,
    buildCsv: buildCsv,
    exportCsv: exportCsv
  };
})(window.App);
