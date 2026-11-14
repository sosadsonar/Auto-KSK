// ==UserScript==
// @name         HIS - KSK >18 tuổi: Auto điền
// @namespace    https://bvbacgiang.vncare.vn/
// @version      0.5.0
// @description  Tự điền phiếu Khám sức khỏe trên 18 tuổi (mỗi bác sĩ điền mục của mình) + luồng tự động: đăng nhập HIS → Thiết lập phòng → Khám bệnh → mở phiếu KSK. Ký số sẽ bổ sung sau.
// @match        https://bvbacgiang.vncare.vn/vnpthis/main/manager.jsp*
// @match        https://bvbacgiang.vncare.vn/vnpthis/login/login.jsp*
// @match        https://bvbacgiang.vncare.vn/vnpthis
// @match        https://bvbacgiang.vncare.vn/vnpthis/*
// @match        https://ausca.vnpt.vn/Account/Login*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  // Chỉ chạy trong frame của phiếu KSK >18 tuổi.
  if (!/KSK_TREN18TUOI_TOANDAN_QD2062/.test(location.search)) return;
  if (window.__kskAutoFill) return;
  window.__kskAutoFill = true;

  // ───────────────────────────── Cấu hình ─────────────────────────────
  const CFG_KEY = 'kskAuto.cfg.v1';
  const SAVE_DELAY = 900; // ms chờ sau mỗi lần bấm Lưu
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

  const DEFAULT_CFG = {
    textNormal: 'Bình thường', // ô nhận xét của các mục khám
    none: 'Không',             // ô "Các bệnh về ... (nếu có)"
    thiLuc: '10/10',           // thị lực không kính, mắt phải + trái
    noiThuong: '5m',           // thính lực nói thường (tai trái + phải)
    noiTham: '0.5m',           // thính lực nói thầm (tai trái + phải)
    hamTren: '',               // để trống = không điền (chờ bạn chốt nội dung)
    hamDuoi: '',
    phanLoai: '1',             // Loại I
    saveMode: 'section',       // 'none' | 'section' (nút Lưu từng mục) | 'main' (nút Lưu chung)
    overwrite: false,          // false = chỉ điền ô đang trống
    onlyMine: true,            // true = chỉ điền các mục gán cho bác sĩ đang đăng nhập (user_id của HIS)
    summary: true,             // điền "Tình trạng bệnh / Ghi chú" ở Tổng kết = tổng hợp các mục đã điền
    doctors: {},               // lck -> value của bác sĩ
  };

  // lck = giá trị thuộc tính loai-chuyen-khoa của nút Lưu / Ký số
  const textSection = (lck, label, txt, cls, doc) => ({
    lck, label, cls, doc, sumId: txt,
    fields: [{ id: txt, cfg: 'textNormal' }],
  });

  const SECTIONS = [
    textSection('TUANHOAN', 'Nội khoa › Tuần hoàn', 'txtTUANHOAN', 'cboPHANLOAI_TUANHOAN', 'cboTUANHOAN_BACSY'),
    textSection('HOHAP', 'Nội khoa › Hô hấp', 'txtHOHAP', 'cboPHANLOAI_HOHAP', 'cboHOHAP_BACSY'),
    textSection('TIEUHOA', 'Nội khoa › Tiêu hóa', 'txtTIEUHOA', 'cboPHANLOAI_TIEUHOA', 'cboTIEUHOA_BACSY'),
    textSection('THANTIETNIEU', 'Nội khoa › Thận - tiết niệu', 'txtTHANTIETNIEU', 'cboPHANLOAI_THANTIETNIEU', 'cboTHANTIETNIEU_BACSY'),
    textSection('NOITIET', 'Nội khoa › Nội tiết', 'txtNOITIET', 'cboPHANLOAI_NOITIET', 'cboNOITIET_BACSY'),
    textSection('COXUONGKHOP', 'Nội khoa › Cơ xương khớp', 'txtCOXUONGKHOP', 'cboPHANLOAI_CXK', 'cboCOXUONGKHOP_BACSY'),
    textSection('THANKINH', 'Nội khoa › Thần kinh', 'txtTHANKINH', 'cboPHANLOAI_THANKINH', 'cboTHANKINH_BACSY'),
    textSection('TAMTHAN', 'Nội khoa › Tâm thần', 'txtTAMTHAN', 'cboPHANLOAI_TAMTHAN', 'cboTAMTHAN_BACSY'),
    textSection('NGOAIKHOA', 'Ngoại khoa', 'txtNGOAIKHOA', 'cboPHANLOAI_NGOAIKHOA', 'cboNGOAIKHOA_BACSY'),
    textSection('DALIEU', 'Da liễu', 'txtDALIEU', 'cboPHANLOAI_DALIEU', 'cboDALIEU_BACSY'),
    textSection('SANPHUKHOA', 'Sản phụ khoa', 'txtSANPHUKHOA', 'cboPHANLOAI_SANPHUKHOA', 'cboSANPHUKHOA_BACSY'),
    {
      lck: 'MAT', label: 'Mắt', cls: 'cboPHANLOAI_MAT', doc: 'cboMAT_BACSY', sumId: 'txtCACBENHVEMAT',
      fields: [
        { id: 'txtKHONGKINH_MATPHAI', cfg: 'thiLuc' },
        { id: 'txtKHONGKINH_MATTRAI', cfg: 'thiLuc' },
        { id: 'txtCACBENHVEMAT', cfg: 'none' },
      ],
    },
    {
      lck: 'TAIMUIHONG', label: 'Tai mũi họng', cls: 'cboPHANLOAI_TMH', doc: 'cboTMH_BACSY', sumId: 'txtCACBENHVETMH',
      fields: [
        { id: 'txtTAITRAI_NOITHUONG', cfg: 'noiThuong' },
        { id: 'txtTAITRAI_NOITHAM', cfg: 'noiTham' },
        { id: 'txtTAIPHAI_NOITHUONG', cfg: 'noiThuong' },
        { id: 'txtTAIPHAI_NOITHAM', cfg: 'noiTham' },
        { id: 'txtCACBENHVETMH', cfg: 'none' },
      ],
    },
    {
      lck: 'RANGHAMMAT', label: 'Răng hàm mặt', cls: 'cboPHANLOAI_RHM', doc: 'cboRHM_BACSY', sumId: 'txtCACBENHVERHM',
      fields: [
        { id: 'txtHAMTREN', cfg: 'hamTren' },
        { id: 'txtHAMDUOI', cfg: 'hamDuoi' },
        { id: 'txtCACBENHVERHM', cfg: 'none' },
      ],
    },
    // Tab "Cơ - Xương - Khớp" (COXUONGKHOP1) cố ý bỏ qua: không cần điền.
  ];

  const TAB_IDS = [1, 2, 3, 4, 5, 6, 7].map((i) => 'clinicalSpecialtyTab' + i);

  // ───────────────────────────── Tiện ích ─────────────────────────────
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 30000, step = 300) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const r = fn();
      if (r) return r;
      await sleep(step);
    }
    return null;
  };

  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    kids.flat().forEach((c) => e.append(c && c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  };

  const loadCfg = () => {
    let o = {};
    try { o = JSON.parse(GM_getValue(CFG_KEY, '{}')) || {}; } catch (e) { /* bỏ qua */ }
    return Object.assign({}, DEFAULT_CFG, o, { doctors: Object.assign({}, o.doctors || {}) });
  };
  const saveCfg = (cfg) => GM_setValue(CFG_KEY, JSON.stringify(cfg));

  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

  function setVal(el, v) {
    if (!el || el.disabled || el.readOnly) return false;
    el.value = v;
    fire(el, 'input');
    fire(el, 'change');
    return true;
  }
  function setSelect(el, v) {
    if (!el || el.disabled) return false;
    // Kiểm tra option có tồn tại trước, để không làm ô select bị trống khi giá trị không hợp lệ
    if (![...el.options].some((o) => o.value === String(v))) return false;
    el.value = String(v);
    fire(el, 'change');
    return true;
  }
  // Mục có thể để trống: không chặn việc điền/ký Tổng kết (khoa sắp bỏ)
  const OPTIONAL = new Set(['COXUONGKHOP']);

  // Ô do chính bạn sửa tay thì script không ghi đè (nhớ trong tab, 10 phút; luồng mở phiếu mới tự xoá)
  const EDIT_KEY = 'kskAuto.edited.v1';
  const EDIT_TTL = 10 * 60 * 1000;
  const readEdits = () => { try { return JSON.parse(sessionStorage.getItem(EDIT_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const userEdited = (id) => { const t = readEdits()[id]; return !!t && Date.now() - t < EDIT_TTL; };
  const onUserEdit = (e) => {
    if (!e.isTrusted || !e.target || !e.target.id) return; // chỉ tính thao tác thật của người dùng
    try { const m = readEdits(); m[e.target.id] = Date.now(); sessionStorage.setItem(EDIT_KEY, JSON.stringify(m)); } catch (err) { /* bỏ qua */ }
  };
  document.addEventListener('input', onUserEdit, true);
  document.addEventListener('change', onUserEdit, true);
  // Nút ⏹ (ở thanh KSK Auto) ghi mốc giờ; các vòng lặp điền/ký dừng khi mốc mới hơn lúc bắt đầu
  const stopped = (t0) => Number(GM_getValue('kskAuto.stop.v1', 0)) > t0;
  const isUnset = (v) => v === '' || v === '-1' || v === '0';

  // Nút mờ/không bấm được
  const inactive = (b) => {
    if (b.disabled || b.classList.contains('disabled')) return true;
    const cs = getComputedStyle(b);
    return cs.pointerEvents === 'none' || parseFloat(cs.opacity) < 0.9;
  };
  // Đã ký = "Hủy ký" sáng VÀ "Lưu & Ký số" mờ (an toàn: nếu không nhận ra thì coi là chưa ký)
  const isSigned = (lck) => {
    const huy = document.querySelector('button#btnHuyKySo[loai-chuyen-khoa="' + lck + '"]');
    const ky = document.querySelector('button#btnKySo[loai-chuyen-khoa="' + lck + '"]');
    return !!huy && !inactive(huy) && !!ky && inactive(ky);
  };
  const findSaveBtn = (lck) =>
    [...document.querySelectorAll('button[loai-chuyen-khoa="' + lck + '"]')]
      .find((b) => /Lưu/.test(b.textContent) && !/Ký/.test(b.textContent));

  // Đóng hộp thoại alertify dạng thông báo (không đụng tới hộp xác nhận), trả về nội dung
  function dismissAlerts() {
    const msgs = [];
    const docs = [document];
    try { let w = window; while (w.parent && w.parent !== w) { w = w.parent; docs.push(w.document); } } catch (e) { /* cross-origin */ }
    docs.forEach((d) => {
      const box = d.getElementById('alertify');
      const ok = d.getElementById('alertify-ok');
      if (box && ok && box.classList.contains('alertify-alert') && !box.classList.contains('alertify-hidden')) {
        const m = box.querySelector('.alertify-message');
        msgs.push(m ? m.textContent.trim() : '(thông báo)');
        ok.click();
      }
    });
    return msgs;
  }

  // Bác sĩ đăng nhập bằng nút 🔑 (profile có gán khoa / tổng kết) → theo phân công của profile; không thì null
  // Đối chiếu với thanh "Người dùng: … - LGG.xxx" của HIS: nếu đang đăng nhập tài khoản khác thì không áp phân công của profile
  // Nhiều bác sĩ cùng tick một mục: chỉ người được chọn (kskAuto.assign.v1: {mã mục | 'TONGKET': hisUser}) làm mục đó
  function effectiveOf(p, ps) {
    let assign = {};
    try { assign = JSON.parse(GM_getValue('kskAuto.assign.v1', '') || '{}') || {}; } catch (e) { /* bỏ qua */ }
    const owners = (l) => ps.filter((q) => (l === 'TONGKET' ? q.tongKet : (q.sections || []).includes(l))).map((q) => q.hisUser);
    const ok = (l) => { const o = owners(l), a = assign[l]; return o.length < 2 || !a || !o.includes(a) || a === p.hisUser; };
    return Object.assign({}, p, { sections: (p.sections || []).filter(ok), tongKet: !!p.tongKet && ok('TONGKET') });
  }
  let profMismatch = '';
  function currentProfile() {
    profMismatch = '';
    try {
      const cur = JSON.parse(GM_getValue('kskAuto.cur.v1', '') || 'null');
      const ps = JSON.parse(GM_getValue('kskAuto.profiles.v1', '') || '[]');
      const p = cur && ps.find((x) => x.hisUser === cur.hisUser);
      if (!p || !((p.sections || []).length || p.tongKet)) return null;
      try {
        const t = String(window.top.document.body.innerText || window.top.document.body.textContent || '').toLowerCase();
        if (/người dùng/.test(t) && !t.includes(String(p.hisUser).toLowerCase())) {
          profMismatch = 'Đang đăng nhập tài khoản khác với "' + (p.label || p.hisUser) + '" (đã chọn bằng nút 🔑) nên bỏ qua phân công theo profile. Hãy đăng xuất và đăng nhập lại bằng nút 🔑.';
          return null;
        }
      } catch (e) { /* không đọc được khung ngoài → tin profile */ }
      return effectiveOf(p, ps);
    } catch (e) { return null; }
  }

  // ───────────────────────────── Thông báo nổi ─────────────────────────────
  let toastEl;
  function toast(lines, ms = 15000) {
    if (!toastEl) {
      toastEl = h('div', {
        style: 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);max-width:80vw;z-index:2147483000;' +
          'background:#222;color:#fff;padding:10px 14px;border-radius:6px;font-size:13px;line-height:1.5;cursor:pointer;' +
          'box-shadow:0 2px 10px rgba(0,0,0,.4);display:none',
        id: 'kskToast',
        onclick: () => { toastEl.style.display = 'none'; },
      });
      document.body.appendChild(toastEl);
    }
    toastEl.replaceChildren(...[].concat(lines).map((l) => h('div', {}, l)));
    toastEl.style.display = 'block';
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { toastEl.style.display = 'none'; }, ms);
  }

  // ───────────────────────────── Logic điền ─────────────────────────────
  async function ensureRendered() {
    const need = () => SECTIONS.flatMap((s) => [...s.fields.map((f) => f.id), s.cls, s.doc]).filter((id) => !$(id));
    if (!need().length) return [];
    // Nếu phần tử chưa có trong DOM thì bấm qua các tab khám để HIS dựng ra.
    for (const id of TAB_IDS) { const b = $(id); if (b) { b.click(); await sleep(250); } }
    const first = $(TAB_IDS[0]);
    if (first) first.click();
    await sleep(200);
    return need();
  }

  function maxClass() {
    let m = 0;
    ['cboPHANLOAITHELUC_CHON', ...SECTIONS.map((s) => s.cls)].forEach((id) => {
      const e = $(id);
      const n = e ? parseInt(e.value, 10) : 0;
      if (n > m) m = n;
    });
    return m;
  }

  // Ghi chú tổng kết (ĐỀ XUẤT, mặc định tắt): liệt kê các mục có nội dung khác "Bình thường"/"Không"
  function buildSummary(cfg) {
    const ignore = new Set(['', 'bình thường', 'binh thuong', 'không', 'khong']);
    const parts = [];
    SECTIONS.forEach((s) => {
      const e = $(s.sumId);
      const v = e ? e.value.trim() : '';
      if (!ignore.has(v.toLowerCase())) parts.push(s.label.replace(/^.*› /, '') + ': ' + v);
    });
    return parts.length ? parts.join('; ') : cfg.none;
  }

  let running = false;
  async function autoFill(opts) {
    if (running) return;
    running = true;
    const t0 = Date.now();
    console.log('[KSK auto] autoFill bắt đầu', new Date().toLocaleTimeString());
    const btn = $('kskAutoFill');
    if (btn) btn.disabled = true;
    try {
      // bấm tay: nếu mục bạn phụ trách trùng với bác sĩ khác mà chưa chọn ai làm thì hỏi trước (luồng chạy tất cả đã hỏi từ đầu)
      if (!(opts && opts.batch) && window.__kskAssign && !(await window.__kskAssign.ensure())) { toast('Đã huỷ, chưa điền gì.'); return ['Đã huỷ']; }
      const cfg = loadCfg();
      const missingEls = await ensureRendered();
      const rep = { filled: [], signed: [], noDoctor: [], badDoctor: [], notMine: [], missing: missingEls, msgs: [], tk: [], errs: [], mine: [] };
      const toSave = [];
      const myId = $('user_id') ? $('user_id').value : '';
      // Nếu đăng nhập bằng nút 🔑 (profile có gán khoa / tổng kết) thì theo phân công của profile; không thì theo user_id như trước
      const prof = currentProfile();
      const filterMine = cfg.onlyMine && (!!prof || !!myId);
      if (prof) rep.msgs.push('Theo phân công của ' + (prof.label || prof.hisUser));
      if (profMismatch) rep.errs.push(profMismatch);
      if (cfg.onlyMine && !myId && !prof) rep.errs.push('Không đọc được tài khoản HIS đang đăng nhập (user_id) nên không lọc theo bác sĩ');

      for (const s of SECTIONS) {
        if (stopped(t0)) { rep.errs.push('đã dừng theo yêu cầu (⏹)'); break; }
        // Bác sĩ khoa này không điền hộ bác sĩ khoa khác: chỉ làm các mục gán cho tài khoản đang đăng nhập
        const assigned = cfg.doctors[s.lck] || '';
        if (filterMine && prof) {
          if (!(prof.sections || []).includes(s.lck)) { rep.notMine.push(s.label); continue; }
        } else if (filterMine && assigned !== myId) { (assigned ? rep.notMine : rep.noDoctor).push(s.label); continue; }
        if (isSigned(s.lck)) { rep.signed.push(s.label); continue; }
        let touched = false;

        for (const f of s.fields) {
          const el = $(f.id);
          const val = cfg[f.cfg];
          if (!el || !val) continue;
          if (userEdited(f.id)) { rep.mine.push(s.label); continue; }
          if (!cfg.overwrite && el.value.trim() !== '') continue;
          if (setVal(el, val)) touched = true;
        }

        const c = $(s.cls);
        if (c && !userEdited(s.cls) && (cfg.overwrite || isUnset(c.value))) { if (setSelect(c, cfg.phanLoai)) touched = true; }

        const d = $(s.doc);
        // đang lọc theo bác sĩ đăng nhập → chính bác sĩ đó là người khám mục này (không cần đặt trong ⚙)
        const dv = filterMine && myId ? myId : cfg.doctors[s.lck];
        if (d && userEdited(s.doc)) { /* bác sĩ do bạn tự chọn: giữ nguyên */ }
        else if (d) {
          if (!dv) rep.noDoctor.push(s.label);
          else if (d.value !== dv) {
            if (setSelect(d, dv)) touched = true; else rep.badDoctor.push(s.label);
          }
        }
        if (touched) { rep.filled.push(s.label); toSave.push(s); }
      }

      // Tổng kết: phân loại = loại cao nhất (số La Mã lớn nhất) trong các phân loại đã chọn
      let tkTouched = false;
      const tkSigned = (() => { const b = $('btnHuyCaTong'); return !!b && !inactive(b); })();
      // Chỉ điền Tổng kết khi mọi mục đã có phân loại (tránh tính thiếu khi bác sĩ khác chưa điền/lưu)
      const allClassified = SECTIONS.every((s) => { if (OPTIONAL.has(s.lck)) return true; const e = $(s.cls); return !!e && !isUnset(e.value); });
      if (filterMine && prof && !prof.tongKet) rep.tk.push('không phải bác sĩ phụ trách tổng kết');
      else if (!tkSigned && allClassified) {
        const m = maxClass();
        const sel = $('cboPHANLOAISUCKHOE_CHON');
        if (m && sel && !userEdited('cboPHANLOAISUCKHOE_CHON') && (cfg.overwrite || isUnset(sel.value))) {
          if (setSelect(sel, String(m))) { rep.tk.push('Phân loại sức khỏe = Loại ' + ROMAN[m]); tkTouched = true; }
        }
        if (cfg.summary) {
          const ta = $('txtTINHTRANGBENH');
          if (ta && !userEdited('txtTINHTRANGBENH') && (cfg.overwrite || !ta.value.trim())) {
            if (setVal(ta, buildSummary(cfg))) { rep.tk.push('Đã điền ghi chú tổng kết'); tkTouched = true; }
          }
        }
      } else if (tkSigned) rep.tk.push('Tổng kết đã ký, bỏ qua');
      else rep.tk.push('chưa điền vì còn mục chưa có phân loại (bác sĩ khác chưa điền/lưu)');

      // Lưu
      if (cfg.saveMode === 'section') {
        for (const s of toSave) {
          if (stopped(t0)) { rep.errs.push('đã dừng theo yêu cầu (⏹) trước khi lưu hết'); break; }
          const b = findSaveBtn(s.lck);
          if (!b) { rep.errs.push('Không thấy nút Lưu của ' + s.label); continue; }
          b.click();
          await sleep(SAVE_DELAY);
          rep.msgs.push(...dismissAlerts());
        }
        if (tkTouched && $('btnLuu')) { $('btnLuu').click(); await sleep(SAVE_DELAY); rep.msgs.push(...dismissAlerts()); }
      } else if (cfg.saveMode === 'main') {
        if ((toSave.length || tkTouched) && $('btnLuu')) { $('btnLuu').click(); await sleep(SAVE_DELAY); rep.msgs.push(...dismissAlerts()); }
      }

      const L = [`Đã điền ${rep.filled.length} mục` + (filterMine ? ` (tài khoản user_id ${myId})` : '') +
        (cfg.saveMode === 'none' ? ' (chưa lưu).' : cfg.saveMode === 'main' ? ' và bấm Lưu chung.' : ' và bấm Lưu từng mục.')];
      if (rep.tk.length) L.push('Tổng kết: ' + rep.tk.join('; '));
      if (rep.signed.length) L.push('Bỏ qua (đã ký): ' + rep.signed.join(', '));
      if (rep.notMine.length) L.push('Mục của bác sĩ khác (bỏ qua): ' + rep.notMine.join(', '));
      if (rep.noDoctor.length) L.push('⚠ Chưa đặt bác sĩ (vào ⚙ Cài đặt): ' + rep.noDoctor.join(', '));
      if (rep.badDoctor.length) L.push('⚠ Bác sĩ đã cài không có trong danh sách của: ' + rep.badDoctor.join(', '));
      if (rep.missing.length) L.push('⚠ Không tìm thấy ô: ' + rep.missing.join(', '));
      if (rep.mine.length) L.push('Giữ nguyên các ô bạn đã tự sửa ở: ' + [...new Set(rep.mine)].join(', '));
      if (rep.errs.length) L.push('⚠ ' + rep.errs.join('; '));
      if (rep.msgs.length) L.push('Thông báo của HIS: ' + rep.msgs.join(' | '));
      console.log('[KSK auto] autoFill xong', new Date().toLocaleTimeString(), L);
      toast(L, 25000);
      return L;
    } catch (e) {
      console.error('[KSK auto]', e);
      toast('Lỗi script: ' + e.message);
      return ['Lỗi script: ' + e.message];
    } finally {
      running = false;
      if (btn) btn.disabled = false;
    }
  }

  // ───────────────────────────── Cài đặt ─────────────────────────────
  function doctorOptions() {
    let best = [];
    SECTIONS.forEach((s) => {
      const sel = $(s.doc);
      if (!sel) return;
      const o = [...sel.options].filter((x) => x.value && x.value !== '0')
        .map((x) => ({ value: x.value, text: x.textContent.trim() }));
      if (o.length > best.length) best = o;
    });
    return best;
  }

  function closeSettings() { const m = $('kskModal'); if (m) m.remove(); }

  function openSettings() {
    closeSettings();
    const cfg = loadCfg();
    const docs = doctorOptions();
    const inputs = {};
    const docSel = {};

    const textField = (key, label, ph) => {
      const i = h('input', { type: 'text', style: 'width:100%;padding:3px 6px', placeholder: ph || '' });
      i.value = cfg[key];
      inputs[key] = i;
      return h('label', { style: 'display:block;margin:0' }, h('div', { style: 'font-weight:600' }, label), i);
    };
    const mkDoc = (val) => {
      const s = h('select', { style: 'width:100%;padding:3px' },
        h('option', { value: '' }, '— không đặt (bỏ qua) —'),
        docs.map((d) => h('option', { value: d.value }, d.text)));
      s.value = val || '';
      return s;
    };

    // Bác sĩ
    const allSel = mkDoc('');
    const docRows = SECTIONS.map((s) => {
      docSel[s.lck] = mkDoc(cfg.doctors[s.lck]);
      return h('div', { style: 'display:grid;grid-template-columns:200px 1fr;gap:8px;align-items:center;margin:3px 0' },
        h('div', {}, s.label), docSel[s.lck]);
    });

    // Chế độ lưu + tuỳ chọn
    const saveSel = h('select', { style: 'padding:3px' },
      h('option', { value: 'section' }, 'Bấm nút Lưu của từng mục (rồi Lưu chung cho Tổng kết)'),
      h('option', { value: 'main' }, 'Chỉ bấm nút Lưu chung ở dưới'),
      h('option', { value: 'none' }, 'Không tự lưu (chỉ điền)'));
    saveSel.value = cfg.saveMode;
    const plSel = h('select', { style: 'padding:3px' },
      ['1', '2', '3', '4', '5'].map((v) => h('option', { value: v }, 'Loại ' + ROMAN[+v])));
    plSel.value = cfg.phanLoai;
    const chkOver = h('input', { type: 'checkbox' }); chkOver.checked = !!cfg.overwrite;
    const chkMine = h('input', { type: 'checkbox' }); chkMine.checked = !!cfg.onlyMine;
    const chkSum = h('input', { type: 'checkbox' }); chkSum.checked = !!cfg.summary;

    const grid = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:6px 0';
    const box = h('div', { style: 'background:#fff;width:min(960px,94vw);max-height:90vh;overflow:auto;border-radius:6px;padding:16px;font-size:13px;color:#222' },
      h('h4', { style: 'margin:0 0 8px' }, '⚙ Cài đặt Auto điền KSK'),
      h('div', { style: 'font-weight:700;margin-top:8px' }, '1) Bác sĩ khám của từng mục (không bắt buộc: khi bác sĩ đăng nhập và bấm Auto điền, script tự chọn chính bác sĩ đó ở các mục của họ)'),
      docs.length ? '' : h('div', { style: 'color:#b00' }, 'Chưa đọc được danh sách bác sĩ (trang chưa tải xong). Đóng rồi mở lại sau vài giây.'),
      h('div', { style: 'display:grid;grid-template-columns:200px 1fr 90px;gap:8px;align-items:center;margin:6px 0;padding:6px;background:#f3f6fb' },
        h('div', { style: 'font-weight:600' }, 'Áp dụng cho TẤT CẢ'), allSel,
        h('button', {
          type: 'button', class: 'btn btn-sm btn-default',
          onclick: () => { Object.values(docSel).forEach((s) => { s.value = allSel.value; }); },
        }, 'Áp dụng')),
      docRows,
      h('div', { style: 'font-weight:700;margin-top:12px' }, '2) Giá trị mặc định'),
      h('div', { style: grid },
        textField('textNormal', 'Ô nhận xét các mục khám'),
        textField('none', 'Ô "Các bệnh về ... (nếu có)"'),
        textField('thiLuc', 'Thị lực không kính (mỗi mắt)'),
        textField('noiThuong', 'Thính lực nói thường'),
        textField('noiTham', 'Thính lực nói thầm'),
        h('label', { style: 'display:block;margin:0' }, h('div', { style: 'font-weight:600' }, 'Phân loại mặc định'), plSel),
        textField('hamTren', 'Răng hàm trên', 'để trống = không điền'),
        textField('hamDuoi', 'Răng hàm dưới', 'để trống = không điền')),
      h('div', { style: 'font-weight:700;margin-top:12px' }, '3) Lưu & tuỳ chọn'),
      h('div', { style: 'margin:6px 0' }, h('label', { style: 'margin:0' }, 'Sau khi điền: ', saveSel)),
      h('div', { style: 'margin:4px 0' }, h('label', { style: 'margin:0' }, chkOver, ' Ghi đè cả ô đã có nội dung (mặc định: chỉ điền ô trống)')),
      h('div', { style: 'margin:4px 0' }, h('label', { style: 'margin:0' }, chkMine,
        ' Chỉ điền các mục gán cho bác sĩ đang đăng nhập (tài khoản HIS hiện tại: user_id ' + ($('user_id') ? $('user_id').value : '?') + ')')),
      h('div', { style: 'margin:4px 0' }, h('label', { style: 'margin:0' }, chkSum, ' Điền "Tình trạng bệnh / Ghi chú" ở Tổng kết (tổng hợp các mục khác "Bình thường"/"Không"; nếu không có thì ghi "Không")')),
      h('div', { style: 'margin-top:12px;display:flex;gap:8px;justify-content:flex-end' },
        h('button', {
          type: 'button', class: 'btn btn-sm btn-default',
          onclick: () => { if (confirm('Khôi phục toàn bộ cài đặt (kể cả bác sĩ)?')) { saveCfg({}); closeSettings(); toast('Đã khôi phục mặc định'); } },
        }, 'Khôi phục mặc định'),
        h('button', { type: 'button', class: 'btn btn-sm btn-default', onclick: closeSettings }, 'Đóng'),
        h('button', {
          type: 'button', class: 'btn btn-sm btn-primary',
          onclick: () => {
            const n = loadCfg();
            ['textNormal', 'none', 'thiLuc', 'noiThuong', 'noiTham', 'hamTren', 'hamDuoi'].forEach((k) => { n[k] = inputs[k].value.trim(); });
            n.phanLoai = plSel.value;
            n.saveMode = saveSel.value;
            n.overwrite = chkOver.checked;
            n.onlyMine = chkMine.checked;
            n.summary = chkSum.checked;
            n.doctors = {};
            Object.entries(docSel).forEach(([k, s]) => { if (s.value) n.doctors[k] = s.value; });
            saveCfg(n);
            closeSettings();
            toast('Đã lưu cài đặt (lưu trong Tampermonkey, lần sau không phải nhập lại)', 5000);
          },
        }, 'Lưu cài đặt')));

    document.body.appendChild(h('div', {
      id: 'kskModal',
      style: 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:2147483001;display:flex;align-items:center;justify-content:center',
    }, box));
  }

  // ───────────────────────────── Gắn nút ─────────────────────────────
  // ───────────────────────────── Ký số ─────────────────────────────
  // Bấm "Đồng ý" ở hộp alertify đang hiện (ở frame này hoặc frame cha), trả về nội dung
  function acceptAlertify() {
    const msgs = [];
    const docs = [document];
    try { let w = window; while (w.parent && w.parent !== w) { w = w.parent; docs.push(w.document); } } catch (e) { /* cross-origin */ }
    docs.forEach((d) => {
      const box = d.getElementById('alertify');
      const ok = d.getElementById('alertify-ok');
      if (box && ok && !box.classList.contains('alertify-hidden')) {
        const m = box.querySelector('.alertify-message');
        msgs.push(m ? m.textContent.trim() : '(hộp thoại)');
        ok.click();
      }
    });
    return msgs;
  }

  let signing = false;
  async function autoSign(opts) {
    if (signing) return;
    signing = true;
    const t0 = Date.now();
    console.log('[KSK auto] autoSign bắt đầu', new Date().toLocaleTimeString());
    const btn = $('kskAutoSign');
    if (btn) btn.disabled = true;
    try {
      if (!(opts && opts.batch) && window.__kskAssign && !(await window.__kskAssign.ensure())) { toast('Đã huỷ, chưa ký gì.'); return ['Đã huỷ']; }
      const cfg = loadCfg();
      await ensureRendered();
      const prof = currentProfile();
      const myId = $('user_id') ? $('user_id').value : '';
      if (!prof && cfg.onlyMine && !myId) { toast('Không xác định được mục của bạn: hãy đăng nhập bằng nút 🔑 (đã tick khoa phụ trách) hoặc đặt bác sĩ cho từng mục trong ⚙.'); return ['Không xác định được mục của bạn (không đăng nhập bằng nút 🔑)']; }
      const rep = { ok: [], signed: [], skip: [], fail: [], msgs: [] };
      // đánh dấu đang ký để script ở trang SmartCA / hộp e-Seal tự điền tài khoản CA
      GM_setValue('kskAuto.sign.v1', JSON.stringify({ t: Date.now() }));
      for (const s of SECTIONS) {
        if (stopped(t0)) { rep.fail.push('đã dừng theo yêu cầu (⏹)'); break; }
        const mine = !cfg.onlyMine ? true : prof ? (prof.sections || []).includes(s.lck) : (cfg.doctors[s.lck] || '') === myId;
        if (!mine) continue;
        if (isSigned(s.lck)) { rep.signed.push(s.label); continue; }
        const c = $(s.cls);
        if (!c || isUnset(c.value)) { rep.skip.push(s.label + ' (chưa có phân loại)'); continue; }
        const ky = document.querySelector('button#btnKySo[loai-chuyen-khoa="' + s.lck + '"]');
        if (!ky || inactive(ky)) { rep.skip.push(s.label + ' (nút ký đang mờ)'); continue; }
        toast('Đang ký: ' + s.label + '…', 120000);
        ky.click();
        let done = false;
        for (let i = 0; i < 240 && !done; i++) { // tối đa ~2 phút / mục
          if (stopped(t0)) break;
          await sleep(500);
          acceptAlertify().forEach((m) => rep.msgs.push(s.label + ': ' + m));
          done = isSigned(s.lck);
        }
        if (done) rep.ok.push(s.label);
        else { rep.fail.push(s.label); break; } // dừng ngay khi 1 mục không ký được, tránh bấm dồn
      }
      const L = [`Đã ký ${rep.ok.length} mục` + (rep.ok.length ? ': ' + rep.ok.join(', ') : '') + '.'];
      if (rep.signed.length) L.push('Đã ký từ trước: ' + rep.signed.join(', '));
      if (rep.skip.length) L.push('Bỏ qua: ' + rep.skip.join('; '));
      if (rep.fail.length) L.push('KHÔNG xác nhận được ký: ' + rep.fail.join(', ') + ' — dừng lại, kiểm tra cửa sổ SmartCA/e-Seal rồi chạy lại.');
      // Tổng kết (chỉ bác sĩ phụ trách tổng kết): bấm "Ký số & In" khi mọi mục đã có phân loại và đã chọn phân loại sức khỏe
      if (prof && prof.tongKet && !rep.fail.length) {
        const tkSigned = () => { const b = $('btnHuyCaTong'); return !!b && !inactive(b); };
        const kyTk = $('btnKyCaTong');
        const allClassified = SECTIONS.every((x) => { if (OPTIONAL.has(x.lck)) return true; const e = $(x.cls); return !!e && !isUnset(e.value); });
        const sel = $('cboPHANLOAISUCKHOE_CHON');
        if (tkSigned()) L.push('Tổng kết: đã ký từ trước.');
        else if (!allClassified) L.push('Tổng kết: chưa ký vì còn mục chưa có phân loại.');
        else if (!sel || isUnset(sel.value)) L.push('Tổng kết: chưa ký vì chưa chọn phân loại sức khỏe (bấm Auto điền trước).');
        else if (SECTIONS.some((x) => !OPTIONAL.has(x.lck) && !isSigned(x.lck))) L.push('Tổng kết: chưa ký vì còn mục chưa ký: ' + SECTIONS.filter((x) => !OPTIONAL.has(x.lck) && !isSigned(x.lck)).map((x) => x.label).join(', ') + ' (Tổng kết phải ký sau cùng).');
        else if (!kyTk || inactive(kyTk)) L.push('Tổng kết: nút "Ký số & In" đang mờ.');
        else {
          toast('Đang ký Tổng kết…', 120000);
          kyTk.click();
          let done = false;
          for (let i = 0; i < 240 && !done; i++) {
            await sleep(500);
            acceptAlertify().forEach((m) => rep.msgs.push('Tổng kết: ' + m));
            done = tkSigned();
          }
          L.push(done ? 'Tổng kết: đã ký.' : 'Tổng kết: KHÔNG xác nhận được ký — kiểm tra cửa sổ SmartCA/e-Seal/in.');
        }
      } else if (prof && prof.tongKet) L.push('Tổng kết: chưa ký vì còn mục lỗi ở trên.');
      if (rep.msgs.length) L.push('Thông báo của HIS: ' + rep.msgs.join(' | '));
      toast(L, 40000);
      return L;
    } catch (e) {
      console.error('[KSK auto] lỗi ký số', e);
      toast('Lỗi khi ký số: ' + e.message);
      return ['Lỗi khi ký số: ' + e.message];
    } finally {
      GM_setValue('kskAuto.sign.v1', '');
      signing = false;
      if (btn) btn.disabled = false;
    }
  }

  window.__kskRun = { autoFill, autoSign }; // để luồng chạy-tất-cả (IIFE bên dưới) gọi

  function injectUI() {
    if ($('kskAutoFill')) return;
    const mk = (id, txt, fn) => h('button', { type: 'button', id, class: 'btn btn-sm btn-warning', style: 'margin-left:6px', onclick: fn }, txt);
    const fill = mk('kskAutoFill', '⚡ Auto điền', autoFill);
    const sign = mk('kskAutoSign', '✍ Auto ký số', autoSign);
    const set = mk('kskSettings', '⚙ Cài đặt', openSettings);
    const anchor = $('btn_ChiDinhCls');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.append(fill, sign, set);
    } else {
      document.body.appendChild(h('div', { style: 'position:fixed;right:70px;bottom:8px;z-index:2147482000' }, fill, sign, set));
    }
  }

  waitFor(() => $('txtTUANHOAN') && $('btn_ChiDinhCls'), 60000).then((ok) => {
    if (ok) injectUI(); else console.warn('[KSK auto] Không tìm thấy form KSK để gắn nút');
  });
})();

// ═══════════════════════════════════════════════════════════════════════
// Luồng tự động: đăng nhập HIS → Thiết lập phòng → Khám bệnh → mở phiếu KSK
// (IIFE riêng; chạy trên trang login, SelDept, Khám bệnh, frame phiếu KSK)
// ═══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const URL_SELDEPT = 'https://bvbacgiang.vncare.vn/vnpthis/main/manager.jsp?func=../admin/SelDept';
  const URL_KB = 'https://bvbacgiang.vncare.vn/vnpthis/main/manager.jsp?func=../ngoaitru/NGT02K001_KB_MHC_vs2&type=1';

  // Trang đăng nhập: login.jsp và cả trang gốc /vnpthis/ (nhận diện thêm bằng việc thấy ô đăng nhập)
  const IS_LOGIN = /\/login\/login\.jsp|\/vnpthis\/?$|\/vnpthis\/(index|login)[^/]*$/i.test(location.pathname) && window.top === window;
  const IS_SEL = /func=\.\.\/admin\/SelDept/.test(location.search);
  const IS_KB = /func=\.\.\/ngoaitru\/NGT02K001_KB_MHC_vs2/.test(location.search);
  const IS_KSK = /KSK_TREN18TUOI_TOANDAN_QD2062/.test(location.search);
  const IS_TOP = window.top === window;
  if (!(IS_LOGIN || IS_SEL || IS_KB || IS_KSK || IS_TOP)) return; // iframe khác của HIS
  if (window.__kskFlow) return;
  window.__kskFlow = true;

  // ───────────────────────── Lưu trữ (Tampermonkey) ─────────────────────────
  const KEY = {
    profiles: 'kskAuto.profiles.v1', // [{label, hisUser, hisPass, caUser, caPass, sections:[lck], tongKet}]
    patient: 'kskAuto.patient.v1',   // {name, year, stt}
    flow: 'kskAuto.flow.v1',         // {stage: 'room' | 'kb' | 'ksk', t}
    nav: 'kskAuto.nav.v1',           // {fromDate, dept, sub}
    cur: 'kskAuto.cur.v1',           // {hisUser} bác sĩ vừa đăng nhập bằng nút 🔑
    assign: 'kskAuto.assign.v1',     // {mã mục | 'TONGKET': hisUser} chọn người làm khi nhiều bác sĩ cùng phụ trách
    batch: 'kskAuto.batch.v1',       // chạy tất cả: {mode:'fill'|'sign', queue:[hisUser], idx, phase:'run'|'next', tried, results, t}
  };
  const SECS = [
    ['TUANHOAN', 'Nội › Tuần hoàn'], ['HOHAP', 'Nội › Hô hấp'], ['TIEUHOA', 'Nội › Tiêu hóa'], ['THANTIETNIEU', 'Nội › Thận-tiết niệu'],
    ['NOITIET', 'Nội › Nội tiết'], ['COXUONGKHOP', 'Nội › Cơ xương khớp'], ['THANKINH', 'Nội › Thần kinh'], ['TAMTHAN', 'Nội › Tâm thần'],
    ['NGOAIKHOA', 'Ngoại khoa'], ['DALIEU', 'Da liễu'], ['SANPHUKHOA', 'Sản phụ khoa'], ['MAT', 'Mắt'], ['TAIMUIHONG', 'Tai mũi họng'], ['RANGHAMMAT', 'Răng hàm mặt'],
  ].map(([lck, label]) => ({ lck, label }));
  const FLOW_TTL = 15 * 60 * 1000; // quá 15 phút thì bỏ luồng dở dang
  const readJSON = (k, def) => { try { const v = GM_getValue(k, ''); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
  const writeJSON = (k, v) => GM_setValue(k, JSON.stringify(v));
  const getFlow = () => { const f = readJSON(KEY.flow, null); return f && Date.now() - f.t < FLOW_TTL ? f : null; };
  const setFlow = (stage) => writeJSON(KEY.flow, { stage, t: Date.now() });
  const clearFlow = () => GM_setValue(KEY.flow, '');
  // Khoa/Phòng: giá trị bạn đã chọn khi ghi thao tác (Khoa khám bệnh đa khoa, Phòng khám theo hợp đồng); để trống = giữ mặc định HIS
  const getNav = () => Object.assign({ fromDate: '', dept: '139535', sub: '143860' }, readJSON(KEY.nav, {}));
  const defaultFrom = () => {
    const now = new Date();
    let y = now.getFullYear();
    if (new Date(y, 9, 1) > now) y -= 1;
    return '01/10/' + y;
  };

  // ───────────────────────── Tiện ích ─────────────────────────
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 30000, step = 250) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const r = fn(); if (r) return r; await sleep(step); }
    return null;
  };
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/\s+/g, ' ').trim().toUpperCase();
  const byText = (root, sel, re) => [...root.querySelectorAll(sel)].find((e) => re.test(((e.textContent || e.value || '') + '').replace(/\s+/g, ' ').trim()));
  const fire = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));
  const setVal = (el, v) => { el.value = v; fire(el, 'input'); fire(el, 'change'); };
  const setSel = (el, v) => {
    if (![...el.options].some((o) => o.value === String(v))) return false;
    el.value = String(v);
    fire(el, 'change');
    return true;
  };
  const gotoUrl = (u) => { if (typeof window.__kskNav === 'function') window.__kskNav(u); else location.href = u; };
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    kids.flat().forEach((c) => e.append(c && c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  };
  const btn = (txt, fn, title) => h('button', { type: 'button', class: 'btn btn-sm btn-warning', style: 'margin:2px;cursor:pointer', title: title || '', onclick: fn }, txt);

  let toastEl;
  const say = (lines, ms = 12000) => {
    if (!toastEl) {
      toastEl = h('div', {
        id: 'kskFlowToast',
        style: 'position:fixed;left:50%;top:140px;transform:translateX(-50%);max-width:80vw;z-index:2147483000;' +
          'background:#222;color:#fff;padding:10px 14px;border-radius:6px;font-size:13px;line-height:1.5;cursor:pointer;' +
          'box-shadow:0 2px 10px rgba(0,0,0,.4);display:none',
        onclick: () => { toastEl.style.display = 'none'; },
      });
      document.body.appendChild(toastEl);
    }
    toastEl.replaceChildren(...[].concat(lines).map((l) => h('div', {}, l)));
    toastEl.style.display = 'block';
    clearTimeout(say.t);
    say.t = setTimeout(() => { toastEl.style.display = 'none'; }, ms);
  };
  // Thanh nổi: kéo được (giữ chuột ở tiêu đề), thu gọn được; vị trí và trạng thái được nhớ. Trả về phần thân để cập nhật nội dung.
  const BAR_KEY = 'kskAuto.bar.v1'; // {x, y, c}
  const bar = (kids) => {
    const st = readJSON(BAR_KEY, {}) || {};
    const body = h('div', {}, kids);
    const tgl = h('span', { style: 'cursor:pointer;padding:0 6px;font-weight:700;font-size:14px', title: 'Thu gọn / mở rộng' });
    const head = h('div', {
      style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:move;user-select:none;' +
        'font-weight:700;font-size:12px;color:#555;margin-bottom:4px', title: 'Kéo để di chuyển',
    }, h('span', {}, '⠿ KSK Auto'), tgl);
    const el = h('div', {
      id: 'kskFlowBar',
      style: 'position:fixed;z-index:2147482000;background:rgba(255,255,255,.96);border:1px solid #888;' +
        'border-radius:6px;padding:6px 8px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.3);max-width:380px;color:#222',
    }, head, body);
    const place = (x, y) => {
      const mx = Math.max(0, window.innerWidth - 60), my = Math.max(0, window.innerHeight - 30);
      el.style.left = Math.min(Math.max(0, x), mx) + 'px';
      el.style.top = Math.min(Math.max(0, y), my) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    };
    if (typeof st.x === 'number' && typeof st.y === 'number') place(st.x, st.y);
    else { el.style.right = '12px'; el.style.bottom = '60px'; }
    const collapse = (c) => { body.style.display = c ? 'none' : ''; tgl.textContent = c ? '▸' : '▾'; };
    collapse(!!st.c);
    tgl.addEventListener('click', (e) => {
      e.stopPropagation();
      const c = body.style.display !== 'none';
      collapse(c);
      writeJSON(BAR_KEY, Object.assign(readJSON(BAR_KEY, {}) || {}, { c }));
    });
    head.addEventListener('mousedown', (e) => {
      if (e.target === tgl || e.button !== 0) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      const move = (ev) => place(ev.clientX - dx, ev.clientY - dy);
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        const r2 = el.getBoundingClientRect();
        writeJSON(BAR_KEY, Object.assign(readJSON(BAR_KEY, {}) || {}, { x: Math.round(r2.left), y: Math.round(r2.top) }));
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      e.preventDefault();
    });
    document.body.appendChild(el);
    return body;
  };

  let rerender = () => {};

  // ───────────────────────── Chạy tất cả bác sĩ ─────────────────────────
  const BATCH_TTL = 60 * 60 * 1000;
  const getBatch = () => { const b = readJSON(KEY.batch, null); return b && Date.now() - b.t < BATCH_TTL ? b : null; };
  const setBatch = (b) => writeJSON(KEY.batch, Object.assign(b, { t: Date.now() }));
  const clearBatch = () => GM_setValue(KEY.batch, '');
  const findProfile = (u) => readJSON(KEY.profiles, []).find((p) => p.hisUser === u);
  const who = (b) => { const p = findProfile(b.queue[b.idx]); return p ? (p.label || p.hisUser) : b.queue[b.idx]; };

  // Bấm "Đăng xuất" trong menu của HIS (khung ngoài cùng); không có hộp xác nhận
  function doLogout() {
    let doc = document;
    try { doc = window.top.document; } catch (e) { /* dùng khung hiện tại */ }
    const a = [...doc.querySelectorAll('ul.dropDownMenu a, a')].find((x) => /^Đăng xuất$/i.test((x.textContent || '').trim()));
    if (!a) return false;
    a.click();
    return true;
  }

  // Ghi kết quả của bác sĩ hiện tại rồi đăng xuất để sang bác sĩ kế
  function batchNext(lines) {
    const b = getBatch();
    if (!b || b.phase !== 'run') return;
    b.results.push({ who: who(b), lines: [].concat(lines || []) });
    b.phase = 'next';
    setBatch(b);
    if (!doLogout()) {
      b.results.push({ who: '—', lines: ['Không tìm thấy nút Đăng xuất của HIS nên dừng. Bạn tự đăng xuất rồi chạy lại.'] });
      GM_setValue(KEY.batch, ''); say(b.results.map((r) => r.who + ': ' + r.lines.join(' ')), 60000);
    }
  }
  const batchFail = (msg) => batchNext(['⚠ ' + msg]);
  const stopFlow = (msg) => { clearFlow(); say(msg); batchFail(msg); };

  function batchLogin(b) {
    const p = findProfile(b.queue[b.idx]);
    if (!p) { clearBatch(); return say('Không thấy tài khoản ' + b.queue[b.idx] + ' trong danh sách'); }
    b.tried = b.idx; b.phase = 'run';
    setBatch(b);
    say('Chạy tất cả (' + (b.mode === 'sign' ? 'ký số' : 'điền') + '): bác sĩ ' + (b.idx + 1) + '/' + b.queue.length + ' — ' + (p.label || p.hisUser), 60000);
    if (!loginAs(p)) clearBatch();
  }

  // ───────────────────────── Chia mục khi nhiều bác sĩ cùng phụ trách ─────────────────────────
  const SECS_TK = SECS.concat([{ lck: 'TONGKET', label: 'Tổng kết' }]);
  const ownersOf = (ps, l) => ps.filter((q) => (l === 'TONGKET' ? q.tongKet : (q.sections || []).includes(l)));
  const conflictsOf = (ps) => SECS_TK.map((x) => Object.assign({}, x, { cands: ownersOf(ps, x.lck) })).filter((x) => x.cands.length > 1);
  const effectiveOf = (p, ps, assign) => {
    const ok = (l) => { const o = ownersOf(ps, l).map((q) => q.hisUser), a = assign[l]; return o.length < 2 || !a || !o.includes(a) || a === p.hisUser; };
    return { sections: (p.sections || []).filter(ok), tongKet: !!p.tongKet && ok('TONGKET') };
  };

  // Hộp chọn: mỗi mục trùng chọn 1 bác sĩ; có nút "Tất cả → bác sĩ X". Trả về {mục: hisUser} hoặc null nếu huỷ.
  function askAssign(conflicts, assign, title) {
    return new Promise((resolve) => {
      const chosen = {};
      conflicts.forEach((c) => { if (c.cands.some((q) => q.hisUser === assign[c.lck])) chosen[c.lck] = assign[c.lck]; });
      const radios = {};
      const note = h('div', { style: 'color:#b00;min-height:18px;margin-top:6px' });
      const setChoice = (lck, user) => { chosen[lck] = user; (radios[lck] || []).forEach((r) => { r.checked = r.value === user; }); };
      const people = [];
      conflicts.forEach((c) => c.cands.forEach((q) => { if (!people.some((x) => x.hisUser === q.hisUser)) people.push(q); }));
      const done = (v) => { overlay.remove(); resolve(v); };
      const rows = conflicts.map((c) => {
        radios[c.lck] = [];
        return h('div', { style: 'display:flex;align-items:center;gap:14px;padding:4px 0;border-bottom:1px solid #eee;flex-wrap:wrap' },
          h('div', { style: 'width:170px;font-weight:600' }, c.label),
          ...c.cands.map((q) => {
            const r = h('input', { type: 'radio', name: 'kskAsg_' + c.lck, value: q.hisUser });
            r.checked = chosen[c.lck] === q.hisUser;
            r.addEventListener('change', () => { chosen[c.lck] = q.hisUser; });
            radios[c.lck].push(r);
            return h('label', { style: 'margin:0;font-weight:400;white-space:nowrap' }, r, ' ' + (q.label || q.hisUser));
          }));
      });
      const quick = people.map((q) => btn('Tất cả → ' + (q.label || q.hisUser), () => {
        conflicts.forEach((c) => { if (c.cands.some((x) => x.hisUser === q.hisUser)) setChoice(c.lck, q.hisUser); });
      }, 'Chọn bác sĩ này cho mọi mục mà bác sĩ đó có tick'));
      const box = h('div', { style: 'background:#fff;width:min(820px,95vw);max-height:90vh;overflow:auto;border-radius:6px;padding:16px;font-size:13px;color:#222' },
        h('h4', { style: 'margin:0 0 6px' }, title || '🧩 Nhiều bác sĩ cùng phụ trách một mục — chọn ai làm'),
        h('div', { style: 'color:#555;margin-bottom:6px' }, 'Chỉ bác sĩ được chọn mới điền / ký mục đó. Lựa chọn được nhớ cho các lần sau.'),
        h('div', { style: 'margin-bottom:6px' }, ...quick),
        ...rows, note,
        h('div', { style: 'margin-top:10px;display:flex;gap:8px;justify-content:flex-end' },
          h('button', { type: 'button', class: 'btn btn-sm btn-default', onclick: () => done(null) }, 'Huỷ'),
          h('button', {
            type: 'button', class: 'btn btn-sm btn-primary',
            onclick: () => {
              const miss = conflicts.filter((c) => !chosen[c.lck]).map((c) => c.label);
              if (miss.length) { note.textContent = 'Chưa chọn: ' + miss.join(', '); return; }
              done(Object.assign({}, assign, chosen));
            },
          }, 'Xác nhận')));
      const overlay = h('div', { style: 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:2147483002;display:flex;align-items:center;justify-content:center' }, box);
      document.body.appendChild(overlay);
    });
  }

  // Bấm tay Auto điền / Auto ký số trong phiếu KSK: hỏi nếu mục của bác sĩ đang đăng nhập còn trùng mà chưa chọn người làm
  window.__kskAssign = {
    async ensure() {
      const ps = readJSON(KEY.profiles, []);
      const cur = readJSON(KEY.cur, null);
      const me = cur && ps.find((p) => p.hisUser === cur.hisUser);
      if (!me) return true;
      const assign = readJSON(KEY.assign, {}) || {};
      const conf = conflictsOf(ps).filter((c) => c.cands.some((q) => q.hisUser === me.hisUser));
      if (!conf.some((c) => !c.cands.some((q) => q.hisUser === assign[c.lck]))) return true;
      const res = await askAssign(conf, assign);
      if (!res) return false;
      writeJSON(KEY.assign, res);
      return true;
    },
  };

  // Luồng chạy tất cả: hỏi trước khi bắt đầu (có điền sẵn lựa chọn lần trước), rồi mới chạy
  async function startBatch(mode) {
    const patient = readJSON(KEY.patient, null);
    if (!patient || !patient.name) return say('Chưa có bệnh nhân: vào trang Khám bệnh, chọn dòng bệnh nhân rồi bấm 📌 (hoặc nhập trong ⚙).');
    const all = readJSON(KEY.profiles, []).filter((p) => p.hisUser);
    let assign = readJSON(KEY.assign, {}) || {};
    const conf = conflictsOf(all);
    if (conf.length) {
      const res = await askAssign(conf, assign);
      if (!res) return say('Đã huỷ, chưa chạy gì.', 4000);
      assign = res;
      writeJSON(KEY.assign, assign);
    }
    // Tổng kết cần các mục khác đã có phân loại → bác sĩ phụ trách tổng kết đi sau cùng
    const withEff = all.filter((p) => p.hisPass).map((p) => ({ p, e: effectiveOf(p, all, assign) })).filter((x) => x.e.sections.length || x.e.tongKet);
    if (!withEff.length) return say('Chưa có bác sĩ nào đủ tài khoản HIS và đã tick/được chọn mục phụ trách (vào ⚙).');
    withEff.sort((a, c) => (a.e.tongKet ? 1 : 0) - (c.e.tongKet ? 1 : 0));
    batchLogin({ mode, queue: withEff.map((x) => x.p.hisUser), idx: 0, phase: 'run', tried: -1, results: [] });
  }

  // Trang login: tiếp tục chạy tất cả (sau khi đăng xuất) hoặc kết thúc
  function batchOnLogin() {
    const b = getBatch();
    if (!b) return;
    if (b.phase === 'next') {
      b.idx += 1;
      if (b.idx >= b.queue.length) {
        clearBatch();
        const lines = ['Xong chạy tất cả (' + (b.mode === 'sign' ? 'ký số' : 'điền') + '), đã đăng xuất hết.'];
        b.results.forEach((r) => lines.push(r.who + ': ' + r.lines.join(' | ')));
        say(lines, 300000);
        return;
      }
      batchLogin(b);
    } else if (b.tried === b.idx) { // vừa đăng nhập mà lại ở trang login → đăng nhập không thành công
      clearBatch();
      say('Dừng chạy tất cả: đăng nhập ' + who(b) + ' không thành công (kiểm tra mật khẩu HIS).', 30000);
    }
  }

  // Trong khung phiếu KSK: chạy Auto điền / Auto ký số rồi đăng xuất
  async function batchStep() {
    const b = getBatch();
    if (!b || b.phase !== 'run') return;
    // mỗi bác sĩ chỉ chạy đúng 1 lần: khung KSK có tải lại (vd. sau khi bạn bấm Lưu) cũng không chạy lại
    if (b.stepDone === b.idx) { console.log('[KSK auto] batchStep đã chạy cho bác sĩ này, bỏ qua'); return; }
    b.stepDone = b.idx; setBatch(b);
    console.log('[KSK auto] batchStep chạy', b.mode, 'bác sĩ', who(b), new Date().toLocaleTimeString());
    const ready = await waitFor(() => $('txtTUANHOAN') && $('btn_ChiDinhCls') && window.__kskRun, 60000);
    if (!ready) return batchFail('không thấy form KSK');
    await sleep(1500);
    let lines = [];
    try { lines = (b.mode === 'sign' ? await window.__kskRun.autoSign({ batch: true }) : await window.__kskRun.autoFill({ batch: true })) || []; } catch (e) { lines = ['Lỗi: ' + e.message]; }
    await sleep(1500);
    batchNext(lines);
  }

  // ───────────────────────── Cài đặt: tài khoản, bệnh nhân, điều hướng ─────────────────────────
  const closeSettings = () => { const m = $('kskFlowModal'); if (m) m.remove(); };

  function openSettings() {
    closeSettings();
    const profiles = readJSON(KEY.profiles, []);
    const patient = readJSON(KEY.patient, {}) || {};
    const nav = getNav();
    const inp = (val, ph, type) => {
      const i = h('input', { type: type || 'text', placeholder: ph || '', style: 'width:100%;padding:3px 6px' });
      i.value = val || '';
      return i;
    };

    const pRows = [];
    const pBox = h('div', {});
    const addRow = (p = {}) => {
      const r = {
        label: inp(p.label, 'Tên hiển thị'),
        hisUser: inp(p.hisUser, 'Tên đăng nhập HIS'),
        hisPass: inp(p.hisPass, 'Mật khẩu HIS', 'password'),
        caUser: inp(p.caUser, 'Tài khoản CA'),
        caPass: inp(p.caPass, 'Mật khẩu CA', 'password'),
      };
      const secs = SECS;
      r.chks = secs.map((x) => {
        const c = h('input', { type: 'checkbox' });
        c.checked = (p.sections || []).includes(x.lck);
        return { lck: x.lck, el: c, node: h('label', { style: 'margin:0 10px 0 0;font-weight:400;white-space:nowrap' }, c, ' ' + x.label) };
      });
      r.tk = h('input', { type: 'checkbox' });
      r.tk.checked = !!p.tongKet;
      r.row = h('div', { style: 'border:1px solid #ddd;border-radius:4px;padding:6px;margin:6px 0' },
        h('div', { style: 'display:grid;grid-template-columns:repeat(5,1fr) 40px;gap:6px' },
          r.label, r.hisUser, r.hisPass, r.caUser, r.caPass,
          h('button', {
            type: 'button', class: 'btn btn-sm btn-default', title: 'Xoá bác sĩ này',
            onclick: () => { r.row.remove(); pRows.splice(pRows.indexOf(r), 1); },
          }, '✖')),
        h('div', { style: 'margin-top:4px' }, h('b', {}, 'Phụ trách: '), ...r.chks.map((c) => c.node),
          h('label', { style: 'margin:0;font-weight:700;white-space:nowrap' }, r.tk, ' Tổng kết')));
      pRows.push(r);
      pBox.appendChild(r.row);
    };
    profiles.forEach(addRow);
    if (!profiles.length) addRow();

    const fName = inp(patient.name, 'Họ tên (như trên danh sách)');
    const fYear = inp(patient.year, 'Năm sinh');
    const fStt = inp(patient.stt, 'Số TT (nếu có 2 dòng trùng tên)');
    const fFrom = inp(nav.fromDate, 'Từ ngày dd/MM/yyyy (trống = ' + defaultFrom() + ')');
    const fDept = inp(nav.dept, 'Khoa (value; trống = giữ mặc định HIS)');
    const fSub = inp(nav.sub, 'Phòng (value; trống = giữ mặc định HIS)');
    const lab = (t, el) => h('label', { style: 'display:block;margin:0' }, h('div', { style: 'font-weight:600' }, t), el);

    const box = h('div', { style: 'background:#fff;width:min(1000px,95vw);max-height:90vh;overflow:auto;border-radius:6px;padding:16px;font-size:13px;color:#222' },
      h('h4', { style: 'margin:0 0 8px' }, '⚙ KSK Auto — tài khoản & điều hướng'),
      h('div', { style: 'font-weight:700' }, '1) Tài khoản bác sĩ (4 thông tin + khoa phụ trách; một bác sĩ có thể phụ trách nhiều khoa và Tổng kết)'),
      h('div', { style: 'color:#666;margin-bottom:4px' }, 'Mật khẩu được lưu dạng chữ thường trong Tampermonkey của máy này.'),
      pBox,
      h('button', { type: 'button', class: 'btn btn-sm btn-default', onclick: () => addRow() }, '+ Thêm bác sĩ'),
      h('div', { style: 'font-weight:700;margin-top:12px' }, '2) Bệnh nhân hiện tại'),
      h('div', { style: 'display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin:6px 0' }, lab('Họ tên', fName), lab('Năm sinh', fYear), lab('Số TT', fStt)),
      h('div', { style: 'font-weight:700;margin-top:12px' }, '3) Điều hướng'),
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:6px 0' }, lab('Từ ngày', fFrom), lab('Khoa (value)', fDept), lab('Phòng (value)', fSub)),
      h('div', { style: 'margin-top:12px;display:flex;gap:8px;justify-content:flex-end' },
        h('button', { type: 'button', class: 'btn btn-sm btn-default', onclick: closeSettings }, 'Đóng'),
        h('button', {
          type: 'button', class: 'btn btn-sm btn-primary',
          onclick: () => {
            const ps = pRows.map((r) => ({
              label: r.label.value.trim(), hisUser: r.hisUser.value.trim(), hisPass: r.hisPass.value,
              caUser: r.caUser.value.trim(), caPass: r.caPass.value,
              sections: r.chks.filter((c) => c.el.checked).map((c) => c.lck), tongKet: r.tk.checked,
            })).filter((p) => p.label || p.hisUser || p.caUser);
            writeJSON(KEY.profiles, ps);
            const pt = { name: fName.value.trim(), year: fYear.value.trim(), stt: fStt.value.trim() };
            if (pt.name) writeJSON(KEY.patient, pt); else GM_setValue(KEY.patient, '');
            writeJSON(KEY.nav, { fromDate: fFrom.value.trim(), dept: fDept.value.trim(), sub: fSub.value.trim() });
            closeSettings();
            say('Đã lưu cài đặt', 4000);
            rerender();
          },
        }, 'Lưu')));

    document.body.appendChild(h('div', {
      id: 'kskFlowModal',
      style: 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:2147483001;display:flex;align-items:center;justify-content:center',
    }, box));
  }

  // ───────────────────────── Trang đăng nhập HIS ─────────────────────────
  const assignText = (p) => {
    const names = (SECS).filter((x) => (p.sections || []).includes(x.lck)).map((x) => x.label);
    if (p.tongKet) names.push('TỔNG KẾT');
    return names.length ? 'Phụ trách: ' + names.join(', ') : 'Chưa gán khoa (vào ⚙)';
  };

  async function initLoginWhenReady() {
    if (/login\.jsp/i.test(location.pathname)) return initLogin();
    // trang gốc /vnpthis/: chỉ coi là trang đăng nhập khi thật sự có ô mật khẩu (form có thể dựng sau khi tải)
    const f = await waitFor(() => { const e = findLoginEls(); return e.pw && e.u && e.b ? e : null; }, 12000);
    if (f) initLogin(); else initOther(); // đã đăng nhập (không có form) → xử lý như trang khác
  }

  function initLogin() {
    GM_setValue(KEY.cur, ''); // đăng nhập tay thì không áp phân công theo profile
    const holder = bar([]);
    rerender = () => {
      const profiles = readJSON(KEY.profiles, []);
      holder.replaceChildren(
        h('div', { style: 'font-weight:700;margin-bottom:4px' }, 'KSK Auto — đăng nhập nhanh'),
        ...profiles.map((p) => h('div', {}, btn('🔑 ' + (p.label || p.hisUser), () => loginAs(p), 'Đăng nhập và đi tiếp tới phiếu KSK'),
          h('div', { style: 'color:#555;font-size:12px;margin:0 0 4px 4px' }, assignText(p)))),
        h('div', { style: 'border-top:1px solid #ddd;margin-top:4px;padding-top:4px' },
          btn('▶▶ Điền tất cả', () => startBatch('fill'), 'Lần lượt từng bác sĩ: đăng nhập → mở phiếu → Auto điền → đăng xuất'),
          btn('▶▶ Ký số tất cả', () => startBatch('sign'), 'Lần lượt từng bác sĩ: đăng nhập → mở phiếu → Auto ký số → đăng xuất')),
        h('div', {}, btn('🧩 Chia mục trùng', async () => {
          const ps = readJSON(KEY.profiles, []).filter((p) => p.hisUser);
          const conf = conflictsOf(ps);
          if (!conf.length) return say('Không có mục nào trùng giữa các bác sĩ.', 4000);
          const res = await askAssign(conf, readJSON(KEY.assign, {}) || {});
          if (res) { writeJSON(KEY.assign, res); say('Đã lưu cách chia mục.', 4000); }
        }, 'Chọn ai làm mục mà nhiều bác sĩ cùng tick'), btn('⚙ Tài khoản & cài đặt', openSettings)));
    };
    rerender();
    batchOnLogin();
  }

  // Ô đăng nhập: theo id của HIS; không có thì dò theo kiểu ô (trang gốc có thể khác login.jsp)
  function findLoginEls() {
    let u = $('login-username'), pw = $('login-password'), b = $('btn-login');
    if (!pw) pw = document.querySelector('input[type=password]');
    if (!u && pw) { const form = pw.form || document; u = [...form.querySelectorAll('input')].find((i) => ['text', 'email', ''].includes((i.type || '').toLowerCase()) && i !== pw && i.type !== 'hidden'); }
    if (!b && pw) { const form = pw.form || document; b = [...form.querySelectorAll('button,input[type=submit],input[type=button],a')].find((x) => /đăng nhập|dang nhap|login/i.test((x.textContent || x.value || '').trim())) || form.querySelector('button[type=submit],input[type=submit]'); }
    return { u, pw, b };
  }

  function loginAs(p) {
    const { u, pw, b } = findLoginEls();
    if (!u || !pw || !b) { say('Không thấy ô đăng nhập của HIS'); return false; }
    if (!p.hisUser || !p.hisPass) { say('Tài khoản này thiếu tên đăng nhập/mật khẩu HIS (vào ⚙ để bổ sung)'); return false; }
    setFlow('room');
    writeJSON(KEY.cur, { hisUser: p.hisUser });
    setVal(u, p.hisUser);
    setVal(pw, p.hisPass);
    b.click();
    return true;
  }

  // ───────────────────────── Trang Thiết lập phòng ─────────────────────────
  async function initSelDept() {
    rerender = () => {};
    bar([btn('⏏ Đăng xuất', () => { clearBatch(); GM_setValue('kskAuto.stop.v1', Date.now()); doLogout(); }), btn('⚙ Cài đặt', openSettings)]);
    const f = getFlow();
    if (!f) return;
    if (f.stage === 'kb') { gotoUrl(URL_KB); return; }          // đã bấm Thiết lập phòng, trang vừa tải lại
    if (f.stage !== 'room') return;

    say('Bước 1/6: thiết lập phòng…', 30000);
    const nav = getNav();
    const dept = await waitFor(() => { const s = $('divSelectcboDEPT_ID'); return s && s.options.length > 1 && s; }, 20000);
    if (!dept) return stopFlow('Dừng: không thấy ô chọn Khoa');
    if (nav.dept && dept.value !== nav.dept && !setSel(dept, nav.dept)) return stopFlow('Dừng: Khoa value ' + nav.dept + ' không có trong danh sách');
    const sub = $('divSelectcboSUBDEPT_ID');
    if (nav.sub) {
      const ok = await waitFor(() => sub && [...sub.options].some((o) => o.value === nav.sub), 10000);
      if (!ok) return stopFlow('Dừng: Phòng value ' + nav.sub + ' không có trong danh sách');
      if (sub.value !== nav.sub) setSel(sub, nav.sub);
    }
    const okBtn = $('divSelectbtnOK');
    if (!okBtn) return stopFlow('Dừng: không thấy nút Thiết lập phòng');
    setFlow('kb'); // trang sẽ tải lại, bước tiếp theo chạy ở lần tải sau
    okBtn.click();
  }

  // ───────────────────────── Trang Khám bệnh ─────────────────────────
  let aborted = false;
  const checkAbort = () => { if (aborted) throw new Error('đã dừng theo yêu cầu'); };
  const gridRows = () => [...document.querySelectorAll('#grdDSBenhNhan tr.jqgrow')];
  const rowCells = (r) => [...r.cells].map((c) => norm(c.textContent));
  const isSelected = (r) => !!r && (r.getAttribute('aria-selected') === 'true' || r.classList.contains('ui-state-highlight'));

  function findRows(p) {
    const n = norm(p.name), y = norm(p.year), s = norm(p.stt);
    return gridRows().filter((r) => { const c = rowCells(r); return c.includes(n) && (!y || c.includes(y)) && (!s || c.includes(s)); });
  }

  // Đọc dòng đang chọn trên danh sách → {name, year, stt}
  function readSelected() {
    const row = document.querySelector('#grdDSBenhNhan tr.jqgrow[aria-selected="true"]') || document.querySelector('#grdDSBenhNhan tr.jqgrow.ui-state-highlight');
    if (!row) return null;
    const grid = $('grdDSBenhNhan');
    const view = grid && grid.closest('.ui-jqgrid');
    const ths = view ? [...view.querySelectorAll('tr.ui-jqgrid-labels th')] : [];
    const aligned = ths.length === row.cells.length;
    const idx = (re) => (aligned ? ths.findIndex((th) => re.test(norm(th.textContent))) : -1);
    const cell = (i) => (i >= 0 && row.cells[i] ? row.cells[i].textContent.trim() : '');
    let name = cell(idx(/HO TEN/)), year = cell(idx(/NAM SINH/)), stt = cell(idx(/SO TT/));
    if (!name || !year || !stt) { // phương án dự phòng khi không khớp cột theo tiêu đề
      const t = [...row.cells].map((c) => c.textContent.trim());
      year = year || t.find((x) => /^(19|20)\d{2}$/.test(x)) || '';
      stt = stt || t.find((x) => /^\d{3,5}$/.test(x) && x !== year) || '';
      name = name || t.filter((x) => /\S+\s+\S+/.test(x) && !/\d/.test(x)).sort((a, b) => b.length - a.length)[0] || '';
    }
    return { name, year, stt };
  }

  function triggerGridSearch() {
    try {
      const uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      const g = uw.document.getElementById('grdDSBenhNhan');
      if (g && typeof g.triggerToolbar === 'function') { g.triggerToolbar(); return true; }
    } catch (e) { /* dùng phương án dự phòng */ }
    ['gs_TENBENHNHAN', 'gs_NAMSINH'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      ['a', 'Enter'].forEach((k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, keyCode: k === 'Enter' ? 13 : 65, which: k === 'Enter' ? 13 : 65, bubbles: true })));
    });
    return false;
  }

  async function openPatient() {
    aborted = false;
    try { sessionStorage.removeItem('kskAuto.edited.v1'); } catch (e) { /* bỏ qua */ }
    const p = readJSON(KEY.patient, null);
    if (!p || !p.name) return say('Chưa có bệnh nhân: click chọn dòng bệnh nhân rồi bấm 📌, hoặc nhập trong ⚙.');
    const nav = getNav();
    try {
      // Bước 2-4: đặt Từ ngày → bấm Tìm kiếm → lọc → chọn dòng. Không thấy/không chọn được thì bấm Tìm kiếm thử lại, không dừng ngay.
      const TRIES = 6;
      let warn = '', selected = false, lastWhy = '';
      for (let attempt = 1; attempt <= TRIES && !selected; attempt++) {
        checkAbort();
        const tag = attempt > 1 ? ' (thử lại ' + attempt + '/' + TRIES + ')' : '';
        say('Bước 2/6: đặt Từ ngày…' + tag, 60000);
        const addon = await waitFor(() => $('lblTuNgay') && $('grdDSBenhNhan') && $('lblTuNgay'), attempt === 1 ? 30000 : 8000);
        const fromInput = addon && addon.parentElement.querySelector('input');
        if (!fromInput) { lastWhy = 'không thấy ô "Từ ngày" hoặc danh sách bệnh nhân'; await sleep(1500); continue; }
        setVal(fromInput, nav.fromDate || defaultFrom());
        checkAbort();

        say('Bước 3/6: bấm Tìm kiếm…' + tag, 60000);
        const scope = $('timkiemDiv') || document;
        const sb = byText(scope, 'button,input[type=button],input[type=submit],a', /Tìm kiếm/i) || byText(document, 'button,input[type=button],input[type=submit]', /Tìm kiếm/i);
        if (!sb) { lastWhy = 'không thấy nút "Tìm kiếm"'; await sleep(1500); continue; }
        sb.click();
        await sleep(2000);
        checkAbort();
        const gName = $('gs_TENBENHNHAN'), gYear = $('gs_NAMSINH');
        if (gName) setVal(gName, p.name);
        if (gYear && p.year) setVal(gYear, p.year);
        triggerGridSearch();
        await sleep(2000);

        say('Bước 4/6: chọn bệnh nhân ' + p.name + (p.stt ? ' (STT ' + p.stt + ')' : '') + '…' + tag, 60000);
        let rows = [];
        for (let i = 0; i < 12 && !rows.length; i++) { checkAbort(); rows = findRows(p); if (!rows.length) await sleep(700); }
        if (!rows.length) { lastWhy = 'không thấy bệnh nhân trong danh sách (kiểm tra họ tên/năm sinh/Số TT và "Từ ngày")'; continue; }
        warn = rows.length > 1 && !p.stt ? 'Có ' + rows.length + ' dòng trùng, đã chọn dòng đầu (nên nhập Số TT)' : '';
        for (let t = 0; t < 3 && !selected; t++) {
          checkAbort();
          const row = findRows(p)[0];
          if (!row) { await sleep(700); continue; }
          const td = [...row.cells].find((c) => norm(c.textContent) === norm(p.name)) || row.cells[row.cells.length - 1];
          td.click();
          await sleep(800);
          selected = isSelected(findRows(p)[0]);
        }
        if (!selected) lastWhy = 'không chọn được dòng bệnh nhân';
      }
      if (!selected) throw new Error(lastWhy + ' — đã thử ' + TRIES + ' lần');

      say('Bước 5/6: Khác → Nhập KSK trên 18 tuổi…', 60000);
      const toggle = $('toolbarIdbtnKHAC');
      const item = document.querySelector('#toolbarIdbtnKSKTREN18TUOI a');
      if (!toggle || !item) throw new Error('không thấy menu Khác → Nhập KSK trên 18 tuổi');
      if (item.parentElement.classList.contains('disabled')) throw new Error('mục "Nhập KSK trên 18 tuổi" đang bị khoá');
      setFlow('ksk'); // frame phiếu KSK sẽ chuyển sang tab Khám thể lực - lâm sàng
      toggle.click();
      await sleep(300);
      item.click();
      say(['Đã mở phiếu KSK.', warn].filter(Boolean), 8000);
    } catch (e) {
      clearFlow();
      say('Dừng ở luồng tự động: ' + e.message, 20000);
      batchFail(e.message);
    }
  }

  function initKB() {
    const info = h('div', { style: 'margin-bottom:4px' });
    rerender = () => {
      const p = readJSON(KEY.patient, null);
      info.textContent = p && p.name ? 'Đã nhớ: ' + p.name + ' | ' + (p.year || '?') + (p.stt ? ' | STT ' + p.stt : '') : 'Chưa nhớ bệnh nhân nào';
    };
    rerender();
    bar([
      info,
      btn('📌 Chọn làm bệnh nhân hiện tại', () => {
        const s = readSelected();
        if (!s || !s.name) return say('Hãy click chọn dòng bệnh nhân trong danh sách trước');
        writeJSON(KEY.patient, s);
        rerender();
        say('Đã nhớ: ' + s.name + ' | ' + s.year + (s.stt ? ' | STT ' + s.stt : ' (không đọc được Số TT)'), 8000);
      }, 'Lưu họ tên, năm sinh, Số TT của dòng đang chọn'),
      btn('▶ Mở phiếu KSK', openPatient, 'Tự tìm đúng bệnh nhân đã nhớ và mở phiếu KSK trên 18 tuổi'),
      btn('⏹', () => { aborted = true; clearFlow(); clearBatch(); GM_setValue('kskAuto.stop.v1', Date.now()); say('Đã dừng (kể cả Auto điền / ký số đang chạy)', 4000); }, 'Dừng luồng tự động, chạy tất cả, và Auto điền/ký số đang chạy'),
      btn('⏏', () => { clearBatch(); GM_setValue('kskAuto.stop.v1', Date.now()); doLogout(); }, 'Đăng xuất HIS'),
      btn('⚙', openSettings),
    ]);
    const f = getFlow();
    if (f && f.stage === 'kb') setTimeout(openPatient, 800);
  }

  // ───────────────────────── Frame phiếu KSK: vào tab Khám thể lực - lâm sàng ─────────────────────────
  async function initKSK() {
    const f = getFlow();
    if (!f || f.stage !== 'ksk') return;
    const pane = await waitFor(() => $('tabKhamLamSang'), 30000);
    if (!pane) { clearFlow(); batchFail('không mở được phiếu KSK'); return; }
    await sleep(800); // chờ HIS tự đặt tab mặc định
    const shown = () => pane.classList.contains('active') || pane.classList.contains('in') || pane.getClientRects().length > 0;
    if (!shown()) {
      const a = document.querySelector('a[href="#tabKhamLamSang"]') || byText(document, 'a,button,li', /^Khám thể lực - lâm sàng$/);
      if (a) a.click();
    }
    clearFlow();
    say('Đã mở phiếu KSK, đang ở tab Khám thể lực - lâm sàng. Bấm ⚡ Auto điền để điền các mục của bạn.', 10000);
    batchStep();
  }

  // ───────────────────────── Trang khác (sau đăng nhập, trước khi tới SelDept) ─────────────────────────
  function initOther() {
    const f = getFlow();
    if (!f) return;
    if (f.stage === 'room') gotoUrl(URL_SELDEPT);
    else if (f.stage === 'kb') gotoUrl(URL_KB);
  }

  if (IS_LOGIN) initLoginWhenReady();
  else if (IS_SEL) initSelDept();
  else if (IS_KB) initKB();
  else if (IS_KSK) initKSK();
  else initOther();
})();

// ═══════════════════════════════════════════════════════════════════════
// Ký số: tự điền đăng nhập SmartCA (ausca.vnpt.vn) và hộp e-Seal (nút Xác nhận)
// Chỉ chạy khi nút "✍ Auto ký số" đang ký (cờ kskAuto.sign.v1, hiệu lực 20 phút)
// ═══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const onCA = location.hostname === 'ausca.vnpt.vn';
  const onHis = location.hostname === 'bvbacgiang.vncare.vn';
  if (!onCA && !onHis) return;
  const rj = (k) => { try { const v = GM_getValue(k, ''); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const sign = rj('kskAuto.sign.v1');
  if (!sign || Date.now() - sign.t > 20 * 60 * 1000) return;
  const cur = rj('kskAuto.cur.v1');
  const prof = cur && (rj('kskAuto.profiles.v1') || []).find((p) => p.hisUser === cur.hisUser);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeout, step = 300) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const r = fn(); if (r) return r; await sleep(step); }
    return null;
  };
  const setVal = (el, v) => {
    el.focus();
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const visible = (el) => !!el && el.getClientRects().length > 0;

  if (onCA) {
    (async () => {
      if (!prof || !prof.caUser || !prof.caPass) return; // thiếu tài khoản CA → để bạn tự đăng nhập
      const last = Number(GM_getValue('kskAuto.caTry.v1', 0));
      if (Date.now() - last < 90000) return; // vừa thử rồi (có thể sai mật khẩu) → không lặp
      const u = await waitFor(() => document.getElementById('Username'), 15000);
      const pw = document.getElementById('txtPassword');
      const b = document.getElementById('button');
      if (!u || !pw || !b) return;
      GM_setValue('kskAuto.caTry.v1', Date.now());
      setVal(u, prof.caUser);
      setVal(pw, prof.caPass);
      b.click();
    })();
    return;
  }

  // Hộp e-Seal trong HIS: có #btnConfirm + #password (+ #username nếu hiển thị)
  (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 20 * 60 * 1000) {
      const bc = document.getElementById('btnConfirm');
      const pw = document.getElementById('password');
      if (bc && pw && !bc.dataset.kskDone && visible(bc)) {
        bc.dataset.kskDone = '1';
        if (prof) {
          const un = document.getElementById('username');
          if (un && visible(un) && prof.caUser) setVal(un, prof.caUser);
          if (prof.caPass) setVal(pw, prof.caPass);
        }
        await sleep(300);
        if (pw.value) bc.click(); // chưa có mật khẩu CA thì để bạn tự nhập và bấm
      }
      await sleep(500);
      if (!rj('kskAuto.sign.v1')) return;
    }
  })();
})();
