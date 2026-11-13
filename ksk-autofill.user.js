// ==UserScript==
// @name         HIS - KSK >18 tuổi: Auto điền
// @namespace    https://bvbacgiang.vncare.vn/
// @version      0.1.0
// @description  Bước 1: tự điền phiếu Khám sức khỏe trên 18 tuổi (KSK_TREN18TUOI_TOANDAN_QD2062) rồi lưu. Bước ký số sẽ bổ sung sau.
// @match        https://bvbacgiang.vncare.vn/vnpthis/main/manager.jsp*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
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
    summary: false,            // điền "Tình trạng bệnh / Ghi chú" ở Tổng kết (đang chờ chốt định dạng)
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
  async function autoFill() {
    if (running) return;
    running = true;
    const btn = $('kskAutoFill');
    if (btn) btn.disabled = true;
    try {
      const cfg = loadCfg();
      const missingEls = await ensureRendered();
      const rep = { filled: [], signed: [], noDoctor: [], badDoctor: [], missing: missingEls, msgs: [], tk: [], errs: [] };
      const toSave = [];

      for (const s of SECTIONS) {
        if (isSigned(s.lck)) { rep.signed.push(s.label); continue; }
        let touched = false;

        for (const f of s.fields) {
          const el = $(f.id);
          const val = cfg[f.cfg];
          if (!el || !val) continue;
          if (!cfg.overwrite && el.value.trim() !== '') continue;
          if (setVal(el, val)) touched = true;
        }

        const c = $(s.cls);
        if (c && (cfg.overwrite || isUnset(c.value))) { if (setSelect(c, cfg.phanLoai)) touched = true; }

        const d = $(s.doc);
        const dv = cfg.doctors[s.lck];
        if (d) {
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
      if (!tkSigned) {
        const m = maxClass();
        const sel = $('cboPHANLOAISUCKHOE_CHON');
        if (m && sel && (cfg.overwrite || isUnset(sel.value))) {
          if (setSelect(sel, String(m))) { rep.tk.push('Phân loại sức khỏe = Loại ' + ROMAN[m]); tkTouched = true; }
        }
        if (cfg.summary) {
          const ta = $('txtTINHTRANGBENH');
          if (ta && (cfg.overwrite || !ta.value.trim())) {
            if (setVal(ta, buildSummary(cfg))) { rep.tk.push('Đã điền ghi chú tổng kết'); tkTouched = true; }
          }
        }
      } else rep.tk.push('Tổng kết đã ký, bỏ qua');

      // Lưu
      if (cfg.saveMode === 'section') {
        for (const s of toSave) {
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

      const L = [`Đã điền ${rep.filled.length}/${SECTIONS.length} mục` +
        (cfg.saveMode === 'none' ? ' (chưa lưu).' : cfg.saveMode === 'main' ? ' và bấm Lưu chung.' : ' và bấm Lưu từng mục.')];
      if (rep.tk.length) L.push('Tổng kết: ' + rep.tk.join('; '));
      if (rep.signed.length) L.push('Bỏ qua (đã ký): ' + rep.signed.join(', '));
      if (rep.noDoctor.length) L.push('⚠ Chưa đặt bác sĩ (vào ⚙ Cài đặt): ' + rep.noDoctor.join(', '));
      if (rep.badDoctor.length) L.push('⚠ Bác sĩ đã cài không có trong danh sách của: ' + rep.badDoctor.join(', '));
      if (rep.missing.length) L.push('⚠ Không tìm thấy ô: ' + rep.missing.join(', '));
      if (rep.errs.length) L.push('⚠ ' + rep.errs.join('; '));
      if (rep.msgs.length) L.push('Thông báo của HIS: ' + rep.msgs.join(' | '));
      toast(L, 25000);
    } catch (e) {
      console.error('[KSK auto]', e);
      toast('Lỗi script: ' + e.message);
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
    const chkSum = h('input', { type: 'checkbox' }); chkSum.checked = !!cfg.summary;

    const grid = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:6px 0';
    const box = h('div', { style: 'background:#fff;width:min(960px,94vw);max-height:90vh;overflow:auto;border-radius:6px;padding:16px;font-size:13px;color:#222' },
      h('h4', { style: 'margin:0 0 8px' }, '⚙ Cài đặt Auto điền KSK'),
      h('div', { style: 'font-weight:700;margin-top:8px' }, '1) Bác sĩ khám của từng mục'),
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
      h('div', { style: 'margin:4px 0' }, h('label', { style: 'margin:0' }, chkSum, ' Điền "Tình trạng bệnh / Ghi chú" ở Tổng kết (thử nghiệm: liệt kê mục khác "Bình thường"/"Không", nếu không có thì ghi "Không")')),
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
  function injectUI() {
    if ($('kskAutoFill')) return;
    const mk = (id, txt, fn) => h('button', { type: 'button', id, class: 'btn btn-sm btn-warning', style: 'margin-left:6px', onclick: fn }, txt);
    const fill = mk('kskAutoFill', '⚡ Auto điền', autoFill);
    const set = mk('kskSettings', '⚙ Cài đặt', openSettings);
    const anchor = $('btn_ChiDinhCls');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.append(fill, set);
    } else {
      document.body.appendChild(h('div', { style: 'position:fixed;right:70px;bottom:8px;z-index:2147482000' }, fill, set));
    }
  }

  waitFor(() => $('txtTUANHOAN') && $('btn_ChiDinhCls'), 60000).then((ok) => {
    if (ok) injectUI(); else console.warn('[KSK auto] Không tìm thấy form KSK để gắn nút');
  });
})();
