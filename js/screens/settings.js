/*
 * ④ 設定画面：バックアップ（書き出し・復元）・CSV書き出し・保存データ・アプリ情報
 */
window.App = window.App || {};
App.screens = App.screens || {};

(function (App) {
  'use strict';

  const ui = App.ui;

  function formatBytes(bytes) {
    return bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB';
  }

  function compareRow(label, before, after) {
    const changed = before !== after;
    return '<tr' + (changed ? ' class="is-changed"' : '') + '><th>' + label + '</th><td>' + before + '</td><td>' + after + '</td></tr>';
  }

  // 読み込めなかったときのパネル
  function openErrorSheet(message) {
    const sheet = ui.openSheet({
      title: '読み込めませんでした',
      body:
        '<div class="notice notice--error">' + ui.escapeHtml(message) + '</div>' +
        '<p class="card__text">今のデータは変更されていません。</p>' +
        '<div class="sheet__actions">' +
          '<button class="btn btn--outline btn--block" type="button" data-action="close">閉じる</button>' +
        '</div>'
    });
    sheet.querySelector('[data-action="close"]').addEventListener('click', ui.closeSheet);
  }

  // 復元前の確認パネル：今のデータと復元後のデータを並べて見せる
  async function openRestoreSheet(fileName, backup, preview) {
    const currentGames = (await App.store.listGames()).length;
    const currentPas = await App.store.listPlateAppearances();
    const now = App.stats.summarize(currentPas);
    const after = App.stats.summarize(preview.plateAppearances);

    const sheet = ui.openSheet({
      title: 'バックアップから復元',
      body:
        '<dl class="info-list info-list--compact">' +
          '<div><dt>ファイル</dt><dd class="break">' + ui.escapeHtml(fileName) + '</dd></div>' +
          '<div><dt>書き出した日時</dt><dd>' + (preview.exportedAt ? ui.formatDateTime(preview.exportedAt) : '不明') + '</dd></div>' +
        '</dl>' +
        '<div class="table-scroll">' +
          '<table class="restore-compare">' +
            '<thead><tr><th></th><th>今のデータ</th><th>復元後</th></tr></thead>' +
            '<tbody>' +
              compareRow('試合', currentGames + '件', preview.games + '件') +
              compareRow('打席', now.pa, after.pa) +
              compareRow('安打', now.h, after.h) +
              compareRow('打点', now.rbi, after.rbi) +
              compareRow('通算打率', ui.formatRate(now.avg), ui.formatRate(after.avg)) +
              compareRow('OPS', ui.formatRate(now.ops), ui.formatRate(after.ops)) +
            '</tbody>' +
          '</table>' +
        '</div>' +
        '<div class="notice notice--warn">' +
          '<strong>今のデータは、すべてこのバックアップの内容に置き換わります。</strong><br>' +
          '念のため今のデータは退避しておくので、設定画面の「復元を取り消して元に戻す」で1回だけ戻せます。' +
        '</div>' +
        '<div class="sheet__actions">' +
          '<button class="btn btn--primary btn--block btn--lg" type="button" data-action="restore">復元する</button>' +
          '<button class="btn btn--ghost btn--block" type="button" data-action="cancel">やめる</button>' +
        '</div>'
    });

    sheet.querySelector('[data-action="cancel"]').addEventListener('click', ui.closeSheet);

    const restoreButton = sheet.querySelector('[data-action="restore"]');
    restoreButton.addEventListener('click', async function () {
      restoreButton.disabled = true;
      try {
        const result = await App.store.restoreBackup(backup);
        ui.closeSheet();
        location.hash = '#/';
        ui.toast('復元しました（試合' + result.games + '件・打席' + result.plateAppearances + '件）');
      } catch (error) {
        ui.closeSheet();
        openErrorSheet(error.message);
      }
    });
  }

  App.screens.settings = {
    load: async function () {
      return {
        usage: await App.store.getUsage(),
        player: await App.store.getCurrentPlayer(),
        restoreInfo: await App.store.getRestoreSnapshotInfo()
      };
    },

    header: function () {
      return { title: '設定', back: '#/' };
    },

    render: function (main, params, data) {
      const usage = data.usage;
      const restoreInfo = data.restoreInfo;

      main.innerHTML =
        '<section class="card settings-card">' +
          '<h2 class="card__title">バックアップ</h2>' +
          '<p class="card__text">記録はこの端末のブラウザの中に保存されます。機種変更やブラウザのデータ削除に備えて、ときどきファイルに書き出しておきましょう。</p>' +
          '<div class="notice notice--info">' +
            '<strong>Macとスマホのデータは自動では同期されません。</strong><br>' +
            '別の端末にデータを移すときは、ここで書き出したファイルを移して「バックアップから復元」してください。' +
          '</div>' +
          '<p class="backup-last">最後の書き出し：' +
            (usage.lastExportedAt ? ui.formatDateTime(usage.lastExportedAt) : '<span class="backup-last__none">まだありません</span>') +
          '</p>' +
          '<div class="stack">' +
            '<button class="btn btn--primary btn--block" type="button" id="export-json">データを書き出す（JSON）</button>' +
            '<button class="btn btn--outline btn--block" type="button" id="import-json">バックアップから復元</button>' +
            '<input type="file" id="import-file" accept=".json,application/json" hidden>' +
          '</div>' +
        '</section>' +

        (restoreInfo
          ? '<section class="card settings-card">' +
              '<h2 class="card__title">復元の取り消し</h2>' +
              '<p class="card__text">' + ui.formatDateTime(restoreInfo.takenAt) + ' に復元する前のデータ（試合' +
                restoreInfo.games + '件・打席' + restoreInfo.plateAppearances + '件）に戻せます。</p>' +
              '<button class="btn btn--danger btn--block" type="button" id="undo-restore">復元を取り消して元に戻す</button>' +
            '</section>'
          : '') +

        '<section class="card settings-card">' +
          '<h2 class="card__title">成績をCSVで書き出す</h2>' +
          '<p class="card__text">試合ごとの成績と通算成績を、Excelやスプレッドシートで開ける表の形式で保存します。（CSVからの復元はできません）</p>' +
          '<button class="btn btn--outline btn--block" type="button" id="export-csv">成績をCSVで書き出す</button>' +
        '</section>' +

        '<section class="card settings-card">' +
          '<h2 class="card__title">保存データ</h2>' +
          '<dl class="info-list">' +
            '<div><dt>選手</dt><dd>' + ui.escapeHtml(data.player.name) + '</dd></div>' +
            '<div><dt>試合</dt><dd>' + usage.games + '件</dd></div>' +
            '<div><dt>球場</dt><dd>' + usage.venues + '件</dd></div>' +
            '<div><dt>打席</dt><dd>' + usage.plateAppearances + '件</dd></div>' +
            '<div><dt>使用容量</dt><dd>' + formatBytes(usage.bytes) + '</dd></div>' +
          '</dl>' +
        '</section>' +

        '<section class="card settings-card">' +
          '<h2 class="card__title">アプリ情報</h2>' +
          '<dl class="info-list">' +
            '<div><dt>バージョン</dt><dd>' + ui.escapeHtml(App.APP_VERSION) + '</dd></div>' +
            '<div><dt>データの保存先</dt><dd>この端末のブラウザ（端末ごとに別々）</dd></div>' +
            '<div><dt>データ形式</dt><dd>バージョン ' + App.store.SCHEMA_VERSION + '</dd></div>' +
          '</dl>' +
        '</section>';

      // ----- JSONに書き出す -----
      main.querySelector('#export-json').addEventListener('click', async function () {
        try {
          const result = await App.backup.exportJson();
          ui.toast('書き出しました（試合' + result.counts.games + '件・打席' + result.counts.plateAppearances + '件）');
          App.refresh();
        } catch (error) {
          ui.toast(error.message);
        }
      });

      // ----- バックアップから復元 -----
      const fileInput = main.querySelector('#import-file');
      main.querySelector('#import-json').addEventListener('click', function () {
        fileInput.click();
      });
      fileInput.addEventListener('change', async function () {
        const file = fileInput.files[0];
        fileInput.value = ''; // 同じファイルをもう一度選べるように
        if (!file) return;
        try {
          const backup = await App.backup.readJsonFile(file);
          const preview = await App.store.describeBackup(backup);
          await openRestoreSheet(file.name, backup, preview);
        } catch (error) {
          openErrorSheet(error.message);
        }
      });

      // ----- 復元を取り消す -----
      const undoButton = main.querySelector('#undo-restore');
      if (undoButton) {
        undoButton.addEventListener('click', async function () {
          if (!window.confirm('復元する前のデータに戻します。\n今のデータ（復元したデータ）は置き換わります。よろしいですか？')) return;
          try {
            await App.store.undoRestore();
            location.hash = '#/';
            ui.toast('復元する前のデータに戻しました');
          } catch (error) {
            ui.toast(error.message);
          }
        });
      }

      // ----- CSVに書き出す -----
      main.querySelector('#export-csv').addEventListener('click', async function () {
        try {
          const result = await App.backup.exportCsv();
          ui.toast(result ? '成績をCSVで書き出しました（' + result.games + '試合）' : '書き出す試合がありません');
        } catch (error) {
          ui.toast(error.message);
        }
      });
    }
  };
})(window.App);
