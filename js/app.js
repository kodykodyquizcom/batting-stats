/*
 * アプリの起動と画面の切り替え
 *
 * URLの「#」より後ろを見て、表示する画面を決めます。
 *   #/                 → ホーム
 *   #/games/new        → 試合を追加
 *   #/games/{id}       → 試合の画面
 *   #/games/{id}/edit  → 試合を編集
 *   #/settings         → 設定
 * 画面を増やすときは、js/screens/ にファイルを作り、下の routes に1行追加します。
 */
(function (App) {
  'use strict';

  const ui = App.ui;

  const routes = [
    { pattern: /^\/$/, screen: 'home' },
    { pattern: /^\/games\/new$/, screen: 'gameForm', params: function () { return { mode: 'new' }; } },
    { pattern: /^\/games\/([^/]+)\/edit$/, screen: 'gameForm', params: function (m) { return { mode: 'edit', gameId: decodeURIComponent(m[1]) }; } },
    { pattern: /^\/games\/([^/]+)$/, screen: 'gameDetail', params: function (m) { return { gameId: decodeURIComponent(m[1]) }; } },
    { pattern: /^\/settings$/, screen: 'settings' }
  ];

  function currentPath() {
    return location.hash.replace(/^#/, '') || '/';
  }

  function matchRoute(path) {
    for (let i = 0; i < routes.length; i++) {
      const m = path.match(routes[i].pattern);
      if (m) {
        return { screen: routes[i].screen, params: routes[i].params ? routes[i].params(m) : {} };
      }
    }
    return null;
  }

  function renderHeader(config) {
    const left = config.back
      ? '<a class="header-btn header-btn--back" href="' + config.back + '">' + ui.icons.back + '<span>戻る</span></a>'
      : '';

    const center = config.brand
      ? '<div class="brand">' + ui.icons.ball +
          '<div class="brand__text"><span class="brand__title">打撃成績</span><span class="brand__sub">BATTING STATS</span></div>' +
        '</div>'
      : '<div class="header-title">' +
          '<span class="header-title__main">' + ui.escapeHtml(config.title) + '</span>' +
          (config.subtitle ? '<span class="header-title__sub">' + ui.escapeHtml(config.subtitle) + '</span>' : '') +
        '</div>';

    const right = (config.actions || []).map(function (action) {
      return action.text
        ? '<a class="header-btn header-btn--text" href="' + action.href + '">' + action.label + '</a>'
        : '<a class="header-btn" href="' + action.href + '" aria-label="' + action.label + '">' + action.icon + '</a>';
    }).join('');

    document.getElementById('app-header').innerHTML =
      '<div class="app-header__inner">' +
        '<div class="app-header__side">' + left + '</div>' +
        center +
        '<div class="app-header__side app-header__side--right">' + right + '</div>' +
      '</div>';
  }

  // 前の画面の中身とイベントを消すため、毎回新しい main に差し替える
  function freshMain() {
    const oldMain = document.getElementById('app-main');
    const main = document.createElement('main');
    main.id = 'app-main';
    main.className = 'app-main';
    oldMain.replaceWith(main);
    return main;
  }

  function renderError(error) {
    renderHeader({ brand: true });
    freshMain().innerHTML =
      '<div class="empty empty--error">' +
        '<strong>エラーが発生しました</strong><br>' + ui.escapeHtml(error.message || String(error)) +
      '</div>';
    console.error(error);
  }

  /*
   * 画面を表示する流れ
   *   1. URLから画面を決める
   *   2. その画面に必要なデータを読み込む（screen.load）
   *   3. ヘッダーと中身を描く（screen.header / screen.render）
   */
  let renderCount = 0;
  async function render(options) {
    options = options || {};
    const route = matchRoute(currentPath());
    if (!route) {
      location.replace('#/');
      return;
    }

    const myTurn = ++renderCount;
    const screen = App.screens[route.screen];

    let data;
    try {
      data = screen.load ? await screen.load(route.params) : null;
    } catch (error) {
      renderError(error);
      return;
    }
    // 読み込み中に別の画面へ移動していたら、古い画面は描かない
    if (myTurn !== renderCount) return;

    ui.closeSheet();
    const scrollY = window.scrollY;
    const header = screen.header(route.params, data);
    const main = freshMain();
    document.body.dataset.screen = route.screen;
    document.title = header.brand ? '打撃成績' : header.title + '｜打撃成績';
    renderHeader(header);
    screen.render(main, route.params, data, options);
    window.scrollTo(0, options.keepScroll ? scrollY : 0);
  }

  /*
   * 今の画面を最新のデータで描き直す（データを変更したあとに使う）
   * スクロール位置はそのまま。options は各画面の render に渡される。
   */
  App.refresh = function (options) {
    return render(Object.assign({ keepScroll: true }, options));
  };

  /*
   * サービスワーカー（電波がなくても開けるようにする仕組み）を登録する。
   * 新しいバージョンが公開されていたら「更新」ボタン付きのお知らせを出す。
   * ※ index.html をダブルクリックで開いたとき（file://）は使えないので何もしない。
   */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // 初めて開いたときは再読み込みしない。更新したときだけ新しい画面に読み直す
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });

    function offerUpdate(worker) {
      ui.toast('新しいバージョンがあります', {
        actionLabel: '更新',
        duration: 15000,
        onAction: function () { worker.postMessage('skipWaiting'); }
      });
    }

    navigator.serviceWorker.register('./sw.js').then(function (registration) {
      if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', function () {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function () {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
      // アプリを開いたまま戻ってきたときも、新しいバージョンがないか確認する
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') registration.update().catch(function () {});
      });
    }).catch(function (error) {
      console.error('サービスワーカーを登録できませんでした', error);
    });
  }

  // スマホの空き容量が少なくなっても、記録を勝手に消されにくくする
  function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () {});
    }
  }

  async function start() {
    try {
      const result = await App.store.init();
      if (result.warning) window.alert(result.warning);
    } catch (error) {
      renderError(error);
      return;
    }
    window.addEventListener('hashchange', function () { render(); });
    render();
    registerServiceWorker();
    requestPersistentStorage();
  }

  document.addEventListener('DOMContentLoaded', start);
})(window.App);
