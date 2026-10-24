/*
 * アプリ全体で使う「決まりごと」をまとめたファイル。
 * 打席結果の種類を増やしたり名前を変えたりするときは、ここだけを直せば
 * 入力ボタンや成績表示にも反映されるようにしています。
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  App.APP_VERSION = '1.0.0';

  /*
   * 打席結果の一覧（入力ボタンはこの順番で並びます）
   *   code       … データとして保存する名前（あとから変えないこと）
   *   label      … 画面に表示する名前
   *   short      … スコアブック風の1文字表記
   *   category   … ボタンの色分け（hit=安打 / walk=四死球 / sac=犠打・犠飛 / out=凡退）
   *   isAtBat    … 打数に数えるか
   *   isHit      … 安打に数えるか
   *   totalBases … 塁打数
   */
  App.RESULT_TYPES = [
    { code: 'single',          label: '単打',         short: '安', category: 'hit',  isAtBat: true,  isHit: true,  totalBases: 1 },
    { code: 'double',          label: '二塁打',       short: '二', category: 'hit',  isAtBat: true,  isHit: true,  totalBases: 2 },
    { code: 'triple',          label: '三塁打',       short: '三', category: 'hit',  isAtBat: true,  isHit: true,  totalBases: 3 },
    { code: 'homerun',         label: '本塁打',       short: '本', category: 'hit',  isAtBat: true,  isHit: true,  totalBases: 4 },
    { code: 'walk',            label: '四球',         short: '四', category: 'walk', isAtBat: false, isHit: false, totalBases: 0 },
    { code: 'hbp',             label: '死球',         short: '死', category: 'walk', isAtBat: false, isHit: false, totalBases: 0 },
    { code: 'strikeout',       label: '三振',         short: '振', category: 'out',  isAtBat: true,  isHit: false, totalBases: 0 },
    { code: 'sac_bunt',        label: '犠打',         short: '犠', category: 'sac',  isAtBat: false, isHit: false, totalBases: 0 },
    { code: 'sac_fly',         label: '犠飛',         short: '飛', category: 'sac',  isAtBat: false, isHit: false, totalBases: 0 },
    { code: 'error',           label: '失策',         short: '失', category: 'out',  isAtBat: true,  isHit: false, totalBases: 0 },
    { code: 'fielders_choice', label: '野選',         short: '野', category: 'out',  isAtBat: true,  isHit: false, totalBases: 0 },
    { code: 'out',             label: 'その他アウト', short: '凡', category: 'out',  isAtBat: true,  isHit: false, totalBases: 0 }
  ];

  // 1打席で選べる打点
  App.RBI_OPTIONS = [0, 1, 2, 3, 4];

  App.getResultType = function (code) {
    return App.RESULT_TYPES.find(function (type) { return type.code === code; });
  };
})(window.App);
