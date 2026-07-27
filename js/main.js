/* ============================================================
   164 OFFICIAL WEB SITE — main.js

   このファイルがやっていること：
     1. data/news.json  を読み込んで NEWS 一覧を作る
     2. data/songs.json を読み込んで 楽曲一覧を作る
     3. ヘッダー / メニュー / スクロール演出を動かす

   ★ サイトの内容を更新するときに、このファイルを触る必要はありません。
     data フォルダの中の JSON を書き換えるだけでOKです。
   ============================================================ */

'use strict';

/* 最初に表示する NEWS の件数（「VIEW MORE」を押すと全件表示） */
const NEWS_INITIAL_COUNT = 6;


/* ============================================================
   共通の小さな道具
   ============================================================ */

/* 記号（< > & " '）を安全な文字に置き換える。
   JSONの文字にHTMLの記号が入っていても表示が壊れないようにするため。 */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* 日付の表示を整える
     "2020-06-26" → "2020.06.26"
     "2022-11"    → "2022.11"     ← 月までしか分からないニュース用
   JSONに "2022-11" と書けば、日付なしで表示できる。 */
function formatDate(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return escapeHtml(iso);
  return m[3] ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`;
}

/* JSONファイルを読み込む */
async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} が見つかりません (${res.status})`);
  return res.json();
}

/* 読み込みに失敗したときに、原因と対処法を画面に出す */
function showDataError(el, path) {
  el.innerHTML = `
    <div class="data-error">
      <strong>${escapeHtml(path)} を読み込めませんでした。</strong><br>
      HTMLファイルを直接ダブルクリックして開くと、ブラウザの安全機能により
      データファイルの読み込みがブロックされます。<br>
      ターミナルでこのフォルダを開き <code>python3 -m http.server 8000</code> を実行してから、
      <code>http://localhost:8000</code> にアクセスしてください。
    </div>`;
}


/* ============================================================
   1. NEWS
   ============================================================ */

const newsState = {
  items: [],       // JSONから読み込んだ全データ
  filter: 'ALL',   // 選択中のカテゴリ
  expanded: false  // 全件表示中かどうか
};

/* NEWS 1件分のHTMLを組み立てる */
function buildNewsItem(item) {
  const links = (item.links || [])
    .map(l => `<a class="news-item__link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label)} ↗</a>`)
    .join('');

  const body = item.body
    ? `<div class="news-item__body">${escapeHtml(item.body)}${links ? `<div class="news-item__links">${links}</div>` : ''}</div>`
    : (links ? `<div class="news-item__body"><div class="news-item__links">${links}</div></div>` : '');

  return `
    <details class="news-item">
      <summary class="news-item__head">
        <time class="news-item__date" datetime="${escapeHtml(item.date)}">${formatDate(item.date)}</time>
        <span class="news-item__cat" data-cat="${escapeHtml(item.category || 'INFO')}">${escapeHtml(item.category || 'INFO')}</span>
        <span class="news-item__title">${escapeHtml(item.title)}</span>
      </summary>
      ${body}
    </details>`;
}

/* NEWS一覧を描画する */
function renderNews() {
  const listEl = document.getElementById('newsList');
  const moreEl = document.getElementById('newsMore');

  /* カテゴリで絞り込み */
  const filtered = newsState.filter === 'ALL'
    ? newsState.items
    : newsState.items.filter(n => (n.category || 'INFO') === newsState.filter);

  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="loading">該当するお知らせはありません。</p>';
    moreEl.hidden = true;
    return;
  }

  /* 全件表示でなければ先頭N件だけ */
  const visible = newsState.expanded ? filtered : filtered.slice(0, NEWS_INITIAL_COUNT);
  listEl.innerHTML = visible.map(buildNewsItem).join('');

  /* 残りがある時だけボタンを出す */
  moreEl.hidden = filtered.length <= NEWS_INITIAL_COUNT;
  moreEl.textContent = newsState.expanded ? 'CLOSE' : 'VIEW MORE';
}

async function initNews() {
  const listEl = document.getElementById('newsList');
  try {
    const data = await loadJson('data/news.json');

    /* 日付の新しい順に自動で並べ替える
       → JSONにはどこに追記してもOK！ */
    newsState.items = data.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));

    renderNews();
  } catch (err) {
    console.error(err);
    showDataError(listEl, 'data/news.json');
    document.getElementById('newsMore').hidden = true;
    return;
  }

  /* カテゴリのボタン */
  document.getElementById('newsFilters').addEventListener('click', e => {
    const btn = e.target.closest('.filter');
    if (!btn) return;
    document.querySelectorAll('.filter').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    newsState.filter = btn.dataset.filter;
    newsState.expanded = false;
    renderNews();
  });

  /* もっと見る / 閉じる */
  document.getElementById('newsMore').addEventListener('click', () => {
    newsState.expanded = !newsState.expanded;
    renderNews();
    if (!newsState.expanded) {
      document.getElementById('news').scrollIntoView({ behavior: 'smooth' });
    }
  });
}


/* ============================================================
   2. VOCALOID SONGS
   ============================================================ */

/* maxresdefault が無い動画には120pxのダミー画像が返るので、
   この幅以下なら標準画質(hqdefault)に切り替える */
const THUMB_MIN_WIDTH = 160;

/* これ以下の明るさ(0-255)を「黒」とみなす。黒帯の判定に使う */
const BAR_LUMA = 26;

/* 帯を消すための拡大がこの倍率未満なら、誤差なので何もしない */
const BAR_MIN_SCALE = 1.02;

/* 検出は画像を縮小して行うため、帯の境目が1〜3px残ることがある。
   ほんの少し余分に拡大して確実に枠外へ追い出す（1.01 = 1%多く拡大） */
const BAR_OVERSCAN = 1.01;

const THUMB_RATIO = 16 / 9;   // サムネイル枠の縦横比（CSSの aspect-ratio と揃える）

const thumbUrl = (id, quality) => `https://img.youtube.com/vi/${id}/${quality}.jpg`;

function buildSongCard(song) {
  const id = escapeHtml(song.videoId);
  return `
    <a class="song-card" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">
      <div class="song-card__thumb">
        <img src="${thumbUrl(id, 'maxresdefault')}"
             data-video-id="${id}"
             alt="${escapeHtml(song.title)}"
             loading="lazy"
             crossorigin="anonymous">
        <span class="song-card__play" aria-hidden="true"></span>
      </div>
      <p class="song-card__title">${escapeHtml(song.title)}</p>
      ${song.year ? `<p class="song-card__year">${escapeHtml(song.year)}</p>` : ''}
    </a>`;
}


/* ------------------------------------------------------------
   サムネイルの黒帯を検出して、拡大表示で隠す

   動画によっては、映像そのものに黒帯が焼き込まれたサムネイルがある。
     ・シネスコ映像 → 上下に黒帯
     ・4:3の映像    → 左右に黒帯
   画像の端から「真っ黒な行・列」を数え、その分を拡大して枠の外に追い出す。
   ------------------------------------------------------------ */

/* 画像の四辺にある黒帯の厚みを、画像サイズに対する割合(0〜1)で返す */
function detectBars(img) {
  const W = 320;   // 大きいほど帯の境目を正確に取れる（16:9なら 320x180）
  const H = Math.max(2, Math.round(W * img.naturalHeight / img.naturalWidth));

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;   // 別ドメインの画像が読めない場合は例外

  const isDark = (x, y) => {
    const p = (y * W + x) * 4;
    return (d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000 <= BAR_LUMA;
  };
  const rowDark = y => { for (let x = 0; x < W; x++) if (!isDark(x, y)) return false; return true; };
  const colDark = x => { for (let y = 0; y < H; y++) if (!isDark(x, y)) return false; return true; };

  let top = 0, bottom = 0, left = 0, right = 0;
  while (top < H && rowDark(top)) top++;
  while (bottom < H && rowDark(H - 1 - bottom)) bottom++;
  while (left < W && colDark(left)) left++;
  while (right < W && colDark(W - 1 - right)) right++;

  return { top: top / H, bottom: bottom / H, left: left / W, right: right / W };
}

function trimLetterbox(img) {
  let bar;
  try {
    bar = detectBars(img);
  } catch (err) {
    return;   // 画素を読めなければ黒帯除去は諦める（表示自体は普通に出る）
  }

  const cw = 1 - bar.left - bar.right;    // 実写部分の幅（画像に対する割合）
  const ch = 1 - bar.top - bar.bottom;    // 実写部分の高さ
  if (cw <= 0.2 || ch <= 0.2) return;     // ほぼ真っ黒な画像は対象外

  /* object-fit: cover による切り取りを踏まえて計算する。
     枠の高さを1、幅を THUMB_RATIO とした座標系で考える。 */
  const A = THUMB_RATIO;
  const a = img.naturalWidth / img.naturalHeight;

  let x0, y0, boxW, boxH;
  if (a >= A) {                 // 画像が枠より横長 → 高さを合わせ、左右がはみ出す
    x0 = (A - a) / 2 + bar.left * a;
    y0 = bar.top;
    boxW = cw * a;
    boxH = ch;
  } else {                      // 画像が枠より縦長 → 幅を合わせ、上下がはみ出す
    x0 = bar.left * A;
    y0 = (1 - A / a) / 2 + bar.top * (A / a);
    boxW = cw * A;
    boxH = ch * (A / a);
  }

  const scale = Math.max(A / boxW, 1 / boxH) * BAR_OVERSCAN;
  if (scale < BAR_MIN_SCALE) return;

  /* 実写部分の中心を枠の中心に持ってくる（黒帯が上下で不均等な場合に効く） */
  const tx = -((x0 + boxW / 2) - A / 2) * scale / A * 100;
  const ty = -((y0 + boxH / 2) - 0.5) * scale * 100;

  img.style.setProperty('--thumb-scale', scale.toFixed(4));
  img.style.setProperty('--thumb-x', `${tx.toFixed(2)}%`);
  img.style.setProperty('--thumb-y', `${ty.toFixed(2)}%`);
}


/* 1枚のサムネイルの読み込みを管理する
   （画質の切り替え → 黒帯の除去 まで） */
function setupSongThumb(img) {
  const id = img.dataset.videoId;
  let quality = 'maxresdefault';
  let useCors = true;

  const reload = () => {
    if (useCors) img.crossOrigin = 'anonymous';
    else img.removeAttribute('crossorigin');
    img.src = thumbUrl(id, quality);
  };

  const onLoad = () => {
    // ダミー画像が返ってきていたら標準画質へ切り替える
    if (quality === 'maxresdefault' && img.naturalWidth > 0 && img.naturalWidth <= THUMB_MIN_WIDTH) {
      quality = 'hqdefault';
      reload();
      return;
    }
    trimLetterbox(img);
  };

  img.addEventListener('load', onLoad);
  img.addEventListener('error', () => {
    if (useCors) {
      useCors = false;   // CORSが原因の可能性 → 付けずに再挑戦（黒帯除去はできなくなる）
      reload();
    } else if (quality === 'maxresdefault') {
      quality = 'hqdefault';
      reload();
    }
  });

  if (img.complete && img.naturalWidth > 0) onLoad();   // 既に読み込み済みだった場合
}

async function initSongs() {
  const gridEl = document.getElementById('songGrid');
  try {
    const songs = await loadJson('data/songs.json');
    gridEl.innerHTML = songs.map(buildSongCard).join('');
    gridEl.querySelectorAll('.song-card__thumb img').forEach(setupSongThumb);
  } catch (err) {
    console.error(err);
    showDataError(gridEl, 'data/songs.json');
  }
}


/* ============================================================
   3. RESOURCES — インスト音源の配布リスト
   ============================================================ */

/* 形式とサイズの表示（例：ZIP · 427MB）。
   数百MBのファイルもあるため、押す前に分かるようにしている。 */
function buildInstRow(item) {
  const meta = [item.format, item.size].filter(Boolean).map(escapeHtml).join(' · ');
  return `
    <li class="inst-item">
      <span class="inst-item__title">${escapeHtml(item.title)}</span>
      ${meta ? `<span class="inst-item__meta">${meta}</span>` : ''}
      <a class="inst-item__dl" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" download>DOWNLOAD ↓</a>
    </li>`;
}

async function initInstrumentals() {
  const el = document.getElementById('instList');
  if (!el) return;

  try {
    const items = await loadJson('data/instrumentals.json');

    if (!Array.isArray(items) || items.length === 0) {
      el.innerHTML = '<p class="loading">現在準備中です。</p>';
      return;
    }
    el.innerHTML = `<ul class="inst-list">${items.map(buildInstRow).join('')}</ul>`;
  } catch (err) {
    console.error(err);
    showDataError(el, 'data/instrumentals.json');
  }
}


/* ============================================================
   4. CONTACT — お問い合わせフォーム
   ============================================================ */

/* ★★★ ここに Formspree の送信先アドレスを貼ってください ★★★

   GitHub Pages は「ファイルを置くだけ」の仕組みなので、
   サイト自身がメールを送ることはできません。
   そこで Formspree という無料サービスに中継してもらいます。

   手順（5分ほど）:
     1. https://formspree.io/ で無料登録（受け取りたいアドレスで登録）
     2. 「New Form」を作成
     3. 表示される送信先（https://formspree.io/f/xxxxxxxx）をコピー
     4. 下の '' の中に貼り付ける
     5. 初回だけ確認メールが届くので、リンクを押して有効化

   メールアドレスはこのファイルにも書きません。
   Formspree側に登録したアドレスへ届く仕組みです。            */
const FORM_ENDPOINT = 'https://formspree.io/f/xwvgwgrl';

function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  const statusEl = document.getElementById('cformStatus');
  const submitEl = form.querySelector('.cform__submit');

  const setStatus = (text, kind) => {
    statusEl.textContent = text;
    statusEl.className = 'cform__status' + (kind ? ` is-${kind}` : '');
  };

  /* 送信先が未設定のうちは、押せないようにして理由を表示する */
  if (!FORM_ENDPOINT) {
    submitEl.disabled = true;
    setStatus('準備中です（送信先の設定が未完了です）', 'error');
    return;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();

    if (!form.checkValidity()) {
      setStatus('必須項目（*）をご入力ください。', 'error');
      form.reportValidity();
      return;
    }

    submitEl.disabled = true;
    setStatus('送信中…');

    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(form)
      });

      if (!res.ok) throw new Error(`送信に失敗しました (${res.status})`);

      form.reset();
      setStatus('送信しました。お問い合わせありがとうございます。', 'ok');
    } catch (err) {
      console.error(err);
      setStatus('送信できませんでした。時間をおいて再度お試しください。', 'error');
    } finally {
      submitEl.disabled = false;
    }
  });
}


/* ============================================================
   5. ヘッダー・メニュー・スクロール演出
   ============================================================ */

/* ヘッダー左上のロゴの出し入れ。
   トップのおおきな164ロゴが画面から出たら表示し、戻ってきたら隠す。
   （ロゴ同士が同時に見えて重複するのを避けるため） */
function initHeaderBrand() {
  const header = document.getElementById('header');
  const target = document.querySelector('.hero__logo, .hero__logo-fallback')
              || document.querySelector('.hero__inner');
  if (!header || !target) return;

  // 対応していないブラウザでは、隠れっぱなしを避けて常に表示しておく
  if (!('IntersectionObserver' in window)) {
    header.classList.add('is-brand-visible');
    return;
  }

  /* 上端はヘッダーの高さぶん内側で判定する。
     ロゴがヘッダーの裏に潜り込んだ時点で「見えなくなった」と扱うため。 */
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      header.classList.toggle('is-brand-visible', !entry.isIntersecting);
    });
  }, { rootMargin: `-${header.offsetHeight}px 0px 0px 0px` });

  observer.observe(target);
}

/* 少しスクロールしたらヘッダーに背景を付ける */
function initHeader() {
  const header = document.getElementById('header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* スマホのハンバーガーメニュー */
function initNavToggle() {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('nav');

  const close = () => {
    toggle.classList.remove('is-open');
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  toggle.addEventListener('click', () => {
    const willOpen = !nav.classList.contains('is-open');
    toggle.classList.toggle('is-open', willOpen);
    nav.classList.toggle('is-open', willOpen);
    toggle.setAttribute('aria-expanded', String(willOpen));
    document.body.style.overflow = willOpen ? 'hidden' : '';
  });

  /* メニューのリンクを押したら閉じる */
  nav.addEventListener('click', e => { if (e.target.closest('.nav__link')) close(); });

  /* Escキーでも閉じる */
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

/* 今見ているセクションのメニューを光らせる */
function initScrollSpy() {
  const links = Array.from(document.querySelectorAll('.nav__link'));
  const sections = links
    .map(a => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  if (!('IntersectionObserver' in window) || sections.length === 0) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(a => {
        a.classList.toggle('is-current', a.getAttribute('href') === '#' + entry.target.id);
      });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });

  sections.forEach(s => observer.observe(s));
}

/* スクロールで要素をふわっと表示する */
function initReveal() {
  const targets = document.querySelectorAll('.section__title, .news-list, .filters, .song-grid, .subs, .acc-list, .about, .contact, .more-wrap');

  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      obs.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px' });

  targets.forEach(el => {
    el.classList.add('reveal');
    observer.observe(el);
  });
}


/* ============================================================
   起動
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initHeaderBrand();
  initNavToggle();
  initScrollSpy();
  initReveal();
  initNews();
  initSongs();
  initInstrumentals();
  initContactForm();
});
