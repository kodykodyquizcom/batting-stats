/*
 * サービスワーカー
 * アプリのファイルをスマホの中に保存しておき、電波がない球場でもアプリを開けるようにします。
 *
 * 【大事】アプリのファイルを直して公開し直すときは、下の CACHE_VERSION を必ず変えてください。
 *         変えないと、スマホには古いファイルが表示され続けます。
 */
const CACHE_VERSION = 'v1.3.0';
const CACHE_NAME = 'batting-stats-' + CACHE_VERSION;

// 保存しておくファイルの一覧（ファイルを増やしたら、ここにも追加する）
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/constants.js',
  './js/ui.js',
  './js/stats.js',
  './js/storage/local-storage-adapter.js',
  './js/storage/store.js',
  './js/backup.js',
  './js/screens/home.js',
  './js/screens/game-form.js',
  './js/screens/game-detail.js',
  './js/screens/analytics.js',
  './js/screens/settings.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

// インストール時：ファイルをまとめて保存（ブラウザの一時保存ではなく、必ず最新を取りに行く）
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_FILES.map(function (url) {
        return new Request(url, { cache: 'reload' });
      }));
    })
  );
});

// 画面の「更新」ボタンが押されたら、新しいバージョンに切り替える
self.addEventListener('message', function (event) {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// 切り替え時：古いバージョンの保存ファイルを消す
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf('batting-stats-') === 0 && key !== CACHE_NAME;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ファイルの読み込み：保存してあればそれを使い、なければインターネットから取る
self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function (cached) {
      return cached || fetch(request);
    })
  );
});
