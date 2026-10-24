/*
 * ② 試合の登録・編集画面
 */
window.App = window.App || {};
App.screens = App.screens || {};

(function (App) {
  'use strict';

  const ui = App.ui;

  function detailPath(gameId) {
    return '#/games/' + encodeURIComponent(gameId);
  }

  App.screens.gameForm = {
    load: async function (params) {
      if (params.mode !== 'edit') return { game: null, paCount: 0 };
      const game = await App.store.getGame(params.gameId);
      if (!game) return { game: null, paCount: 0 };
      const plateAppearances = await App.store.listPlateAppearances({ gameId: game.id });
      return { game: game, paCount: plateAppearances.length };
    },

    header: function (params) {
      const isEdit = params.mode === 'edit';
      return {
        title: isEdit ? '試合を編集' : '試合を追加',
        back: isEdit ? detailPath(params.gameId) : '#/'
      };
    },

    render: function (main, params, data) {
      const isEdit = params.mode === 'edit';
      const game = data.game;

      if (isEdit && !game) {
        main.innerHTML = '<div class="empty">試合が見つかりませんでした。<br><a href="#/">ホームに戻る</a></div>';
        return;
      }

      const values = game || { date: ui.todayIso(), opponent: '', memo: '' };
      const cancelHref = isEdit ? detailPath(game.id) : '#/';

      main.innerHTML =
        '<form class="card form" id="game-form" novalidate>' +
          '<div class="field">' +
            '<label class="field__label" for="game-date">日付</label>' +
            '<input class="input" type="date" id="game-date" name="date" required value="' + ui.escapeHtml(values.date) + '">' +
            '<p class="field__error" id="date-error" hidden>日付を選んでください</p>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field__label" for="game-opponent">対戦相手</label>' +
            '<input class="input" type="text" id="game-opponent" name="opponent" required maxlength="40" ' +
              'placeholder="例：青葉クラブ" autocomplete="off" value="' + ui.escapeHtml(values.opponent) + '">' +
            '<p class="field__error" id="opponent-error" hidden>対戦相手を入力してください</p>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field__label" for="game-memo">メモ<span class="field__optional">任意</span></label>' +
            '<textarea class="input textarea" id="game-memo" name="memo" rows="3" maxlength="200" ' +
              'placeholder="例：球場名、練習試合など">' + ui.escapeHtml(values.memo) + '</textarea>' +
          '</div>' +
          '<p class="form__error" id="form-error" role="alert" hidden></p>' +
          '<div class="form__actions">' +
            '<button class="btn btn--primary btn--block btn--lg" type="submit" id="save-game">' +
              (isEdit ? '変更を保存する' : 'この試合を登録する') +
            '</button>' +
            '<a class="btn btn--ghost btn--block" href="' + cancelHref + '">キャンセル</a>' +
          '</div>' +
        '</form>' +
        (isEdit
          ? '<div class="danger-zone">' +
              '<button class="btn btn--danger btn--block" type="button" id="delete-game">この試合を削除</button>' +
            '</div>'
          : '');

      const form = main.querySelector('#game-form');
      const dateInput = form.querySelector('#game-date');
      const opponentInput = form.querySelector('#game-opponent');
      const memoInput = form.querySelector('#game-memo');
      const dateError = form.querySelector('#date-error');
      const opponentError = form.querySelector('#opponent-error');
      const formError = form.querySelector('#form-error');
      const saveButton = form.querySelector('#save-game');

      // 入力し直したらエラー表示を消す
      dateInput.addEventListener('input', function () { dateError.hidden = true; });
      opponentInput.addEventListener('input', function () { opponentError.hidden = true; });

      let saving = false;

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (saving) return; // 二重に押しても1回だけ保存する

        const input = {
          date: dateInput.value,
          opponent: opponentInput.value.trim(),
          memo: memoInput.value.trim()
        };

        dateError.hidden = input.date !== '';
        opponentError.hidden = input.opponent !== '';
        formError.hidden = true;
        if (!input.date) {
          dateInput.focus();
          return;
        }
        if (!input.opponent) {
          opponentInput.focus();
          return;
        }

        saving = true;
        saveButton.disabled = true;
        try {
          if (isEdit) {
            await App.store.updateGame(game.id, input);
            ui.toast('試合の情報を保存しました');
            location.hash = detailPath(game.id);
          } else {
            const created = await App.store.createGame(input);
            ui.toast('試合を登録しました');
            // 登録したら、そのまま打席を入力できる試合の画面へ
            location.hash = detailPath(created.id);
          }
        } catch (error) {
          formError.textContent = error.message;
          formError.hidden = false;
          saving = false;
          saveButton.disabled = false;
        }
      });

      const deleteButton = main.querySelector('#delete-game');
      if (deleteButton) {
        deleteButton.addEventListener('click', async function () {
          const message = 'vs ' + game.opponent + '（' + ui.formatDateShort(game.date) + '）を削除します。' +
            (data.paCount > 0 ? '\nこの試合の打席の記録（' + data.paCount + '打席）も削除されます。' : '') +
            '\n元に戻せません。よろしいですか？';
          if (!window.confirm(message)) return;

          deleteButton.disabled = true;
          try {
            await App.store.deleteGame(game.id);
            ui.toast('試合を削除しました');
            location.hash = '#/';
          } catch (error) {
            ui.toast(error.message);
            deleteButton.disabled = false;
          }
        });
      }
    }
  };
})(window.App);
