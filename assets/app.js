/* 讲道中文 · 설교로 배우는 중국어 — single-page app (no build step) */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const main = $("#main");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nl = (s) => esc(s).replace(/\n/g, "<br>");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast("저장 공간이 부족합니다: " + e.message); } },
  };

  // ---------- global state ----------
  const state = {
    dir: store.get("cp.dir", "ko2zh"),          // ko2zh: Korean speaker learning Chinese; zh2ko: the reverse
    pinyin: store.get("cp.pinyin", true),
    theme: store.get("cp.theme", null),
    index: null, cache: {}, local: store.get("cp.local", {}),
    srs: store.get("cp.srs", {}),
    quiz: store.get("cp.quiz", {}),
  };
  const L = () => state.dir === "ko2zh";   // true when UI should speak Korean, target = Chinese

  function applyPrefs() {
    $("#dir").value = state.dir;
    document.body.classList.toggle("no-pinyin", !state.pinyin);
    $("#pinyin-toggle").setAttribute("aria-pressed", String(state.pinyin));
    if (state.theme) document.documentElement.dataset.theme = state.theme; else delete document.documentElement.dataset.theme;
    document.documentElement.lang = L() ? "ko" : "zh";
  }
  $("#dir").addEventListener("change", (e) => { state.dir = e.target.value; store.set("cp.dir", state.dir); applyPrefs(); route(); });
  $("#pinyin-toggle").addEventListener("click", () => { state.pinyin = !state.pinyin; store.set("cp.pinyin", state.pinyin); applyPrefs(); });
  $("#theme-toggle").addEventListener("click", () => {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = state.theme || (dark ? "dark" : "light");
    state.theme = cur === "dark" ? "light" : "dark"; store.set("cp.theme", state.theme); applyPrefs();
  });

  let toastT; function toast(msg) {
    let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 3200);
  }

  // ---------- speech (browser TTS, free, offline) ----------
  const speak = (text, lang) => {
    if (!("speechSynthesis" in window)) return toast("이 브라우저는 음성 합성을 지원하지 않습니다");
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "zh" ? "zh-CN" : "ko-KR"; u.rate = 0.85;
    const v = speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang === "zh" ? "zh-cn" : "ko"));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-say]"); if (!b) return;
    speak(b.dataset.say, b.dataset.lang || "zh");
  });
  const sayBtn = (text, lang = "zh") => `<button class="speak" type="button" data-say="${esc(text)}" data-lang="${lang}" title="듣기 · 朗读">▶ ${lang === "zh" ? "读" : "듣기"}</button>`;

  // ---------- data ----------
  async function loadIndex() {
    if (state.index) return state.index;
    const r = await fetch("data/index.json", { cache: "no-cache" });
    state.index = await r.json();
    return state.index;
  }
  function allSermons() {
    const base = (state.index?.sermons || []).map((s) => ({ ...s }));
    const ids = new Set(base.map((s) => s.id));
    for (const [id, s] of Object.entries(state.local)) {
      const entry = { id, date: s.date, kind: s.kind, title: s.title, church: s.church, ref_ko: s.scripture?.ref_ko, ref_zh: s.scripture?.ref_zh,
        one_line: s.one_line, greeting: s.greeting, vocab_count: (s.vocab || []).length, paragraphs: s.paragraphs.length, local: true, video: s.video?.mp4 ? s.video : null };
      if (ids.has(id)) Object.assign(base.find((b) => b.id === id), entry); else base.push(entry);
    }
    return base.sort((a, b) => a.date.localeCompare(b.date));
  }
  async function loadSermon(id) {
    if (state.local[id]) return state.local[id];
    if (state.cache[id]) return state.cache[id];
    const meta = (await loadIndex()).sermons.find((s) => s.id === id);
    if (!meta || meta.placeholder) return null;
    const r = await fetch(meta.file); const d = await r.json();
    d.videoMeta = meta.video; d.videoKoMeta = meta.video_ko; d.videoRevMeta = meta.video_rev; d.cardMeta = meta.card; d.slideMeta = meta.slide; state.cache[id] = d; return d;
  }
  const fmtDate = (iso) => { const [y, m, d] = iso.split("-"); return `${y}.${m}.${d}`; };
  const weekday = (iso) => ["일", "월", "화", "수", "목", "금", "토"][new Date(iso + "T00:00:00").getDay()];

  // ---------- router ----------
  window.addEventListener("hashchange", route);
  async function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [seg, id, tab] = hash.split("/");
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === (seg || "home")));
    document.body.classList.toggle("screen", seg === "screen");
    main.innerHTML = `<p class="muted">불러오는 중…</p>`; main.onclick = null;
    try {
      if (seg === "s" && id) return await viewSermon(id, tab || "summary");
      if (seg === "vocab") return await viewVocab();
      if (seg === "review") return await viewReview();
      if (seg === "import") return viewImport();
      if (seg === "bible") return await viewBible(id, tab);
      if (seg === "screen" && id) return await viewScreen(id);
      if (seg === "challenge" && id) return await viewChallenge(id);
      return await viewHome();
    } catch (e) { console.error(e); main.innerHTML = `<div class="card"><h2>오류</h2><p>${esc(e.message)}</p></div>`; }
    finally { window.scrollTo(0, 0); }
  }

  // ---------- home ----------
  async function viewHome() {
    const idx = await loadIndex(); const sermons = allSermons();
    const latest = [...sermons].reverse().find((s) => !s.placeholder);
    const words = sermons.reduce((n, s) => n + (s.vocab_count || 0), 0);
    const due = dueCards().length;
    const pool = idx.daily || [];
    const dayN = Math.floor(Date.now() / 86400e3);
    let dailyI = (dayN + (store.get("cp.dailyOffset", 0))) % Math.max(1, pool.length);
    const dailyHtml = () => { const c = pool[dailyI]; if (!c) return ""; const src = sermons.find((x) => x.id === c.sid);
      return `<section class="daily" id="daily">
        <div><p class="eyebrow">오늘의 한 문장 · 今日一句 — ${fmtDate(new Date().toISOString().slice(0, 10))}</p>
          <p class="zh" lang="zh">${esc(c.zh)}</p>${c.pinyin ? `<p class="py">${esc(c.pinyin)}</p>` : ""}<p class="ko">${esc(c.ko)}</p>
          <p class="src">${c.kind === "greeting" ? "그 주의 인사말" : "설교 핵심 문장"} · <a href="#/s/${c.sid}/vocab">${src ? fmtDate(src.date) + " " + esc(src.title.ko) : c.sid}</a></p></div>
        <div class="actions">${sayBtn(c.zh)} ${sayBtn(c.ko, "ko")}<button class="btn" type="button" data-card="daily">이미지 카드</button><button class="btn" type="button" id="daily-next">다른 문장</button></div>
      </section>`; };
    main.innerHTML = dailyHtml() + `
      <section class="hero">
        <div>
          <p class="eyebrow">${esc(idx.church.ko)} · ${esc(idx.church.zh)} · 주일예배</p>
          <h1>${L() ? "이번 주 설교로 배우는 중국어" : "用主日讲道学韩语"}</h1>
          <p class="lede">${L()
            ? "매주 설교 원고(한국어·중국어 병행)를 요약하고, 설교에 실제로 나온 중국어 단어와 문장을 뽑아 학습 카드·퀴즈·요약 영상으로 만듭니다. 성경 본문은 개역개정과 和合本을 나란히 둡니다."
            : "每周把讲道稿（韩中对照）整理成摘要，并从讲道原文中挑出韩语词汇与句子，做成学习卡片、测验和摘要视频。经文并列显示和合本与韩语译本。"}</p>
          <div class="stat-row">
            <div class="stat"><b class="tabular">${sermons.filter((s) => !s.placeholder).length}</b><span>설교 · 讲道</span></div>
            <div class="stat"><b class="tabular">${words}</b><span>학습 단어 · 词语</span></div>
            <div class="stat"><b class="tabular">${sermons.filter((s) => s.video).length}</b><span>요약 영상 · 视频</span></div>
            <div class="stat"><b class="tabular">${due}</b><span>오늘 복습 · 待复习</span></div>
          </div>
        </div>
        ${latest ? `<aside class="hero-side">
          <p class="eyebrow">이번 주 인사 · 本周问候 — ${fmtDate(latest.date)}</p>
          ${latest.greeting ? `<p class="greeting-zh" lang="zh">${esc(latest.greeting.zh?.[0] || "")}</p><p class="muted">${esc(latest.greeting.ko?.[0] || "")}</p>
            <p style="margin-top:8px">${sayBtn(latest.greeting.zh?.[0] || "", "zh")} ${sayBtn(latest.greeting.ko?.[0] || "", "ko")}</p>`
            : `<p class="greeting-zh" lang="zh">${esc(latest.title.zh || "")}</p><p class="muted">${esc(latest.title.ko)}</p>`}
          <p style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap"><a class="btn primary" href="#/s/${latest.id}">이번 주 설교 열기 →</a><a class="btn" href="#/challenge/${latest.id}">🎙 30초 도전</a><a class="btn" href="#/screen/${latest.id}">▣ 예배 전 화면</a></p>
        </aside>` : ""}
      </section>
      <h2 style="margin-bottom:12px">주일 순서 · 主日顺序</h2>
      <p class="muted small" style="margin-bottom:12px">설교는 순서대로 이어지는 시리즈입니다. 8월 2일 "끊을 수 없는 사랑" → 8월 23일 "자리를 먼저 채우는 사람들" → 8월 30일 "소망으로 씨를 뿌리는 사람들" → 9월 6일 "보내는 사람들, 보냄받은 사람들". 앞 설교를 먼저 읽으면 다음 설교의 인용이 이해됩니다.</p>
      <div class="timeline">
        ${sermons.map((s) => s.placeholder ? `
          <div class="sunday placeholder">
            <div class="date">${weekday(s.date)}요일<b>${fmtDate(s.date)}</b></div>
            <div><div class="t-zh" lang="zh">${esc(s.title.zh)}</div><div class="t-ko">${esc(s.title.ko)}</div><div class="ref">${esc(s.ref_zh)} · ${esc(s.ref_ko)}</div></div>
            <div class="side"><span class="tag">${esc(s.note)}</span></div>
          </div>` : `
          <a class="sunday" href="#/s/${s.id}">
            <div class="date">${weekday(s.date)}요일<b>${fmtDate(s.date)}</b></div>
            <div><div class="t-zh" lang="zh">${esc(s.title.zh || "")}</div><div class="t-ko">${esc(s.title.ko)}</div><div class="ref">${esc(s.ref_zh)} · ${esc(s.ref_ko)}</div>
              ${s.one_line ? `<div class="small muted" style="margin-top:4px">${esc(L() ? s.one_line.ko : s.one_line.zh)}</div>` : ""}</div>
            <div class="side">
              ${s.kind === "kids" ? `<span class="tag kids">유치부 · 儿童</span>` : ""}
              ${s.local ? `<span class="tag local">내 기기에 저장됨</span>` : ""}
              ${s.video ? `<span class="tag video">▶ 영상 ${Math.round(s.video.duration || 0)}s</span>` : ""}
              <span>단어 ${s.vocab_count} · 단락 ${s.paragraphs}</span>
            </div>
          </a>`).join("")}
      </div>`;
    main.querySelector("#daily-next")?.addEventListener("click", () => { store.set("cp.dailyOffset", store.get("cp.dailyOffset", 0) + 1); dailyI = (dailyI + 1) % pool.length; $("#daily").outerHTML = dailyHtml(); bindDaily(); });
    const bindDaily = () => { main.querySelector("#daily-next")?.addEventListener("click", () => { store.set("cp.dailyOffset", store.get("cp.dailyOffset", 0) + 1); dailyI = (dailyI + 1) % pool.length; $("#daily").outerHTML = dailyHtml(); bindDaily(); });
      main.querySelector('[data-card="daily"]')?.addEventListener("click", () => { const c = pool[dailyI]; shareSentenceCard({ zh: c.zh, pinyin: c.pinyin, ko: c.ko, foot: (sermons.find((x) => x.id === c.sid)?.title.ko || "") + " · " + fmtDate(c.sid) }); }); };
    bindDaily();
  }

  // ---------- sermon ----------
  async function viewSermon(id, tab) {
    const s = await loadSermon(id);
    if (!s) { main.innerHTML = `<div class="card"><h2>자료 없음</h2><p>이 주일의 자료는 아직 가져오지 않았습니다. <a href="#/import">가져오기</a>에서 PPTX 또는 JSON을 추가하세요.</p></div>`; return; }
    const tabs = [["summary", "요약 · 摘要"], ["scripture", "본문 · 经文"], ["reader", "병행 읽기 · 对照"], ["vocab", "단어 · 词语"], ["practice", "연습 · 练习"], ["video", "영상 · 视频"]];
    main.innerHTML = `
      <div class="sermon-head">
        <div>
          <p class="eyebrow">${esc(s.church.ko)} · ${esc(s.church.zh)} · ${fmtDate(s.date)} ${s.kind === "kids" ? "· 유치부 예배" : "· 주일예배"}</p>
          <h1 class="t-zh" lang="zh">${esc(s.title.zh || "")}</h1>
          <div class="t-ko">${esc(s.title.ko)}</div>
          <div class="meta"><span class="ref">${esc(s.scripture.ref_zh)} · ${esc(s.scripture.ref_ko)}</span>
            ${s.greeting ? `<span>인사 · 问候: <b lang="zh">${esc(s.greeting.zh[0])}</b> ${sayBtn(s.greeting.zh[0])}</span>` : ""}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <a class="btn" href="#/challenge/${id}">🎙 30초 도전</a>
          <a class="btn" href="#/screen/${id}">▣ 화면</a>
          <button class="btn primary" type="button" id="share-btn">공유 카드</button>
          <button class="btn" type="button" id="export-json">JSON 내보내기</button>
          ${state.local[id] ? `<button class="btn bad" type="button" id="delete-local">기기에서 삭제</button>` : ""}
        </div>
      </div>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" data-tab="${k}">${l}</button>`).join("")}</div>
      <div class="panel" id="panel"></div>`;
    main.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { location.hash = `#/s/${id}/${b.dataset.tab}`; }));
    $("#export-json").addEventListener("click", () => download(`${id}.json`, JSON.stringify(s, null, 1)));
    $("#share-btn").addEventListener("click", () => { location.hash = `#/s/${id}/share`; });
    $("#delete-local")?.addEventListener("click", () => { if (confirm("이 기기에 저장된 설교 자료를 삭제할까요?")) { delete state.local[id]; store.set("cp.local", state.local); location.hash = "#/"; } });
    const panel = $("#panel");
    ({ summary: tabSummary, scripture: tabScripture, reader: tabReader, vocab: tabVocab, practice: tabPractice, video: tabVideo, share: tabShare }[tab] || tabSummary)(s, panel);
  }

  function tabSummary(s, el) {
    const ol = s.one_line || {}; const sm = s.summary || {};
    el.innerHTML = `
      <div class="card">
        <p class="eyebrow">한 문장 · 一句话</p>
        <p class="one-line"><span lang="zh">${esc(ol.zh)}</span> ${sayBtn(ol.zh)}<span class="ko">${esc(ol.ko)}</span></p>
      </div>
      <div class="card">
        <h2>요약 · 摘要</h2>
        <div class="two-col">
          <div class="lang-block"><span class="lbl ${L() ? "ko" : "zh"}">${L() ? "한국어" : "中文"}</span><p lang="${L() ? "ko" : "zh"}">${nl(L() ? sm.ko : sm.zh)}</p></div>
          <div class="lang-block"><span class="lbl ${L() ? "zh" : "ko"}">${L() ? "中文" : "한국어"}</span><p lang="${L() ? "zh" : "ko"}">${nl(L() ? sm.zh : sm.ko)}</p>${L() ? `<p style="margin-top:6px">${sayBtn(sm.zh)}</p>` : ""}</div>
        </div>
      </div>
      <div class="card">
        <h2>요점 · 要点</h2>
        <ol class="outline">${(s.outline || []).map((o) => `<li><div>
          <div class="hd"><span class="zh" lang="zh">${esc(o.heading_zh)}</span> · ${esc(o.heading_ko)}</div>
          <div class="bd"><span lang="zh">${esc(o.body_zh)}</span><br><span class="muted">${esc(o.body_ko)}</span></div></div></li>`).join("")}</ol>
      </div>
      ${s.corrections?.length ? `<div class="card"><h3>원문 교정 제안 · 原文校对</h3><p class="small muted">Gemini가 원고에서 발견한 오탈자입니다. 학습 자료에는 원문을 그대로 두었습니다.</p>
        <div class="table-wrap"><table><thead><tr><th>위치</th><th>원문</th><th>제안</th></tr></thead><tbody>
        ${s.corrections.map((c) => `<tr><td>${esc(c.where)}</td><td>${esc(c.found)}</td><td>${esc(c.suggest)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
      ${s.hymns?.length ? `<div class="card"><h3>이날 찬양 가사 · 当天赞美诗</h3><p class="small muted">가사 한 줄씩 병행 (${s.hymns.length}줄)</p>
        <div class="table-wrap"><table><tbody>${s.hymns.slice(0, 60).map((h) => `<tr><td lang="zh">${esc(h.zh)}</td><td class="muted">${esc(h.ko)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
  }

  function tabScripture(s, el) {
    const sc = s.scripture;
    el.innerHTML = `<div class="card">
      <h2 lang="zh">${esc(sc.ref_zh)} <span class="muted" style="font-family:var(--font-ko);font-size:1rem">${esc(sc.ref_ko)}</span></h2>
      <p class="small muted">${esc(sc.deck_zh_version || "和合本")} · ${esc(sc.deck_ko_version || "개역개정")}. 교회 화면에 띄운 본문을 그대로 쓰고, bolls.life의 和合本(CUNPS)·개역한글(KRV)과 대조했습니다. 다른 부분은 아래에 표시됩니다.</p>
      <div>${sc.verses.map((v) => `<div class="verse">
        <div class="n tabular">${v.n}</div>
        <div>
          <div class="zh" lang="zh">${esc(v.zh)} ${sayBtn(v.zh)}</div>
          ${v.pinyin ? `<span class="py">${esc(v.pinyin)}</span>` : ""}
          <div class="ko">${esc(v.ko)} ${sayBtn(v.ko, "ko")}</div>
          ${v.zh_cunps && v.zh_cunps !== v.zh ? `<div class="alt">和合本 CUNPS: <span lang="zh">${esc(v.zh_cunps)}</span></div>` : ""}
          ${v.ko_krv && v.ko_krv !== v.ko ? `<div class="alt">개역한글: ${esc(v.ko_krv)}</div>` : ""}
        </div></div>`).join("")}</div>
      <p style="margin-top:12px">${sayBtn(sc.verses.map((v) => v.zh).join(""), "zh")} 전체 듣기</p>
    </div>`;
  }

  function tabReader(s, el) {
    const vocabMap = new Map((s.vocab || []).map((w) => [w.zh, w]));
    const modes = [["both", "병행 · 对照"], ["reveal", L() ? "중국어만 보고 한국어 가리기" : "只看韩语，遮住中文"], ["zh", "中文"], ["ko", "한국어"]];
    const mode = store.get("cp.readerMode", "both");
    const mark = (zh) => {
      let html = esc(zh);
      for (const w of [...vocabMap.keys()].sort((a, b) => b.length - a.length)) {
        const v = vocabMap.get(w);
        html = html.split(w).join(`<span class="hl" title="${esc(v.pinyin)} · ${esc(v.ko)}">${w}</span>`);
      }
      return html.replace(/\n/g, "<br>");
    };
    el.innerHTML = `<div class="card">
      <div class="reader-tools"><span class="eyebrow">읽기 모드 · 阅读模式</span>
        ${modes.map(([k, l]) => `<button class="chip" type="button" data-mode="${k}" aria-pressed="${k === mode}">${l}</button>`).join("")}
        <span class="small muted">단어장에 있는 단어는 <span class="hl">이렇게</span> 표시됩니다. 가리기 모드에서는 단락을 클릭하면 번역이 보입니다.</span>
      </div>
      ${s.kind === "kids" ? `<p class="zh-machine">유치부 원고는 한국어만 있어 중국어는 Gemini 번역입니다 (機械翻訳 · 机器翻译).</p>` : ""}
      <div class="reader mode-${mode}" id="reader">
        ${s.paragraphs.map((p, i) => `<div class="para ${p.type === "passage" ? "passage" : ""}">
          <div class="idx">${i + 1} / ${s.paragraphs.length}${p.slide ? ` · slide ${p.slide}` : ""}</div>
          <div class="zh ${L() ? "" : "second"}" lang="zh">${mark(p.zh)} ${sayBtn(p.zh)}</div>
          <div class="ko ${L() ? "second" : ""}">${nl(p.ko)} ${sayBtn(p.ko, "ko")}</div>
        </div>`).join("")}
      </div></div>`;
    const reader = $("#reader");
    el.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      store.set("cp.readerMode", b.dataset.mode); reader.className = `reader mode-${b.dataset.mode}`;
      el.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }));
    reader.addEventListener("click", (e) => { const sec = e.target.closest(".second"); if (sec && !e.target.closest("[data-say]")) sec.classList.toggle("shown"); });
  }

  function tabVocab(s, el) {
    const zhWords = s.vocab || []; const koWords = s.ko_vocab || [];
    const primary = L() ? zhWords : koWords;
    el.innerHTML = `
      <div class="card">
        <div class="filters"><h2 style="margin-right:auto">${L() ? `중국어 단어 ${zhWords.length}` : `韩语词汇 ${koWords.length}`}</h2>
          <input id="vf" type="search" placeholder="검색 · 搜索">
          <button class="btn" type="button" id="add-all">전체 플래시카드에 추가</button>
          <button class="btn" type="button" id="csv">CSV (Anki)</button></div>
        <p class="small muted" style="margin:6px 0 12px">${L() ? "설교 원문에 실제로 나온 문장이 예문입니다. 금색 테두리는 요약 영상에 나오는 5개 단어입니다." : "例句均来自讲道原文。"}</p>
        <div class="vocab-grid" id="vg">${primary.map((w, i) => L() ? zhCard(w, i, s.id) : koCard(w, i, s.id)).join("")}</div>
      </div>
      <div class="card"><h2>핵심 문장 · 关键句 (따라 읽기 · 跟读)</h2>
        <ol class="keysent">${(s.key_sentences || []).map((k, i) => `<li><div class="zh" lang="zh">${esc(k.zh)} ${sayBtn(k.zh)} <button class="speak" type="button" data-kcard="${i}" title="이미지 카드로 저장·공유">▣ 카드</button></div><span class="py">${esc(k.pinyin || "")}</span><div class="ko">${esc(k.ko)} ${sayBtn(k.ko, "ko")}</div>${k.why_ko ? `<div class="why">${esc(k.why_ko)}</div>` : ""}</li>`).join("")}</ol></div>
      <div class="card"><h2>문형 · 句型</h2>
        <div class="grammar">${(s.grammar || []).map((g) => `<div class="word"><div class="pat" lang="zh">${esc(g.pattern)}</div><div class="small">${esc(g.explain_ko)}</div><div class="ex"><span class="zh" lang="zh">${esc(g.example_zh)}</span><br><span class="muted">${esc(g.example_ko)}</span></div></div>`).join("")}</div></div>
      ${L() && koWords.length ? `<div class="card"><h3>중국어 화자를 위한 한국어 단어 · 给中文使用者的韩语词</h3><div class="vocab-grid">${koWords.map((w, i) => koCard(w, i, s.id)).join("")}</div></div>` : ""}
      ${!L() && zhWords.length ? `<div class="card"><h3>给韩语使用者的中文词 · 한국어 화자를 위한 중국어 단어</h3><div class="vocab-grid">${zhWords.map((w, i) => zhCard(w, i, s.id)).join("")}</div></div>` : ""}`;
    el.querySelectorAll("[data-kcard]").forEach((b) => b.addEventListener("click", () => { const k = s.key_sentences[+b.dataset.kcard]; shareSentenceCard({ zh: k.zh, pinyin: k.pinyin, ko: k.ko, foot: `${s.title.ko} · ${fmtDate(s.date)}` }); }));
    $("#vf").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      el.querySelectorAll("#vg .word").forEach((c) => { c.classList.toggle("hidden", q && !c.textContent.toLowerCase().includes(q)); });
    });
    $("#add-all").addEventListener("click", () => { primary.forEach((w) => addCard(s.id, w, L() ? "zh" : "ko")); toast(`${primary.length}개 카드 추가됨`); refreshCardButtons(el); });
    $("#csv").addEventListener("click", () => {
      const rows = L() ? zhWords.map((w) => [w.zh, w.pinyin, w.ko, w.example_zh, w.example_ko]) : koWords.map((w) => [w.ko, w.zh, w.example_ko, w.example_zh]);
      download(`${s.id}-vocab.csv`, "﻿" + rows.map((r) => r.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n"));
    });
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-add]"); if (!b) return;
      const [lang, i] = b.dataset.add.split(":"); const w = (lang === "zh" ? zhWords : koWords)[+i];
      const key = cardKey(s.id, w, lang);
      if (state.srs[key]) { delete state.srs[key]; toast("카드 제거됨"); } else { addCard(s.id, w, lang); toast("플래시카드에 추가됨"); }
      store.set("cp.srs", state.srs); refreshCardButtons(el);
    });
    refreshCardButtons(el);
  }
  const zhCard = (w, i, sid) => `<div class="word ${w.video ? "video-pick" : ""}" data-key="${esc(cardKey(sid, w, "zh"))}">
      <div class="w"><span lang="zh">${esc(w.zh)}</span><span class="py">${esc(w.pinyin || "")}</span>${sayBtn(w.zh)}</div>
      <div class="m">${esc(w.ko)}</div>
      <div class="meta"><span>${esc(w.pos || "")}</span><span>HSK ${esc(w.hsk || "-")}</span>${w.video ? `<span style="color:var(--gold)">▶ 영상 단어</span>` : ""}</div>
      ${w.note_ko ? `<div class="note">${esc(w.note_ko)}</div>` : ""}
      ${bridgeHtml(w.bridge)}
      ${w.example_zh ? `<div class="ex"><span class="zh" lang="zh">${esc(w.example_zh)}</span> ${sayBtn(w.example_zh)}<br><span>${esc(w.example_ko || "")}</span></div>` : ""}
      <div class="actions"><button class="mini" type="button" data-add="zh:${i}">＋ 플래시카드</button></div></div>`;
  const REL = { same: "같은 한자어", similar: "비슷한 한자어", different: "뜻 같음·글자 다름", none: "한자어 아님" };
  const bridgeHtml = (b) => !b || !b.relation ? "" : `<div class="bridge" title="한자어 다리: 한국어 한자어와 이어서 외우기"><span class="rel ${esc(b.relation)}">${REL[b.relation] || esc(b.relation)}</span>
      <span class="hanja" lang="zh">${esc(b.hanja || "")}</span>${b.ko_reading ? `<span class="muted">${esc(b.ko_reading)}</span>` : ""}${b.ko_word ? `<span>→ <b>${esc(b.ko_word)}</b></span>` : ""}
      ${b.note_ko ? `<span class="note">${esc(b.note_ko)}</span>` : ""}</div>`;
  const koCard = (w, i, sid) => `<div class="word" data-key="${esc(cardKey(sid, w, "ko"))}">
      <div class="w" style="font-family:var(--font-ko)">${esc(w.ko)} ${sayBtn(w.ko, "ko")}</div>
      <div class="m" lang="zh">${esc(w.zh)}</div>
      ${w.note_zh ? `<div class="note" lang="zh">${esc(w.note_zh)}</div>` : ""}
      ${w.example_ko ? `<div class="ex"><span>${esc(w.example_ko)}</span> ${sayBtn(w.example_ko, "ko")}<br><span lang="zh">${esc(w.example_zh || "")}</span></div>` : ""}
      <div class="actions"><button class="mini" type="button" data-add="ko:${i}">＋ 闪卡</button></div></div>`;
  function refreshCardButtons(el) {
    el.querySelectorAll(".word[data-key]").forEach((c) => { const b = c.querySelector("[data-add]"); if (b) { const on = !!state.srs[c.dataset.key]; b.classList.toggle("on", on); b.textContent = on ? "✓ 카드에 있음" : (b.dataset.add.startsWith("zh") ? "＋ 플래시카드" : "＋ 闪卡"); } });
  }

  // ---------- spaced repetition (Leitner boxes 0–5) ----------
  const cardKey = (sid, w, lang) => `${lang}:${lang === "zh" ? w.zh : w.ko}`;
  function addCard(sid, w, lang) {
    const key = cardKey(sid, w, lang);
    if (!state.srs[key]) state.srs[key] = { front: lang === "zh" ? w.zh : w.ko, back: lang === "zh" ? w.ko : w.zh, py: w.pinyin || "", ex: lang === "zh" ? w.example_zh : w.example_ko, exb: lang === "zh" ? w.example_ko : w.example_zh, lang, sid, box: 0, due: Date.now(), reps: 0 };
    store.set("cp.srs", state.srs);
  }
  const BOX_DAYS = [0, 1, 3, 7, 14, 30];
  const dueCards = () => Object.entries(state.srs).filter(([, c]) => c.due <= Date.now()).map(([k, c]) => ({ key: k, ...c }));
  function grade(key, ok) {
    const c = state.srs[key]; if (!c) return;
    c.box = ok ? Math.min(5, c.box + 1) : 0; c.reps++;
    c.due = Date.now() + BOX_DAYS[c.box] * 86400e3 + (ok ? 0 : 10 * 60e3);
    store.set("cp.srs", state.srs);
  }

  function tabPractice(s, el) {
    const quiz = s.quiz || [];
    const saved = state.quiz[s.id];
    el.innerHTML = `
      <div class="card"><h2>플래시카드 · 闪卡</h2>
        <p class="small muted">이 설교의 단어로 바로 연습합니다. 전체 복습 대기열은 <a href="#/review">복습</a> 메뉴에 있습니다.</p>
        <div id="flash"></div></div>
      <div class="card"><h2>퀴즈 · 测验 <span class="muted small">${quiz.length}문제${saved ? ` · 지난 점수 ${saved.score}/${saved.total}` : ""}</span></h2>
        <div id="quiz" style="display:grid;gap:12px"></div></div>`;
    const deck = (L() ? (s.vocab || []) : (s.ko_vocab || [])).map((w) => ({ front: L() ? w.zh : w.ko, back: L() ? w.ko : w.zh, py: w.pinyin || "", ex: L() ? w.example_zh : w.example_ko, exb: L() ? w.example_ko : w.example_zh, lang: L() ? "zh" : "ko", key: cardKey(s.id, w, L() ? "zh" : "ko"), sid: s.id }));
    flashcards($("#flash"), deck, { srs: false });
    renderQuiz($("#quiz"), quiz, (score, total) => { state.quiz[s.id] = { score, total, at: Date.now() }; store.set("cp.quiz", state.quiz); });
  }

  function flashcards(el, deck, { srs }) {
    let i = 0, flipped = false, right = 0;
    if (!deck.length) { el.innerHTML = `<p class="muted">카드가 없습니다.</p>`; return; }
    const shuffled = [...deck].sort(() => Math.random() - 0.5);
    const draw = () => {
      if (i >= shuffled.length) { el.innerHTML = `<div class="flash"><div class="cardface"><div class="front" style="font-size:1.6rem">끝 · 完成</div><div class="back">${right} / ${shuffled.length} 기억함</div></div><div class="ctrl"><button class="btn" type="button" id="again">다시</button></div></div>`; $("#again", el).onclick = () => { i = 0; right = 0; shuffled.sort(() => Math.random() - 0.5); draw(); }; return; }
      const c = shuffled[i];
      el.innerHTML = `<div class="flash">
        <div class="progress"><i style="width:${(i / shuffled.length) * 100}%"></i></div>
        <div class="cardface" id="face" tabindex="0" role="button" aria-label="카드 뒤집기">
          <div class="front" lang="${c.lang}">${esc(c.front)}</div>
          ${flipped ? `<span class="py">${esc(c.py)}</span><div class="back">${esc(c.back)}</div>${c.ex ? `<div class="small muted" lang="${c.lang}">${esc(c.ex)}</div><div class="small muted">${esc(c.exb || "")}</div>` : ""}` : `<div class="small muted">눌러서 뜻 보기 · 点击翻面</div>`}
        </div>
        <div class="ctrl">
          ${sayBtn(c.front, c.lang)}
          ${flipped ? `<button class="btn bad" type="button" id="no">모르겠음 ✗</button><button class="btn good" type="button" id="yes">알겠음 ✓</button>` : `<button class="btn primary" type="button" id="flip">뒤집기</button>`}
          <span class="small muted tabular">${i + 1} / ${shuffled.length}${srs && c.box != null ? ` · box ${c.box}` : ""}</span>
        </div></div>`;
      const flip = () => { flipped = !flipped; draw(); };
      $("#face", el).onclick = flip; $("#face", el).onkeydown = (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } };
      $("#flip", el)?.addEventListener("click", flip);
      const answer = (ok) => { if (ok) right++; if (srs) grade(c.key, ok); else if (!ok && state.srs[c.key] == null) { /* add missed cards to the review queue */ state.srs[c.key] = { ...c, box: 0, due: Date.now(), reps: 1 }; store.set("cp.srs", state.srs); } i++; flipped = false; draw(); };
      $("#yes", el)?.addEventListener("click", () => answer(true));
      $("#no", el)?.addEventListener("click", () => answer(false));
    };
    draw();
  }

  function renderQuiz(el, quiz, onDone) {
    let answered = 0, score = 0;
    el.innerHTML = quiz.map((q, i) => `<div class="quiz-q" data-i="${i}">
      <div class="q">${i + 1}. ${esc(L() ? q.q_ko : (q.q_zh || q.q_ko))}<span class="zh" lang="zh">${esc(L() ? (q.q_zh || "") : q.q_ko)}</span></div>
      <div class="opts">${(q.options || []).map((o) => `<button type="button" data-o="${esc(o)}">${esc(o)}</button>`).join("")}</div>
      <div class="explain hidden"></div></div>`).join("") + `<div class="score" id="score"></div>`;
    el.querySelectorAll(".quiz-q").forEach((qd) => {
      const q = quiz[+qd.dataset.i];
      qd.querySelectorAll("[data-o]").forEach((b) => b.addEventListener("click", () => {
        const ok = b.dataset.o === q.answer; if (ok) score++; answered++;
        qd.querySelectorAll("[data-o]").forEach((x) => { x.disabled = true; if (x.dataset.o === q.answer) x.classList.add("correct"); });
        if (!ok) b.classList.add("wrong");
        const ex = qd.querySelector(".explain"); ex.classList.remove("hidden"); ex.textContent = (ok ? "정답 · 正确. " : "오답 · 错误. ") + (q.explain_ko || "");
        if (answered === quiz.length) { $("#score", el).textContent = `점수 · 得分: ${score} / ${quiz.length}`; onDone?.(score, quiz.length); }
      }));
    });
  }

  function tabVideo(s, el) {
    const vzh = s.videoMeta || (s.video?.mp4 ? s.video : null), vko = s.videoKoMeta || null, vrev = s.videoRevMeta || null;
    const want = store.get("cp.videoLang", L() ? "ko" : "rev");
    const lang = want === "ko" && vko ? "ko" : want === "rev" && vrev ? "rev" : "zh";
    const v = lang === "ko" ? vko : lang === "rev" ? vrev : vzh;
    if (!v) { el.innerHTML = `<div class="card"><h2>요약 영상 · 摘要视频</h2><p class="muted">이 설교의 영상은 아직 렌더링되지 않았습니다. 저장소에서 <code>python3 pipeline/render_video.py data/sermons/${esc(s.id)}.json</code> 을 실행하면 생성됩니다.</p>
      ${s.video?.beats?.length ? `<h3 style="margin-top:14px">영상 대본 · 视频脚本</h3><div class="cues">${s.video.beats.map((b) => `<div class="cue"><div class="t">${esc(b.kind)}</div><div><div class="zh" lang="zh">${esc(b.zh)}</div><span class="py">${esc(b.pinyin || "")}</span><div class="ko">${esc(b.ko)}</div></div></div>`).join("")}</div>` : ""}</div>`; return; }
    const desc = { zh: "중국어 학습용 · 중국어 나레이션", ko: "중국어 학습용 · 한국어 나레이션 (화면은 중국어)", rev: "韩语学习版 · 한국어가 크게, 한국어 나레이션, 한국어 단어 5개" }[lang];
    el.innerHTML = `<div class="card"><h2>요약 영상 · 摘要视频 <span class="muted small">${Math.round(v.duration || 0)}초 · 9:16 · ${desc} · 자막 내장</span></h2>
      ${vko || vrev ? `<p style="margin:8px 0 12px"><span class="lang-toggle" role="group" aria-label="영상 버전"><button type="button" data-vlang="zh" aria-pressed="${lang === "zh"}">中文 배우기 · 中文旁白</button>${vko ? `<button type="button" data-vlang="ko" aria-pressed="${lang === "ko"}">中文 배우기 · 한국어 나레이션</button>` : ""}${vrev ? `<button type="button" data-vlang="rev" aria-pressed="${lang === "rev"}">学韩语 · 韩语版</button>` : ""}</span></p>` : ""}
      <div class="video-wrap">
        <div><video id="vid" controls playsinline preload="metadata" poster="${esc(v.poster || "")}"><source src="${esc(v.mp4)}" type="video/mp4">${v.vtt ? `<track kind="subtitles" srclang="zh" label="中文 / 한국어" src="${esc(v.vtt)}">` : ""}</video>
          <p class="small" style="margin-top:8px"><a href="${esc(v.mp4)}" download>MP4 저장</a> · ${v.srt ? `<a href="${esc(v.srt)}" download>SRT</a>` : ""} · YouTube Shorts / Instagram Reels / 카카오톡 공유용</p></div>
        <div><p class="eyebrow" style="margin-bottom:8px">장면별 대본 · 逐段脚本 (클릭하면 해당 위치로)</p><div class="cues" id="cues">불러오는 중…</div></div>
      </div></div>`;
    el.querySelectorAll("[data-vlang]").forEach((b) => b.addEventListener("click", () => { store.set("cp.videoLang", b.dataset.vlang); tabVideo(s, el); }));
    const vid = $("#vid");
    const scriptUrl = v.mp4.replace(/\.mp4$/, ".script.json");
    fetch(scriptUrl).then((r) => r.json()).then((sc) => {
      const cues = $("#cues");
      cues.innerHTML = sc.cues.map((c, i) => `<div class="cue" data-t="${c.start}" data-i="${i}"><div class="t">${fmtT(c.start)}<br><span class="kind">${esc(c.kind)}</span></div><div><div class="zh" lang="zh">${esc(c.zh)}</div><span class="py">${esc(c.pinyin || "")}</span><div class="ko">${esc(c.ko)}</div></div></div>`).join("");
      cues.addEventListener("click", (e) => { const c = e.target.closest(".cue"); if (c) { vid.currentTime = +c.dataset.t + 0.05; vid.play(); } });
      vid.addEventListener("timeupdate", () => {
        const t = vid.currentTime; let act = -1;
        sc.cues.forEach((c, i) => { if (t >= c.start && t < c.end) act = i; });
        cues.querySelectorAll(".cue").forEach((c) => c.classList.toggle("active", +c.dataset.i === act));
      });
    }).catch(() => { $("#cues").textContent = "대본 파일을 불러오지 못했습니다."; });
  }
  const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  // ---------- global vocab ----------
  async function viewVocab() {
    await loadIndex();
    const sermons = allSermons().filter((s) => !s.placeholder);
    const docs = await Promise.all(sermons.map((s) => loadSermon(s.id)));
    const rows = [];
    docs.forEach((d, i) => { if (!d) return; (L() ? d.vocab : d.ko_vocab)?.forEach((w) => rows.push({ ...w, sid: sermons[i].id, sdate: sermons[i].date })); });
    const seen = new Map(); rows.forEach((r) => { const k = L() ? r.zh : r.ko; if (!seen.has(k)) seen.set(k, { ...r, count: 1, sids: [r.sid] }); else { const e = seen.get(k); e.count++; e.sids.push(r.sid); } });
    const list = [...seen.values()];
    main.innerHTML = `<h1>${L() ? "전체 단어장 · 全部词语" : "全部韩语词汇 · 전체 단어장"}</h1>
      <p class="muted small" style="margin:6px 0 14px">${list.length}개 · 여러 설교에 반복해서 나온 단어가 먼저 옵니다 (교회에서 실제로 자주 쓰는 말).</p>
      <div class="filters" style="margin-bottom:14px"><input id="gf" type="search" placeholder="검색 · 搜索"><select id="gs"><option value="">모든 설교</option>${sermons.map((s) => `<option value="${s.id}">${fmtDate(s.date)} ${esc(s.title.ko)}</option>`).join("")}</select>
        <select id="gh"><option value="">모든 HSK</option>${["1", "2", "3", "4", "5", "6", "7+"].map((h) => `<option>${h}</option>`).join("")}</select></div>
      <div class="vocab-grid" id="gg"></div>`;
    const render = () => {
      const q = $("#gf").value.trim().toLowerCase(), sid = $("#gs").value, h = $("#gh").value;
      const f = list.filter((w) => (!q || JSON.stringify(w).toLowerCase().includes(q)) && (!sid || w.sids.includes(sid)) && (!h || String(w.hsk) === h))
        .sort((a, b) => b.count - a.count || (a.hsk || "9").toString().localeCompare((b.hsk || "9").toString()));
      $("#gg").innerHTML = f.map((w, i) => (L() ? zhCard(w, i, w.sid) : koCard(w, i, w.sid)).replace('<div class="actions">', `<div class="small muted">${w.count > 1 ? `${w.count}회 등장 · ` : ""}${w.sids.map((x) => `<a href="#/s/${x}/vocab">${fmtDate(x)}</a>`).join(", ")}</div><div class="actions">`)).join("") || `<p class="muted">결과 없음</p>`;
      main.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => { const w = f[+b.dataset.add.split(":")[1]]; addCard(w.sid, w, L() ? "zh" : "ko"); toast("플래시카드에 추가됨"); refreshCardButtons(main); }));
      refreshCardButtons(main);
    };
    ["gf", "gs", "gh"].forEach((id) => $("#" + id).addEventListener("input", render)); render();
  }

  // ---------- review ----------
  async function viewReview() {
    const due = dueCards(); const total = Object.keys(state.srs).length;
    const boxes = [0, 0, 0, 0, 0, 0]; Object.values(state.srs).forEach((c) => boxes[c.box]++);
    main.innerHTML = `<h1>복습 · 复习</h1>
      <p class="muted small" style="margin:6px 0 14px">라이트너 상자 방식: 맞히면 다음 상자(1·3·7·14·30일 뒤), 틀리면 0번 상자로 돌아갑니다. 카드는 이 브라우저에만 저장됩니다.</p>
      <div class="card" style="margin-bottom:16px"><div class="stat-row">
        <div class="stat"><b class="tabular">${due.length}</b><span>오늘 복습</span></div><div class="stat"><b class="tabular">${total}</b><span>전체 카드</span></div>
        ${boxes.map((n, i) => `<div class="stat"><b class="tabular">${n}</b><span>상자 ${i}</span></div>`).join("")}</div>
        <p style="margin-top:10px"><button class="btn" type="button" id="wipe">카드 전부 삭제</button></p></div>
      <div class="card"><div id="rv"></div></div>`;
    $("#wipe").addEventListener("click", () => { if (confirm("모든 플래시카드를 삭제할까요?")) { state.srs = {}; store.set("cp.srs", {}); route(); } });
    if (!due.length) { $("#rv").innerHTML = `<p class="muted">오늘 복습할 카드가 없습니다. 설교 단어 탭에서 카드를 추가하세요.${total ? " 다음 복습: " + fmtDate(new Date(Math.min(...Object.values(state.srs).map((c) => c.due))).toISOString().slice(0, 10)) : ""}</p>`; return; }
    flashcards($("#rv"), due, { srs: true });
  }

  // ---------- import ----------
  function viewImport() {
    const key = store.get("cp.gemini", "");
    main.innerHTML = `<h1>가져오기 · 导入</h1>
      <p class="muted" style="margin:6px 0 18px;max-width:70ch">주일 예배 PPTX(새오름교회 양식)나 파이프라인이 만든 JSON을 이 브라우저에 추가합니다. 저장된 자료는 이 기기에만 남고, "JSON 내보내기"로 파일을 받아 저장소 <code>data/sermons/</code>에 넣으면 모두에게 공개됩니다.</p>
      <div class="two-col">
        <div class="card">
          <h2>1. 파일 놓기</h2>
          <div class="drop" id="drop"><p><b>PPTX 또는 JSON</b>을 여기에 끌어다 놓거나</p><p><input type="file" id="file" accept=".pptx,.json" multiple></p>
            <p class="small muted">PPTX는 브라우저 안에서만 읽습니다(업로드 없음). 사도신경·찬양·성경 본문·설교 단락을 자동으로 나눕니다.</p></div>
          <div class="field" style="margin-top:14px"><label for="gk">Gemini API 키 (선택)</label><input id="gk" type="password" value="${esc(key)}" placeholder="AIza…"><small>키가 있으면 요약·단어·퀴즈·영상 대본을 바로 생성합니다 (설교당 1회 호출, 브라우저에서 Google로 직접 전송). 없으면 병행 읽기와 본문만 저장됩니다. 키는 이 브라우저에만 저장됩니다.</small></div>
          <div class="log" id="log" style="margin-top:12px">대기 중…</div>
        </div>
        <div class="card">
          <h2>2. 작동 방식</h2>
          <ol class="steps">
            <li><div><b>PPTX 분석</b><br><span class="small muted">슬라이드 순서대로 텍스트를 읽고 "오늘의 말씀" 뒤의 제목 슬라이드부터 마침 찬양 전까지를 설교 단락으로, 숫자로 시작하는 줄을 성경 구절로 인식합니다. 한국어 줄과 중국어 줄을 자동으로 짝지어 병행 단락을 만듭니다.</span></div></li>
            <li><div><b>성경 본문 대조</b><br><span class="small muted">중국어 본문이 슬라이드에 없으면 和合本(CUNPS)을 bolls.life에서 가져옵니다. 이 단계는 인터넷이 필요합니다.</span></div></li>
            <li><div><b>Gemini 학습 자료 생성</b><br><span class="small muted">저장소의 <code>data/prompts/adult.txt</code>와 같은 프롬프트를 사용합니다. 요약·요점·핵심 문장 8·단어 24·문형 4·한국어 단어 12·퀴즈 10·영상 대본. 모든 예문은 설교 원문에서 그대로 가져오도록 지시합니다.</span></div></li>
            <li><div><b>영상</b><br><span class="small muted">영상 렌더링(Gemini TTS + ffmpeg)은 브라우저에서 할 수 없습니다. 내보낸 JSON을 저장소에 넣고 <code>python3 pipeline/render_video.py</code>를 실행하세요. README에 전체 명령이 있습니다.</span></div></li>
          </ol>
          <h3 style="margin-top:18px">이 기기에 저장된 설교</h3>
          <ul class="small" id="local-list">${Object.values(state.local).map((s) => `<li><a href="#/s/${s.id}">${fmtDate(s.date)} ${esc(s.title.ko)}</a>${s.summary ? "" : ' <span class="muted">(요약 없음)</span>'}</li>`).join("") || "<li class='muted'>없음</li>"}</ul>
        </div>
      </div>`;
    const drop = $("#drop"), log = $("#log"), fileIn = $("#file");
    const say = (m) => { log.textContent += (log.textContent === "대기 중…" ? "" : "\n") + m; log.textContent = log.textContent.replace(/^대기 중…\n?/, ""); log.scrollTop = log.scrollHeight; };
    $("#gk").addEventListener("change", (e) => store.set("cp.gemini", e.target.value.trim()));
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files, say));
    fileIn.addEventListener("change", (e) => handleFiles(e.target.files, say));
  }

  async function handleFiles(files, say) {
    for (const f of files) {
      try {
        say(`▸ ${f.name} (${(f.size / 1e6).toFixed(1)} MB)`);
        let sermon;
        if (/\.json$/i.test(f.name)) {
          sermon = JSON.parse(await f.text());
          if (!sermon.id || !sermon.paragraphs || !sermon.title) throw new Error("설교 JSON 형식이 아닙니다 (id/title/paragraphs 필요)");
        } else if (/\.pptx$/i.test(f.name)) {
          if (!window.JSZip) throw new Error("JSZip을 불러오지 못했습니다 (오프라인?)");
          const raw = await parsePptx(f, say);
          sermon = await finishRaw(raw, say);
        } else throw new Error("지원하지 않는 파일");
        state.local[sermon.id] = sermon; store.set("cp.local", state.local);
        say(`✓ 저장됨: ${sermon.id} ${sermon.title.ko}`); toast(`${sermon.title.ko} 저장됨`);
      } catch (e) { console.error(e); say(`✗ ${e.message}`); }
    }
    refreshLocalList();
  }
  function refreshLocalList() {
    const ul = $("#local-list"); if (!ul) return;
    ul.innerHTML = Object.values(state.local).map((s) => `<li><a href="#/s/${s.id}">${fmtDate(s.date)} ${esc(s.title.ko)}</a>${s.summary ? "" : ' <span class="muted">(요약 없음)</span>'}</li>`).join("") || "<li class='muted'>없음</li>";
  }

  // --- PPTX parsing in the browser (mirrors pipeline/extract_pptx.py) ---
  const isHangul = (s) => (s.match(/[가-힣]/g) || []).length, isHan = (s) => (s.match(/[一-鿿]/g) || []).length;
  const scriptOf = (l) => { const k = isHangul(l), h = isHan(l); return !k && !h ? "other" : k >= h ? "ko" : "zh"; };
  const CREED = ["사도신경", "我信上帝", "전능하사 천지를", "我信我主耶稣", "그 외아들 우리 주", "因圣灵感孕", "이는 성령으로 잉태하사", "使徒信经"];
  async function parsePptx(file, say) {
    const zip = await JSZip.loadAsync(file);
    const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
    // real slide order lives in presentation.xml → rels
    let order = names;
    try {
      const pres = await zip.file("ppt/presentation.xml").async("string"); const rels = await zip.file("ppt/_rels/presentation.xml.rels").async("string");
      const relMap = {}; for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2]; for (const m of rels.matchAll(/Target="([^"]+)"[^>]*Id="(rId\d+)"/g)) relMap[m[2]] = m[1];
      const ids = [...pres.matchAll(/<p:sldId [^>]*r:id="(rId\d+)"/g)].map((m) => "ppt/" + relMap[m[1]].replace(/^\/?ppt\//, "").replace(/^\.\.\//, ""));
      if (ids.length === names.length) order = ids;
    } catch { /* fall back to numeric order */ }
    const slides = [];
    const parser = new DOMParser();
    for (const n of order) {
      const xml = await zip.file(n).async("string"); const doc = parser.parseFromString(xml, "application/xml");
      const lines = [];
      for (const p of doc.getElementsByTagNameNS("*", "p")) {
        if (p.namespaceURI !== "http://schemas.openxmlformats.org/drawingml/2006/main") continue;
        let cur = "";
        for (const node of p.childNodes) {
          const tag = node.localName;
          if (tag === "r" || tag === "fld") { for (const t of node.getElementsByTagNameNS("*", "t")) cur += t.textContent; }
          else if (tag === "br") { lines.push(cur.trim()); cur = ""; }
        }
        lines.push(cur.trim());
      }
      slides.push(lines.filter((l) => !CREED.some((m) => l.startsWith(m))));
    }
    say(`  슬라이드 ${slides.length}장 읽음`);
    const raw = extractDeck(slides, file.name);
    say(`  제목: ${raw.title.ko || "?"} / ${raw.title.zh || "?"} · 본문 ${raw.scripture.ref_ko || "?"} · 단락 ${raw.paragraphs.length}`);
    return raw;
  }
  function extractDeck(slides, fname) {
    const raw = slides.map((s) => s.filter(Boolean));
    const m = fname.match(/(\d{8})/); const date = m ? `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)}` : new Date().toISOString().slice(0, 10);
    const first = raw[0] || [];
    const kids = first.some((l) => l.includes("유치부"));
    const deck = { source_file: fname, date, id: date, kind: kids ? "kids" : "adult",
      church: { ko: first.find((l) => scriptOf(l) === "ko" && l.includes("교회")) || "새오름교회", zh: first.find((l) => scriptOf(l) === "zh" && l.includes("教会")) || "言盐教会" } };
    const REF = /([가-힣]+)\s*(\d+):(\d+)(?:-+(\d+))?/, REFZ = /([一-鿿]+)\s*(\d+):(\d+)(?:-+(\d+))?/, VERSE = /^(\d{1,3})\s+(.+)$/, DATE = /(\d{4})[.년]\s*(\d{1,2})[.월]\s*(\d{1,2})/;
    const sc = { ref_ko: null, ref_zh: null, verses: [] }; const verses = {};
    raw.forEach((s) => {
      const text = s.join("\n");
      if (!sc.ref_ko && (text.includes("오늘의 말씀") || text.includes("성경봉독"))) {
        for (const l of s) { if (REF.test(l) && scriptOf(l) === "ko" && !sc.ref_ko) sc.ref_ko = l.trim(); if (REFZ.test(l) && scriptOf(l) === "zh" && !sc.ref_zh) sc.ref_zh = l.trim(); }
        if (kids) { const mk = s.join(" ").replace(/~/g, "-").match(/([가-힣]+)\s*(\d+)장\s*(\d+)-(\d+)절/); if (mk) sc.ref_ko = `${mk[1]} ${mk[2]}:${mk[3]}-${mk[4]}`; }
      }
      const carries = sc.ref_ko && s.some((l) => l.replace(/--/g, "-").replace(/~/g, "-").includes(sc.ref_ko.replace(/--/g, "-")) || (sc.ref_zh && l.includes(sc.ref_zh)));
      const kidsCarries = kids && sc.ref_ko && s.some((l) => /^\d+절$/.test(l));
      if (carries || kidsCarries) {
        s.forEach((l, j) => {
          const mv = l.match(VERSE);
          if (mv && !DATE.test(l)) { const lang = scriptOf(mv[2]); if (lang !== "other") (verses[+mv[1]] ||= {})[lang] = mv[2].trim(); }
          const mk = l.match(/^(\d+)절$/);
          if (kids && mk) (verses[+mk[1]] ||= {}).ko = s.slice(j + 1).filter((x) => !x.startsWith("마가복음") && x !== "아멘" && !/^\d+절$/.test(x)).join(" ");
        });
      }
    });
    sc.verses = Object.keys(verses).map(Number).sort((a, b) => a - b).map((n) => ({ n, ko: verses[n].ko || "", zh: verses[n].zh || "" }));
    deck.scripture = sc;
    const hymns = [], seen = new Set();
    raw.forEach((s) => { if (s.length >= 1 && s.length <= 2 && s.every((l) => l.length < 40)) { const zh = s.find((l) => scriptOf(l) === "zh"), ko = s.find((l) => scriptOf(l) === "ko"); if (zh && ko && !seen.has(zh + ko) && !VERSE.test(zh)) { seen.add(zh + ko); hymns.push({ zh, ko }); } } });
    deck.hymns = hymns;
    let ti = -1;
    raw.some((s, i) => { const t = s.join("\n"); if ((kids && t.includes("이야기") && t.includes("절")) || (t.includes("오늘의 말씀") && !REF.test(t) && s.length >= 2) || t.includes("본문:") || t.includes("经文：")) { ti = i; return true; } return false; });
    deck.title = { ko: null, zh: null }; const body = []; let greeting = null;
    if (ti >= 0) {
      const ts = raw[ti].filter((l) => l !== "오늘의 말씀" && !DATE.test(l) && !l.includes("교회") && !l.includes("教会") && !l.includes("본문") && !l.includes("经文"));
      let ko = ts.filter((l) => scriptOf(l) === "ko"), zh = ts.filter((l) => scriptOf(l) === "zh");
      if (kids) { ko = ko.filter((l) => !l.includes("이야기") && !l.includes("절")); deck.title.ko = ko.slice(0, 2).join(" "); } else { deck.title.ko = ko[0] || null; deck.title.zh = zh[0] || null; }
      for (let i = ti + 1; i < slides.length; i++) {
        const s = slides[i];
        if (!s.some(Boolean)) { if (body.length) break; continue; }
        if (kids) { const lines = s.filter(Boolean); body.push({ slide: i + 1, ko: lines.join(" / "), zh: "", kids_block: lines }); continue; }
        const koL = [], zhL = []; let last = "ko";
        for (const l of s) { const sc2 = scriptOf(l); if (sc2 === "ko") { koL.push(l); last = "ko"; } else if (sc2 === "zh") { zhL.push(l); last = "zh"; } else (last === "zh" ? zhL : koL).push(l); }
        const join = (ls, lang) => { const paras = []; let cur = []; for (const l of ls) { if (l === "") { if (cur.length) { paras.push(cur); cur = []; } } else cur.push(l); } if (cur.length) paras.push(cur); return paras.map((p) => lang === "ko" ? p.join(" ") : p.join("").replace(/\s+(?=[一-鿿，。！？；：、“”（）])/g, "").replace(/(?<=[一-鿿，。！？；：、“”（）])\s+/g, "")).join("\n").trim(); };
        const kot = join(koL, "ko"), zht = join(zhL, "zh");
        if (!kot && !zht) continue;
        const entry = { slide: i + 1, ko: kot, zh: zht }; if (kot.startsWith("“") && !body.length) entry.type = "passage";
        body.push(entry);
        if (!greeting && kot.includes("인사") && kot.includes("“")) { const gk = [...kot.matchAll(/“([^”]+)”/g)].map((m) => m[1]), gz = [...zht.matchAll(/“([^”]+)”/g)].map((m) => m[1]); if (gk.length) greeting = { ko: gk, zh: gz }; }
      }
    }
    deck.paragraphs = body; deck.greeting = greeting;
    return deck;
  }

  const BOOK_KO2ZH = { 창세기: "创世记", 출애굽기: "出埃及记", 시편: "诗篇", 이사야: "以赛亚书", 예레미야: "耶利米书", 다니엘: "但以理书", 하박국: "哈巴谷书", 마태복음: "马太福音", 마가복음: "马可福音", 누가복음: "路加福音", 요한복음: "约翰福音", 사도행전: "使徒行传", 로마서: "罗马书", 고린도전서: "哥林多前书", 고린도후서: "哥林多后书", 갈라디아서: "加拉太书", 에베소서: "以弗所书", 빌립보서: "腓立比书", 골로새서: "歌罗西书", 디모데전서: "提摩太前书", 디모데후서: "提摩太后书", 히브리서: "希伯来书", 야고보서: "雅各书", 베드로전서: "彼得前书", 요한일서: "约翰一书", 요한계시록: "启示录" };
  const BOOK_NO = { 创世记: 1, 出埃及记: 2, 诗篇: 19, 以赛亚书: 23, 耶利米书: 24, 但以理书: 27, 哈巴谷书: 35, 马太福音: 40, 马可福音: 41, 路加福音: 42, 约翰福音: 43, 使徒行传: 44, 罗马书: 45, 哥林多前书: 46, 哥林多后书: 47, 加拉太书: 48, 以弗所书: 49, 腓立比书: 50, 歌罗西书: 51, 提摩太前书: 54, 提摩太后书: 55, 希伯来书: 58, 雅各书: 59, 彼得前书: 60, 约翰一书: 62, 启示录: 66 };
  async function finishRaw(raw, say) {
    // Chinese reference + verses
    const m = (raw.scripture.ref_ko || "").replace(/--/g, "-").match(/([가-힣]+)\s*(\d+):(\d+)(?:-(\d+))?/);
    if (m && BOOK_KO2ZH[m[1]]) {
      const book = BOOK_KO2ZH[m[1]], ch = +m[2], v1 = +m[3], v2 = +(m[4] || m[3]);
      raw.scripture.ref_zh = raw.scripture.ref_zh || `${book} ${ch}:${v1 === v2 ? v1 : v1 + "-" + v2}`;
      raw.scripture.ref_ko = raw.scripture.ref_ko.replace(/--/g, "-");
      try {
        const clean = (t) => t.replace(/<sup>.*?<\/sup>/g, "").replace(/<[^>]+>/g, "").trim();
        const [zh, ko] = await Promise.all([fetch(`https://bolls.life/get-text/CUNPS/${BOOK_NO[book]}/${ch}/`).then((r) => r.json()), fetch(`https://bolls.life/get-text/KRV/${BOOK_NO[book]}/${ch}/`).then((r) => r.json())]);
        const byN = Object.fromEntries(raw.scripture.verses.map((v) => [v.n, v])); const verses = [];
        for (let n = v1; n <= v2; n++) { const z = clean(zh.find((x) => x.verse === n)?.text || ""), k = clean(ko.find((x) => x.verse === n)?.text || ""); const d = byN[n] || {}; verses.push({ n, zh: d.zh || z, ko: d.ko || k, zh_cunps: z, ko_krv: k, zh_from_deck: !!d.zh, ko_from_deck: !!d.ko }); }
        raw.scripture.verses = verses; say("  성경 본문 대조 완료 (bolls.life)");
      } catch (e) { say("  성경 API 접근 실패 — 슬라이드 본문만 사용: " + e.message); }
    }
    const key = store.get("cp.gemini", "");
    if (!key) { say("  Gemini 키 없음 — 병행 읽기와 본문만 저장"); return raw; }
    say("  Gemini로 학습 자료 생성 중… (30–90초)");
    const tpl = await fetch(`data/prompts/${raw.kind === "kids" ? "kids" : "adult"}.txt`).then((r) => r.text());
    const scriptureZh = raw.scripture.verses.map((v) => `${v.n} ${v.zh}`).join("\n");
    let prompt;
    if (raw.kind === "kids") prompt = tpl.replace("{date}", raw.date).replace("{title_ko}", raw.title.ko || "").replace("{ref_ko}", raw.scripture.ref_ko || "").replace("{scripture_zh}", scriptureZh).replace("{blocks}", raw.paragraphs.map((p, i) => `[${i}] ${(p.kids_block || [p.ko]).join(" / ")}`).join("\n"));
    else prompt = tpl.replace("{date}", raw.date).replace("{title_ko}", raw.title.ko || "").replace("{title_zh}", raw.title.zh || "").replace("{ref_ko}", raw.scripture.ref_ko || "").replace("{greeting}", raw.greeting ? raw.greeting.ko.join(" / ") + " ｜ " + raw.greeting.zh.join(" / ") : "").replace("{scripture_zh}", scriptureZh).replace("{paragraphs}", raw.paragraphs.map((p, i) => `[${i}] ko: ${p.ko}\n[${i}] zh: ${p.zh}`).join("\n"));
    const model = "gemini-3.1-pro-preview";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: "application/json", maxOutputTokens: 65536 } }) });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json(); const text = j.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const ai = JSON.parse(text.replace(/^```(?:json)?|```$/gm, "").trim());
    const out = { ...raw, title: { ko: raw.title.ko, zh: raw.title.zh || ai.title_zh } };
    if (raw.kind === "kids") (ai.blocks_zh || []).forEach((b, i) => { if (out.paragraphs[i]) { out.paragraphs[i].zh_lines = b.zh_lines; out.paragraphs[i].zh = (b.zh_lines || []).join(" / "); out.paragraphs[i].zh_machine = true; } });
    for (const k of ["summary", "one_line", "outline", "key_sentences", "grammar", "ko_vocab", "quiz", "corrections"]) out[k] = ai[k];
    out.vocab = (ai.vocab || []).map((w, i) => ({ ...w, video: w.video ?? i < 5 }));
    const vid = ai.video; out.video = { beats: Array.isArray(vid) ? vid : vid?.beats || [] };
    out.enriched_with = model + " (browser)";
    say(`  ✓ 요약·단어 ${out.vocab.length}·퀴즈 ${(out.quiz || []).length} 생성`);
    return out;
  }


  // ---------- share cards ----------
  function tabShare(s, el) {
    const card = s.cardMeta || null;
    el.innerHTML = `<div class="card"><h2>공유 카드 · 分享卡片</h2>
      <p class="small muted" style="margin:6px 0 12px">카카오톡·인스타그램에 올릴 이미지입니다. 링크를 카카오톡에 붙여 넣으면 미리보기에도 이 주의 인사말 카드가 뜹니다.</p>
      <div class="two-col">
        <div>${card ? `<img class="share-preview" src="${esc(card)}" alt="${esc(s.title.ko)} 공유 카드" style="width:100%;max-width:360px">` : `<p class="muted">이 설교의 카드가 아직 없습니다. <code>python3 pipeline/share_card.py data/sermons/${esc(s.id)}.json</code></p>`}</div>
        <div style="display:grid;gap:10px;align-content:start">
          ${card ? `<div class="share-row"><a class="btn primary" href="${esc(card)}" download="${esc(s.id)}-card.png">PNG 저장</a><button class="btn" type="button" id="share-native">공유하기</button><button class="btn" type="button" id="copy-link">링크 복사</button></div>` : ""}
          <h3>문장 카드 직접 만들기</h3>
          <p class="small muted">아래 문장 중 하나를 고르면 브라우저에서 바로 카드를 그립니다. 단어 탭의 핵심 문장에도 같은 버튼이 있습니다.</p>
          <div style="display:grid;gap:6px">
            ${(s.greeting ? s.greeting.zh.map((z, i) => ({ zh: z, ko: s.greeting.ko[i] || "", pinyin: "" })) : []).concat((s.key_sentences || []).slice(0, 4)).map((k, i) => `<button class="opts-item btn" type="button" data-scard="${i}" style="text-align:left"><span lang="zh">${esc(k.zh)}</span><br><span class="small muted">${esc(k.ko)}</span></button>`).join("")}
          </div>
          <div id="scard-out"></div>
        </div></div></div>`;
    const list = (s.greeting ? s.greeting.zh.map((z, i) => ({ zh: z, ko: s.greeting.ko[i] || "", pinyin: "" })) : []).concat((s.key_sentences || []).slice(0, 4));
    el.querySelectorAll("[data-scard]").forEach((b) => b.addEventListener("click", () => shareSentenceCard({ ...list[+b.dataset.scard], foot: `${s.title.ko} · ${fmtDate(s.date)}` }, $("#scard-out"))));
    $("#copy-link")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/s/${s.id}`); toast("링크 복사됨"); } catch { toast("복사 실패"); } });
    $("#share-native")?.addEventListener("click", async () => {
      try {
        const blob = await (await fetch(card)).blob(); const file = new File([blob], `${s.id}-card.png`, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: s.title.ko, text: `${s.greeting?.zh?.[0] || s.title.zh} — ${location.origin}${location.pathname}#/s/${s.id}` });
        else if (navigator.share) await navigator.share({ title: s.title.ko, url: `${location.origin}${location.pathname}#/s/${s.id}` });
        else toast("이 브라우저는 공유 메뉴를 지원하지 않습니다. PNG 저장을 이용하세요.");
      } catch (e) { if (e.name !== "AbortError") toast("공유 실패: " + e.message); }
    });
  }

  // draw a 1080×1350 sentence card on a canvas, then offer download / share
  async function shareSentenceCard({ zh, pinyin, ko, foot }, mount) {
    pinyin = pinyin || toPinyin(zh);
    try { await Promise.all([document.fonts.load('700 80px "Noto Serif SC"'), document.fonts.load('400 40px "Noto Sans KR"'), document.fonts.load('400 30px "Noto Sans SC"')]); } catch { /* fallback fonts */ }
    const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const grad = g.createRadialGradient(W / 2, H * 0.55, 100, W / 2, H * 0.55, 1100); grad.addColorStop(0, "#1e2942"); grad.addColorStop(1, "#111827");
    g.fillStyle = "#111827"; g.fillRect(0, 0, W, H); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const wrapText = (text, font, maxW, cjk) => { g.font = font; const units = cjk ? [...text] : text.split(" "); const lines = []; let cur = ""; for (const u of units) { const cand = cjk ? cur + u : (cur + " " + u).trim(); if (g.measureText(cand).width <= maxW || !cur) cur = cand; else { lines.push(cur); cur = u; } } if (cur) lines.push(cur); return lines; };
    const block = (text, font, y, maxW, color, cjk, lh) => { const lines = wrapText(text, font, maxW, cjk); g.fillStyle = color; g.textAlign = "center"; g.font = font; lines.forEach((l, i) => g.fillText(l, W / 2, y + i * lh)); return y + lines.length * lh; };
    g.fillStyle = "#8c94a8"; g.font = '32px "Noto Sans SC", "Noto Sans KR", sans-serif'; g.textAlign = "left"; g.fillText("言盐教会 · 새오름교회", 72, 100); g.textAlign = "right"; g.fillText("讲道中文", W - 72, 100);
    const size = zh.length <= 12 ? 88 : zh.length <= 22 ? 70 : 56;
    // measure to centre vertically
    const zhLines = wrapText(zh, `700 ${size}px "Noto Serif SC", serif`, W - 160, true).length, pyLines = wrapText(pinyin, '34px "Noto Sans SC", sans-serif', W - 180, false).length, koLines = wrapText(ko, '44px "Noto Sans KR", sans-serif', W - 200, false).length;
    const total = zhLines * size * 1.35 + pyLines * 46 + koLines * 62 + 120; let y = (H - total) / 2 + size;
    y = block(zh, `700 ${size}px "Noto Serif SC", serif`, y, W - 160, "#f7f3ea", true, size * 1.35);
    y = block(pinyin, '34px "Noto Sans SC", sans-serif', y, W - 180, "#e8b44c", false, 46) + 30;
    g.strokeStyle = "#e8b44c"; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2 - 60, y); g.lineTo(W / 2 + 60, y); g.stroke(); y += 70;
    block(ko, '44px "Noto Sans KR", sans-serif', y, W - 200, "#c3c8d4", false, 62);
    g.fillStyle = "#8c94a8"; g.font = '30px "Noto Sans KR", sans-serif'; g.textAlign = "left"; g.fillText(foot || "", 72, H - 110);
    g.fillStyle = "#78beaa"; g.font = '28px "Noto Sans SC", sans-serif'; g.fillText("chinese-pastor.vercel.app · 설교로 배우는 중국어", 72, H - 60);
    const url = c.toDataURL("image/png");
    const html = `<div style="display:grid;gap:8px;margin-top:10px"><img class="share-preview" src="${url}" alt="문장 카드" style="width:100%;max-width:320px"><div class="share-row"><a class="btn primary" href="${url}" download="sentence-card.png">PNG 저장</a><button class="btn" type="button" id="scard-share">공유하기</button></div></div>`;
    if (mount) mount.innerHTML = html; else { const d = document.createElement("div"); d.className = "toast"; d.style.cssText = "bottom:auto;top:80px;max-width:360px;border-radius:14px;padding:14px;background:var(--bg-raised);color:var(--ink);border:1px solid var(--line)"; d.innerHTML = html + `<p style="text-align:right;margin-top:6px"><button class="btn" type="button" id="scard-close">닫기</button></p>`; document.body.appendChild(d); d.querySelector("#scard-close").onclick = () => d.remove(); mount = d; }
    mount.querySelector("#scard-share")?.addEventListener("click", async () => {
      try { const blob = await (await fetch(url)).blob(); const file = new File([blob], "sentence-card.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: `${zh}\n${ko}` }); else toast("이 브라우저는 파일 공유를 지원하지 않습니다. PNG 저장을 이용하세요."); }
      catch (e) { if (e.name !== "AbortError") toast("공유 실패: " + e.message); }
    });
  }
  const toPinyin = (zh) => { try { return window.pinyinPro ? window.pinyinPro.pinyin(zh).replace(/\s*([，。！？；：、“”‘’（）…])\s*/g, (m, p) => ({ "，": ", ", "。": ". ", "！": "! ", "？": "? ", "；": "; ", "：": ": ", "、": ", " }[p] || "")).replace(/\s+/g, " ").trim() : ""; } catch { return ""; } };

  // ---------- 중국어 성경공부 (Bible study) ----------
  const BOOKS = [[1,"创世记","창세기","Genesis",50,"創"],[2,"出埃及记","출애굽기","Exodus",40,"出"],[3,"利未记","레위기","Leviticus",27,"利"],[4,"民数记","민수기","Numbers",36,"民"],[5,"申命记","신명기","Deuteronomy",34,"申"],[6,"约书亚记","여호수아","Joshua",24,"書"],[7,"士师记","사사기","Judges",21,"士"],[8,"路得记","룻기","Ruth",4,"得"],[9,"撒母耳记上","사무엘상","1 Samuel",31,"撒上"],[10,"撒母耳记下","사무엘하","2 Samuel",24,"撒下"],[11,"列王纪上","열왕기상","1 Kings",22,"王上"],[12,"列王纪下","열왕기하","2 Kings",25,"王下"],[13,"历代志上","역대상","1 Chronicles",29,"代上"],[14,"历代志下","역대하","2 Chronicles",36,"代下"],[15,"以斯拉记","에스라","Ezra",10,"拉"],[16,"尼希米记","느헤미야","Nehemiah",13,"尼"],[17,"以斯帖记","에스더","Esther",10,"斯"],[18,"约伯记","욥기","Job",42,"伯"],[19,"诗篇","시편","Psalms",150,"詩"],[20,"箴言","잠언","Proverbs",31,"箴"],[21,"传道书","전도서","Ecclesiastes",12,"傳"],[22,"雅歌","아가","Song of Songs",8,"歌"],[23,"以赛亚书","이사야","Isaiah",66,"賽"],[24,"耶利米书","예레미야","Jeremiah",52,"耶"],[25,"耶利米哀歌","예레미야애가","Lamentations",5,"哀"],[26,"以西结书","에스겔","Ezekiel",48,"結"],[27,"但以理书","다니엘","Daniel",12,"但"],[28,"何西阿书","호세아","Hosea",14,"何"],[29,"约珥书","요엘","Joel",3,"珥"],[30,"阿摩司书","아모스","Amos",9,"摩"],[31,"俄巴底亚书","오바댜","Obadiah",1,"俄"],[32,"约拿书","요나","Jonah",4,"拿"],[33,"弥迦书","미가","Micah",7,"彌"],[34,"那鸿书","나훔","Nahum",3,"鴻"],[35,"哈巴谷书","하박국","Habakkuk",3,"哈"],[36,"西番雅书","스바냐","Zephaniah",3,"番"],[37,"哈该书","학개","Haggai",2,"該"],[38,"撒迦利亚书","스가랴","Zechariah",14,"亞"],[39,"玛拉基书","말라기","Malachi",4,"瑪"],[40,"马太福音","마태복음","Matthew",28,"太"],[41,"马可福音","마가복음","Mark",16,"可"],[42,"路加福音","누가복음","Luke",24,"路"],[43,"约翰福音","요한복음","John",21,"約"],[44,"使徒行传","사도행전","Acts",28,"徒"],[45,"罗马书","로마서","Romans",16,"羅"],[46,"哥林多前书","고린도전서","1 Corinthians",16,"林前"],[47,"哥林多后书","고린도후서","2 Corinthians",13,"林後"],[48,"加拉太书","갈라디아서","Galatians",6,"加"],[49,"以弗所书","에베소서","Ephesians",6,"弗"],[50,"腓立比书","빌립보서","Philippians",4,"腓"],[51,"歌罗西书","골로새서","Colossians",4,"西"],[52,"帖撒罗尼迦前书","데살로니가전서","1 Thessalonians",5,"帖前"],[53,"帖撒罗尼迦后书","데살로니가후서","2 Thessalonians",3,"帖後"],[54,"提摩太前书","디모데전서","1 Timothy",6,"提前"],[55,"提摩太后书","디모데후서","2 Timothy",4,"提後"],[56,"提多书","디도서","Titus",3,"多"],[57,"腓利门书","빌레몬서","Philemon",1,"門"],[58,"希伯来书","히브리서","Hebrews",13,"來"],[59,"雅各书","야고보서","James",5,"雅"],[60,"彼得前书","베드로전서","1 Peter",5,"彼前"],[61,"彼得后书","베드로후서","2 Peter",3,"彼後"],[62,"约翰一书","요한일서","1 John",5,"約一"],[63,"约翰二书","요한이서","2 John",1,"約二"],[64,"约翰三书","요한삼서","3 John",1,"約三"],[65,"犹大书","유다서","Jude",1,"猶"],[66,"启示录","요한계시록","Revelation",22,"啟"]];
  const CCBS = { 44: "44Acts", 45: "45Rom" }; // ccbiblestudy folders verified to exist; other books link to the site index
  const bookByZh = (z) => BOOKS.find((b) => b[1] === z);
  let glossaryCache = null;
  async function loadGlossary() { if (glossaryCache) return glossaryCache; try { glossaryCache = await (await fetch("data/glossary.json")).json(); } catch { glossaryCache = { terms: [], categories: [] }; } return glossaryCache; }
  async function loadChapter(tr, book, ch) {
    const clean = (t) => t.replace(/<sup>.*?<\/sup>/g, "").replace(/<[^>]+>/g, "").trim();
    try { const r = await fetch(`data/bible/${tr}/${book}.${ch}.json`); if (r.ok) return await r.json(); } catch { /* not cached */ }
    const r = await fetch(`https://bolls.life/get-text/${tr}/${book}/${ch}/`); if (!r.ok) throw new Error(`bolls.life ${r.status}`);
    const arr = await r.json(); return Object.fromEntries(arr.map((v) => [String(v.verse), clean(v.text)]));
  }
  async function viewBible(id, range) {
    const idx = await loadIndex();
    let book = 45, ch = 8, v1 = 35, v2 = 39;
    if (id) { const [b, c] = id.split("."); book = +b || 45; ch = +c || 1; if (range) { const m = range.match(/(\d+)(?:-(\d+))?/); v1 = +m[1]; v2 = +(m[2] || m[1]); } else { v1 = 1; v2 = 999; } }
    else { const last = [...idx.sermons].reverse().find((s) => !s.placeholder && s.ref_zh); const m = last?.ref_zh.match(/(\S+)\s+(\d+):(\d+)(?:-(\d+))?/); if (m && bookByZh(m[1])) { book = bookByZh(m[1])[0]; ch = +m[2]; v1 = +m[3]; v2 = +(m[4] || m[3]); } }
    const B = BOOKS.find((b) => b[0] === book);
    main.innerHTML = `<h1>중국어 성경공부 · 中文查经</h1>
      <p class="muted small" style="margin:6px 0 14px;max-width:72ch">和合本과 개역한글을 나란히 놓고 병음을 붙였습니다. 본문 안의 <span class="gl">기독교 용어</span>는 용어 사전과 연결되고, 설교 본문에는 AI 查经单(배경·구조·원어·토론 질문)이 있습니다. 원어와 주석은 아래 참고 사이트 링크에서 확인하세요.</p>
      <div class="card" style="margin-bottom:16px"><div class="picker">
        <select id="bk">${BOOKS.map((b) => `<option value="${b[0]}" ${b[0] === book ? "selected" : ""}>${b[1]} · ${b[2]}</option>`).join("")}</select>
        <input id="ch" type="number" min="1" max="${B[4]}" value="${ch}"> 장
        <input id="v1" type="number" min="1" value="${v1}"> – <input id="v2" type="number" min="1" value="${v2 === 999 ? "" : v2}" placeholder="끝"> 절
        <button class="btn primary" type="button" id="go">열기</button>
        <span class="small muted">설교 본문: ${idx.sermons.filter((s) => !s.placeholder && s.ref_zh).map((s) => `<a href="#/bible/${bookByZh(s.ref_zh.split(" ")[0])?.[0]}.${s.ref_zh.split(" ")[1].split(":")[0]}/${s.ref_zh.split(":")[1]}">${esc(s.ref_zh)}</a>`).join(" · ")}</span>
      </div></div>
      <div class="bible-layout"><div id="bible-main"><p class="muted">불러오는 중…</p></div><aside class="gl-panel" id="gl-panel"></aside></div>
      <div class="card" style="margin-top:20px"><h2>기독교 중국어 용어 사전 · 基督教中文术语词典</h2><div id="glossary"></div></div>`;
    $("#go").addEventListener("click", () => { const b = $("#bk").value, c = $("#ch").value, a = $("#v1").value, z = $("#v2").value; location.hash = `#/bible/${b}.${c}/${a}-${z || a}`; });
    $("#bk").addEventListener("change", () => { $("#ch").max = BOOKS.find((b) => b[0] === +$("#bk").value)[4]; });
    const gl = await loadGlossary();
    renderGlossary($("#glossary"), gl);
    let zh, ko;
    try { [zh, ko] = await Promise.all([loadChapter("CUNPS", book, ch), loadChapter("KRV", book, ch)]); }
    catch (e) { $("#bible-main").innerHTML = `<div class="card"><p>본문을 불러오지 못했습니다 (${esc(e.message)}). 인터넷 연결 또는 bolls.life 접근을 확인하세요.</p></div>`; return; }
    const nums = Object.keys(zh).map(Number).sort((a, b) => a - b).filter((n) => n >= v1 && n <= v2);
    const terms = gl.terms.filter((t) => t.zh.length >= 2).sort((a, b) => b.zh.length - a.zh.length);
    const hits = new Map();
    const mark = (text) => { let html = esc(text); for (const t of terms) { if (text.includes(t.zh)) { hits.set(t.zh, t); html = html.split(t.zh).join(`<span class="gl" data-gl="${esc(t.zh)}" title="${esc(t.pinyin)} · ${esc(t.ko)}">${t.zh}</span>`); } } return html; };
    const refZh = `${B[1]} ${ch}:${nums[0]}${nums.length > 1 ? "-" + nums[nums.length - 1] : ""}`, refKo = `${B[2]} ${ch}:${nums[0]}${nums.length > 1 ? "-" + nums[nums.length - 1] : ""}`;
    const links = [
      [`信望愛 (fhl.net) — 원어·역본 대조`, `https://bible.fhl.net/new/read.php?chineses=${encodeURIComponent(B[5])}&chap=${ch}&sec=${nums[0] || 1}`],
      [`查經資料大全 (ccbiblestudy) — 註解`, CCBS[book] ? `https://www.ccbiblestudy.net/New%20Testament/${CCBS[book]}/${String(book).padStart(2, "0")}CT${String(ch).padStart(2, "0")}.htm` : "https://www.ccbiblestudy.net/"],
      [`BibleGateway CUVS`, `https://www.biblegateway.com/passage/?search=${encodeURIComponent(B[3] + " " + ch + ":" + (nums[0] || 1) + (nums.length > 1 ? "-" + nums[nums.length - 1] : ""))}&version=CUVS`],
      [`微读圣经 (wd.bible)`, `https://wd.bible/bible/${book <= 39 ? "ot" : "nt"}`],
    ];
    $("#bible-main").innerHTML = `<div class="card">
      <h2 lang="zh">${esc(refZh)} <span class="muted" style="font-family:var(--font-ko);font-size:1rem">${esc(refKo)}</span></h2>
      <p class="small muted">和合本 (CUNPS) · 개역한글 (KRV) · bolls.life. 병음은 브라우저에서 자동 생성(다음자는 틀릴 수 있음).</p>
      <div>${nums.map((n) => `<div class="verse"><div class="n tabular">${n}</div><div>
        <div class="zh" lang="zh">${mark(zh[n])} ${sayBtn(zh[n])}</div><span class="py">${esc(toPinyin(zh[n]))}</span>
        <div class="ko">${esc(ko[n] || "")} ${sayBtn(ko[n] || "", "ko")}</div></div></div>`).join("")}</div>
      <p style="margin-top:12px">${sayBtn(nums.map((n) => zh[n]).join(""), "zh")} 전체 듣기 · <a href="#/bible/${book}.${ch}">${ch}장 전체</a>${ch > 1 ? ` · <a href="#/bible/${book}.${ch - 1}">← ${ch - 1}장</a>` : ""}${ch < B[4] ? ` · <a href="#/bible/${book}.${ch + 1}">${ch + 1}장 →</a>` : ""}</p>
      <h3 style="margin-top:16px">참고 사이트 · 参考网站</h3><div class="reflinks">${links.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join("")}</div>
      <p class="small muted" style="margin-top:6px">查經資料大全은 번체(繁體) 사이트입니다. 사도행전·로마서는 장 단위로 바로 연결되고, 다른 책은 목차로 연결됩니다.</p>
    </div><div class="card study" id="study" style="margin-top:16px"><p class="muted">查经单 확인 중…</p></div>`;
    const panel = $("#gl-panel");
    panel.innerHTML = `<div class="card"><h3>본문 속 용어 · 本段术语 (${hits.size})</h3>${hits.size ? [...hits.values()].map(glTerm).join("") : `<p class="small muted">용어 사전과 겹치는 단어가 없습니다.</p>`}</div>`;
    $("#bible-main").addEventListener("click", (e) => { const g = e.target.closest("[data-gl]"); if (!g) return; const t = panel.querySelector(`[data-term="${CSS.escape(g.dataset.gl)}"]`); if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); t.style.outline = "2px solid var(--gold)"; setTimeout(() => (t.style.outline = ""), 1500); } });
    renderStudy($("#study"), { book: B, ch, v1: nums[0], v2: nums[nums.length - 1], refZh, text: nums.map((n) => `${n} ${zh[n]}`).join("\n") });
  }
  const glTerm = (t) => `<div class="gl-term" data-term="${esc(t.zh)}"><div class="cat">${esc(t.category || "")}</div>
      <div class="w"><span lang="zh">${esc(t.zh)}</span><span class="py">${esc(t.pinyin || "")}</span>${sayBtn(t.zh)}</div>
      <div><b>${esc(t.ko)}</b> <span class="muted small">${esc(t.en || "")}</span></div>
      <div class="d">${esc(t.def_ko || "")}</div>
      ${t.usage_zh ? `<div class="u"><span lang="zh">${esc(t.usage_zh)}</span><br><span class="muted">${esc(t.usage_ko || "")}</span>${t.ref ? ` <a class="small" href="${refLink(t.ref)}">${esc(t.ref)}</a>` : ""}</div>` : ""}
      ${t.bridge && t.bridge !== "none" ? bridgeHtml({ relation: t.bridge, hanja: t.hanja, ko_reading: t.ko_reading, ko_word: t.ko, note_ko: t.note_ko }) : t.note_ko ? `<div class="small muted">${esc(t.note_ko)}</div>` : ""}</div>`;
  const refLink = (ref) => { const m = String(ref).match(/(\S+)\s+(\d+):(\d+)(?:-(\d+))?/); const b = m && bookByZh(m[1]); return b ? `#/bible/${b[0]}.${m[2]}/${m[3]}-${m[4] || m[3]}` : "#/bible"; };
  function renderGlossary(el, gl) {
    const cats = gl.categories || [...new Set(gl.terms.map((t) => t.category))];
    el.innerHTML = `<p class="small muted" style="margin:4px 0 10px">${gl.terms.length}개 용어 · Gemini로 초안을 만들고 和合本 용례를 붙였습니다. 병음은 pypinyin. 오류를 발견하면 <code>data/glossary.json</code>을 고쳐 주세요.</p>
      <div class="filters" style="margin-bottom:10px"><input id="glq" type="search" placeholder="중국어·한국어·영어로 검색"><select id="glc"><option value="">모든 분류</option>${cats.map((c) => `<option>${esc(c)}</option>`).join("")}</select><button class="btn" type="button" id="gl-csv">CSV (Anki)</button></div>
      <div class="gl-list" id="gll"></div>`;
    const draw = () => { const q = $("#glq").value.trim().toLowerCase(), c = $("#glc").value;
      const f = gl.terms.filter((t) => (!c || t.category === c) && (!q || `${t.zh} ${t.pinyin} ${t.ko} ${t.en} ${t.def_ko}`.toLowerCase().includes(q)));
      $("#gll").innerHTML = f.slice(0, 120).map(glTerm).join("") + (f.length > 120 ? `<p class="muted small">${f.length - 120}개 더 있음 — 검색으로 좁히세요.</p>` : "") || `<p class="muted">결과 없음</p>`; };
    $("#glq").addEventListener("input", draw); $("#glc").addEventListener("change", draw); draw();
    $("#gl-csv").addEventListener("click", () => download("glossary.csv", "﻿" + gl.terms.map((t) => [t.zh, t.pinyin, t.ko, t.en, t.def_ko, t.usage_zh, t.usage_ko, t.ref].map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n")));
  }
  async function renderStudy(el, { book, ch, v1, v2, refZh, text }) {
    const file = `data/study/${book[1]}.${ch}.${v1}-${v2}.json`;
    let notes = null;
    try { const r = await fetch(file); if (r.ok) notes = await r.json(); } catch { /* none */ }
    if (!notes) notes = store.get("cp.study", {})[`${book[0]}.${ch}.${v1}-${v2}`] || null;
    if (!notes) {
      const key = store.get("cp.gemini", "");
      el.innerHTML = `<h2>查经单 · 성경공부 노트</h2><p class="small muted">이 구절의 노트가 아직 없습니다. 저장소에서 <code>python3 pipeline/study_notes.py "${esc(refZh)}"</code> 을 실행하거나, ${key ? "아래 버튼으로 브라우저에서 바로 만들 수 있습니다 (Gemini 1회 호출)." : "<a href='#/import'>가져오기</a>에 Gemini 키를 넣으면 여기서 바로 만들 수 있습니다."}</p>
        ${key ? `<p><button class="btn primary" type="button" id="mk-study">AI 查经单 만들기</button></p>` : ""}`;
      $("#mk-study")?.addEventListener("click", async () => {
        $("#mk-study").disabled = true; $("#mk-study").textContent = "생성 중… (30–60초)";
        try {
          const tpl = await (await fetch("data/prompts/study.txt")).text();
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: tpl.replace("{ref}", refZh).replace("{text}", text) }] }], generationConfig: { temperature: 0.3, responseMimeType: "application/json", maxOutputTokens: 32768 } }) });
          if (!r.ok) throw new Error(`Gemini ${r.status}`);
          const j = await r.json(); const n = JSON.parse((j.candidates?.[0]?.content?.parts?.[0]?.text || "").replace(/^```(?:json)?|```$/gm, "").trim());
          n.ref = refZh; n.generated_by = "gemini-3.1-pro-preview (browser)"; n.disclaimer_ko = "이 자료는 Gemini가 和合本 본문을 바탕으로 작성한 AI 학습 노트입니다. 특정 주석서의 인용이 아닙니다.";
          const all = store.get("cp.study", {}); all[`${book[0]}.${ch}.${v1}-${v2}`] = n; store.set("cp.study", all); renderStudy(el, { book, ch, v1, v2, refZh, text });
        } catch (e) { toast("생성 실패: " + e.message); $("#mk-study").disabled = false; $("#mk-study").textContent = "AI 查经单 만들기"; }
      });
      return;
    }
    const bi = (o) => o ? `<span lang="zh">${esc(o.zh)}</span><br><span class="muted">${esc(o.ko)}</span>` : "";
    el.innerHTML = `<h2>查经单 · 성경공부 노트 <span class="muted small" style="font-family:var(--font-ko)">${esc(notes.title_zh || "")} · ${esc(notes.title_ko || "")}</span></h2>
      <p class="disclaimer">${esc(notes.disclaimer_ko || "")} (${esc(notes.generated_by || "")})</p>
      <h3>배경 · 背景</h3><p>${bi(notes.background)}</p>
      <h3>구조 · 结构</h3><ol>${(notes.structure || []).map((x) => `<li><b class="tabular">${esc(x.range)}</b> ${bi(x)}</li>`).join("")}</ol>
      <h3>핵심 단어 · 关键词</h3><div class="kw">${(notes.keywords || []).map((k) => `<div><b lang="zh">${esc(k.zh)}</b> <span class="py">${esc(k.pinyin || "")}</span> ${sayBtn(k.zh)}${k.original ? `<div class="orig">${esc(k.original)}</div>` : ""}<div lang="zh">${esc(k.meaning_zh)}</div><div class="muted">${esc(k.meaning_ko)}</div>${k.verse ? `<div class="small muted">v.${esc(k.verse)}</div>` : ""}</div>`).join("")}</div>
      <h3>해설 · 解释要点</h3><ol>${(notes.points || []).map((x) => `<li>${bi(x)}</li>`).join("")}</ol>
      <h3>관련 구절 · 相关经文</h3><ul>${(notes.cross_refs || []).map((x) => `<li><a href="${refLink(x.ref)}" lang="zh">${esc(x.ref)}</a> — <span lang="zh">${esc(x.why_zh)}</span> <span class="muted">${esc(x.why_ko)}</span></li>`).join("")}</ul>
      <h3>나눔 질문 · 讨论问题</h3><ol class="q">${(notes.questions || []).map((x) => `<li>${bi(x)}</li>`).join("")}</ol>
      ${notes.memory_verse ? `<h3>암송 · 背诵</h3><p class="one-line"><span lang="zh">${esc(notes.memory_verse.zh)}</span> ${sayBtn(notes.memory_verse.zh)}<span class="py" style="display:block">${esc(notes.memory_verse.pinyin || toPinyin(notes.memory_verse.zh))}</span><span class="ko">${esc(notes.memory_verse.ko)} (${esc(notes.memory_verse.ref)})</span></p>` : ""}
      ${notes.prayer ? `<h3>기도 · 祷告</h3><p>${bi(notes.prayer)}</p>` : ""}`;
  }


  // ---------- 30초 도전: 5문장 따라 읽기 ----------
  const norm = (t) => String(t || "").replace(/[\s，。！？；：、“”‘’（）()\[\],.!?;:'"…·\-—]/g, "").toLowerCase();
  function similarity(a, b) {
    a = norm(a); b = norm(b); if (!a || !b) return 0;
    const m = a.length, n = b.length, dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return Math.max(0, Math.round((1 - dp[m][n] / Math.max(m, n)) * 100));
  }
  async function viewChallenge(id) {
    const s = await loadSermon(id); if (!s) { main.innerHTML = `<p class="muted">자료 없음</p>`; return; }
    const zhMode = L();
    const pool = (s.greeting ? s.greeting.zh.map((z, i) => ({ zh: z, ko: s.greeting.ko[i] || "", pinyin: toPinyin(z) })) : []).concat(s.key_sentences || []);
    const items = pool.slice(0, 5).map((k) => ({ target: zhMode ? k.zh : k.ko, other: zhMode ? k.ko : k.zh, pinyin: zhMode ? (k.pinyin || toPinyin(k.zh)) : "", lang: zhMode ? "zh-CN" : "ko-KR" }));
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const bestKey = `cp.best.${id}.${zhMode ? "zh" : "ko"}`; const best = store.get(bestKey, null);
    let i = 0, left = 30, timer = null, rec = null, results = [], listening = false, started = false;
    const finish = () => {
      clearInterval(timer); if (rec) { try { rec.stop(); } catch { /* */ } }
      while (results.length < items.length) results.push({ heard: "", pct: 0 });
      const total = Math.round(results.reduce((a, r) => a + r.pct, 0) / items.length);
      if (!best || total > best.total) store.set(bestKey, { total, at: Date.now() });
      main.innerHTML = `<div class="chal"><h1 style="text-align:center">결과 · 结果</h1>
        <p class="big">${total}점</p><p class="muted small" style="text-align:center">${best && total <= best.total ? `최고 기록 ${best.total}점` : "새 최고 기록!"} · 인식된 발음과 원문의 글자 일치율 평균</p>
        <ol class="scores">${items.map((it, k) => `<li><div><div lang="${it.lang.slice(0, 2)}">${esc(it.target)}</div><div class="small muted">들린 것: <b>${esc(results[k].heard || "—")}</b></div></div><div class="pct ${results[k].pct >= 80 ? "g" : results[k].pct >= 50 ? "w" : "b"}">${results[k].pct}%</div></li>`).join("")}</ol>
        <p style="display:flex;gap:8px;justify-content:center;margin-top:16px"><button class="btn primary" type="button" id="again">다시 도전</button><a class="btn" href="#/s/${id}/vocab">문장 복습</a><button class="btn" type="button" id="score-card">점수 카드</button></p></div>`;
      $("#again").onclick = () => viewChallenge(id);
      $("#score-card").onclick = () => shareSentenceCard({ zh: `${total}分 · 30秒挑战`, pinyin: `${items.length} 문장 따라 읽기`, ko: `${s.title.ko} · ${fmtDate(s.date)}`, foot: "讲道中文 30초 도전" });
    };
    const draw = () => {
      if (i >= items.length) return finish();
      const it = items[i];
      main.innerHTML = `<div class="chal">
        <p class="eyebrow" style="text-align:center">30초 도전 · 30秒挑战 — ${esc(s.title.ko)}</p>
        <h1 style="text-align:center;margin:6px 0 14px">${zhMode ? "5문장 따라 읽기" : "5个韩语句子跟读"}</h1>
        <div style="display:flex;justify-content:space-between;align-items:center"><span class="muted tabular">${i + 1} / ${items.length}</span><span class="timer ${left <= 10 ? "low" : ""}" id="timer">${left}s</span></div>
        <div class="progress"><i style="width:${(i / items.length) * 100}%"></i></div>
        <div class="target"><div class="zh" lang="${it.lang.slice(0, 2)}">${esc(it.target)}</div>${it.pinyin ? `<span class="py">${esc(it.pinyin)}</span>` : ""}<div class="ko">${esc(it.other)}</div>
          <div style="margin-top:10px">${sayBtn(it.target, it.lang.slice(0, 2))}</div>
          <button class="mic ${listening ? "on" : ""}" type="button" id="mic" aria-label="녹음">🎙</button>
          <div class="heard" id="heard">${SR ? (listening ? "듣는 중… 문장을 읽어 주세요" : (started ? "마이크를 눌러 다음 문장을 읽으세요" : "마이크를 누르면 30초가 시작됩니다")) : "이 브라우저는 음성 인식을 지원하지 않습니다 (Chrome·Edge·Safari 최신 버전 권장). 직접 채점으로 진행합니다."}</div>
          ${SR ? `<p class="small muted" style="margin-top:8px"><button class="mini" type="button" id="skip">건너뛰기</button></p>` : `<p style="margin-top:10px;display:flex;gap:6px;justify-content:center"><button class="btn good" type="button" data-self="100">잘 읽었다</button><button class="btn" type="button" data-self="60">대충 읽었다</button><button class="btn bad" type="button" data-self="20">못 읽었다</button></p>`}
        </div>
        ${best ? `<p class="small muted" style="text-align:center;margin-top:10px">최고 기록 ${best.total}점</p>` : ""}
        <p class="small muted" style="text-align:center;margin-top:10px">점수 = 음성 인식 결과와 원문의 글자 일치율. 마이크 권한을 허용해 주세요. 소리는 브라우저 안에서만 처리됩니다.</p></div>`;
      $("#timer").textContent = `${left}s`;
      const startTimer = () => { if (started) return; started = true; timer = setInterval(() => { left--; const t = $("#timer"); if (t) { t.textContent = `${left}s`; t.classList.toggle("low", left <= 10); } if (left <= 0) finish(); }, 1000); };
      $("#mic")?.addEventListener("click", () => {
        startTimer();
        if (!SR) return;
        if (listening) { try { rec.stop(); } catch { /* */ } return; }
        rec = new SR(); rec.lang = it.lang; rec.interimResults = true; rec.maxAlternatives = 3; listening = true; $("#mic").classList.add("on"); $("#heard").textContent = "듣는 중…";
        let finalText = "";
        rec.onresult = (e) => { let interim = ""; for (const r of e.results) { if (r.isFinal) { let bestAlt = r[0].transcript, bestPct = -1; for (const alt of r) { const pct = similarity(alt.transcript, it.target); if (pct > bestPct) { bestPct = pct; bestAlt = alt.transcript; } } finalText += bestAlt; } else interim += r[0].transcript; } $("#heard").innerHTML = `들린 것: <b>${esc(finalText || interim)}</b>`; };
        rec.onerror = (e) => { $("#heard").textContent = e.error === "not-allowed" ? "마이크 권한이 필요합니다." : `인식 오류: ${e.error}`; listening = false; $("#mic")?.classList.remove("on"); };
        rec.onend = () => { listening = false; if (finalText || left <= 0) { results.push({ heard: finalText, pct: similarity(finalText, it.target) }); i++; setTimeout(draw, 500); } else { $("#mic")?.classList.remove("on"); if ($("#heard") && !$("#heard").textContent.includes("오류") && !$("#heard").textContent.includes("권한")) $("#heard").textContent = "아무것도 들리지 않았습니다. 다시 눌러 읽어 주세요."; } };
        try { rec.start(); } catch (e) { $("#heard").textContent = "마이크를 시작할 수 없습니다: " + e.message; listening = false; }
      });
      $("#skip")?.addEventListener("click", () => { startTimer(); if (rec) { try { rec.abort(); } catch { /* */ } } results.push({ heard: "", pct: 0 }); i++; draw(); });
      main.querySelectorAll("[data-self]").forEach((b) => b.addEventListener("click", () => { startTimer(); results.push({ heard: "(직접 채점)", pct: +b.dataset.self }); i++; draw(); }));
    };
    draw();
  }

  // ---------- 예배 전 화면 (screen mode) ----------
  async function viewScreen(id) {
    const s = await loadSermon(id); if (!s) { main.innerHTML = `<p class="muted">자료 없음</p>`; return; }
    const slides = [];
    (s.greeting?.zh || []).forEach((z, i) => slides.push({ lbl: "本周问候 · 이번 주 인사 — 옆 사람과 서로의 말로", zh: z, py: toPinyin(z), ko: s.greeting.ko[i] || "" }));
    const verse = (s.video?.beats || []).find((b) => b.kind === "verse") || (s.scripture.verses[0] && { zh: s.scripture.verses[0].zh, ko: s.scripture.verses[0].ko, pinyin: s.scripture.verses[0].pinyin });
    if (verse) slides.push({ lbl: `本周金句 · 이번 주 말씀 — ${s.scripture.ref_zh} · ${s.scripture.ref_ko}`, zh: verse.zh, py: verse.pinyin || toPinyin(verse.zh), ko: verse.ko });
    if (s.one_line) slides.push({ lbl: "本周讲道 · 이번 주 설교 한 문장", zh: s.one_line.zh, py: toPinyin(s.one_line.zh), ko: s.one_line.ko });
    let i = 0;
    const draw = () => { const c = slides[i]; main.innerHTML = `<div class="screen-stage" id="stage" tabindex="0">
        <div class="hint">클릭·→ 다음 · ← 이전 · F 전체화면 · Esc 나가기${s.slideMeta ? ` · <a href="${esc(s.slideMeta)}" download style="color:#e8b44c">PPTX 내려받기</a>` : ""}</div>
        <div class="dots">${i + 1} / ${slides.length}</div>
        <div><span class="lbl">${esc(c.lbl)}</span><div class="zh" lang="zh">${esc(c.zh)}</div><span class="py">${esc(c.py)}</span><div class="ko">${esc(c.ko)}</div></div>
        <div class="foot">${esc(s.church.zh)} · ${esc(s.church.ko)} · ${fmtDate(s.date)} · ${esc(s.title.zh || "")} / ${esc(s.title.ko)}</div></div>`;
      $("#stage").focus(); };
    draw();
    const nav = (d) => { i = (i + d + slides.length) % slides.length; draw(); };
    main.onclick = (e) => { if (!e.target.closest("a")) nav(1); };
    const key = (e) => { if (!document.body.classList.contains("screen")) { document.removeEventListener("keydown", key); return; }
      if (e.key === "ArrowRight" || e.key === " ") nav(1); else if (e.key === "ArrowLeft") nav(-1); else if (e.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.(); else if (e.key === "Escape" && !document.fullscreenElement) location.hash = `#/s/${id}`; };
    document.addEventListener("keydown", key);
  }

  function download(name, text) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  applyPrefs();
  if ("speechSynthesis" in window) speechSynthesis.getVoices();
  route();
})();
