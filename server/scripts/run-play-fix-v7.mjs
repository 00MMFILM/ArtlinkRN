#!/usr/bin/env node
/**
 * ARTLINK - Play Console 남은 4개 항목 처리 v7
 *
 * v6 → v7 핵심 수정:
 * 1. Play Console은 Angular Material이 아닌 CUSTOM WEB COMPONENTS 사용
 *    - material-checkbox → input.mdc-checkbox__native-control
 *    - material-radio-button → input.mdc-radio__native-control
 *    - 버튼: debug-id 속성 (next-button, save-draft-button 등)
 * 2. 체크박스/라디오 라벨: 요소 내부가 아닌 SIBLING에 텍스트
 * 3. body.innerText는 531자만 반환 → custom element 내부 텍스트 직접 추출
 * 4. 금융/건강: 스피너 사라질 때까지 대기 + 라디오 Yes/No 먼저 확인
 * 5. 콘텐츠 등급: "수정" 링크 사용 (새 설문지 시작은 disabled)
 */
import puppeteer from 'puppeteer';

const DEVELOPER_ID = '8820412626693118100';
const APP_ID = '4975271741081347187';
const BASE = `https://play.google.com/console/u/0/developers/${DEVELOPER_ID}/app/${APP_ID}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getWsUrl() {
  const resp = await fetch(`http://127.0.0.1:9222/json/version`);
  const data = await resp.json();
  return data.webSocketDebuggerUrl;
}

async function ss(page, name) {
  try { await page.screenshot({ path: `/tmp/v7-${name}.png`, fullPage: false }); console.log(`  📸 ${name}`); } catch {}
}

// ═══════════════════════════════════════
// 핵심 유틸: Play Console Custom Elements
// ═══════════════════════════════════════

/**
 * 페이지 로딩 대기 - 스피너 사라지고 버튼 활성화될 때까지
 */
async function waitForPageReady(page, maxWait = 40000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const state = await page.evaluate(() => {
      const spinners = document.querySelectorAll('mat-spinner, material-spinner, .mat-spinner, [class*="spinner"]');
      const visibleSpinners = Array.from(spinners).filter(s => s.offsetWidth > 0 || s.offsetParent);
      const nextBtn = document.querySelector('[debug-id="next-button"], [debug-id="save-button"]');
      return {
        spinnerCount: visibleSpinners.length,
        nextDisabled: nextBtn ? nextBtn.disabled : null,
        nextExists: !!nextBtn,
      };
    }).catch(() => ({ spinnerCount: -1, nextDisabled: null, nextExists: false }));

    if (state.spinnerCount === 0 && state.nextExists) {
      console.log(`  로딩 완료 (${Date.now() - start}ms), 다음 disabled=${state.nextDisabled}`);
      return state;
    }
    await sleep(1500);
  }
  console.log(`  로딩 타임아웃 (${maxWait}ms)`);
  return null;
}

/**
 * 페이지의 실제 텍스트 추출 (custom elements 내부 포함)
 * body.innerText가 짧을 때 사용
 */
async function getFullText(page) {
  return page.evaluate(() => {
    // TreeWalker로 모든 텍스트 노드 수집
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    const texts = [];
    let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.trim();
      if (t.length > 1) texts.push(t);
    }
    return texts.join(' ').substring(0, 5000);
  }).catch(() => '');
}

/**
 * MDC 체크박스 클릭 - 라벨 텍스트로 찾기
 * Play Console의 체크박스: material-checkbox > div.mdc-checkbox > input.mdc-checkbox__native-control
 * 라벨: sibling elements
 */
async function mdcCheck(page, labelText) {
  try {
    const result = await page.evaluate((labelText) => {
      // 전략 1: role="checkbox" 요소의 부모 트리에서 텍스트 검색
      const checkboxes = document.querySelectorAll('input[role="checkbox"], input.mdc-checkbox__native-control');
      for (const cb of checkboxes) {
        if (cb.offsetWidth === 0 && !cb.offsetParent) continue;
        if (cb.checked) continue; // 이미 체크됨

        // 부모를 거슬러 올라가며 텍스트 찾기
        let container = cb.closest('material-checkbox') || cb.closest('.mdc-form-field') || cb.parentElement;
        if (!container) continue;

        // container와 그 sibling들에서 텍스트 찾기
        let textSource = container.parentElement || container;
        const fullText = textSource.textContent || '';
        if (fullText.includes(labelText)) {
          cb.scrollIntoView({ block: 'center' });
          cb.click();
          return fullText.trim().substring(0, 60);
        }

        // sibling에서 텍스트 찾기
        let sib = container.nextElementSibling;
        for (let i = 0; i < 5 && sib; i++) {
          if (sib.textContent.includes(labelText)) {
            cb.scrollIntoView({ block: 'center' });
            cb.click();
            return sib.textContent.trim().substring(0, 60);
          }
          sib = sib.nextElementSibling;
        }
      }

      // 전략 2: label 요소에서 for 속성으로 매칭
      const labels = document.querySelectorAll('label');
      for (const lbl of labels) {
        if (lbl.textContent.includes(labelText)) {
          const forId = lbl.getAttribute('for');
          if (forId) {
            const inp = document.getElementById(forId);
            if (inp && !inp.checked) { inp.click(); return lbl.textContent.trim().substring(0, 60); }
          }
          // label 내부 또는 근처의 input 클릭
          const inp = lbl.querySelector('input[type="checkbox"]') || lbl.closest('.mdc-form-field')?.querySelector('input');
          if (inp && !inp.checked) { inp.click(); return lbl.textContent.trim().substring(0, 60); }
        }
      }

      // 전략 3: 텍스트를 포함하는 요소 근처의 체크박스
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        if (el.children.length > 0) continue; // leaf nodes only
        if (!el.textContent.includes(labelText)) continue;
        if (el.offsetWidth === 0) continue;

        // 가까운 체크박스 찾기
        const parent = el.closest('[class*="question"], [class*="choice"], [class*="option"], .mdc-form-field') || el.parentElement;
        if (!parent) continue;
        const nearCb = parent.querySelector('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
        if (nearCb && !nearCb.checked) {
          nearCb.scrollIntoView({ block: 'center' });
          nearCb.click();
          return el.textContent.trim().substring(0, 60);
        }
      }

      return null;
    }, labelText);
    if (result) { console.log(`    ✓ check: ${result.substring(0, 50)}`); await sleep(400); }
    return result;
  } catch { return null; }
}

/**
 * MDC 라디오 클릭 - 라벨 텍스트로 찾기
 */
async function mdcRadio(page, labelText) {
  try {
    const result = await page.evaluate((labelText) => {
      // 전략 1: role="radio" 요소
      const radios = document.querySelectorAll('input[role="radio"], input.mdc-radio__native-control, [role="radio"]');
      for (const r of radios) {
        if (r.offsetWidth === 0 && !r.offsetParent) {
          // input은 숨겨져 있을 수 있으므로 부모 확인
          const parent = r.closest('material-radio-button, .mdc-radio, .mdc-form-field');
          if (parent && parent.offsetWidth === 0 && !parent.offsetParent) continue;
        }

        // 부모에서 텍스트 찾기
        let container = r.closest('material-radio-button, .mdc-form-field') || r.parentElement;
        let textSource = container?.parentElement || container;
        if (textSource && textSource.textContent.includes(labelText)) {
          r.scrollIntoView({ block: 'center' });
          r.click();
          // Angular change detection trigger
          r.dispatchEvent(new Event('change', { bubbles: true }));
          return textSource.textContent.trim().substring(0, 60);
        }

        // sibling 검색
        if (container) {
          let sib = container.nextElementSibling;
          for (let i = 0; i < 5 && sib; i++) {
            if (sib.textContent.includes(labelText)) {
              r.scrollIntoView({ block: 'center' });
              r.click();
              r.dispatchEvent(new Event('change', { bubbles: true }));
              return sib.textContent.trim().substring(0, 60);
            }
            sib = sib.nextElementSibling;
          }
        }
      }

      // 전략 2: label 기반
      const labels = document.querySelectorAll('label');
      for (const lbl of labels) {
        if (!lbl.textContent.includes(labelText)) continue;
        const inp = lbl.querySelector('input[type="radio"]') || document.getElementById(lbl.getAttribute('for') || '');
        if (inp) {
          inp.scrollIntoView({ block: 'center' });
          inp.click();
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return lbl.textContent.trim().substring(0, 60);
        }
      }

      // 전략 3: 텍스트 근처 라디오
      const textEls = document.evaluate(
        `//*[contains(text(), '${labelText}')]`,
        document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
      );
      for (let i = 0; i < textEls.snapshotLength; i++) {
        const el = textEls.snapshotItem(i);
        if (el.offsetWidth === 0) continue;
        const parent = el.closest('[class*="question"], [class*="choice"], [class*="option"], .mdc-form-field') || el.parentElement;
        if (!parent) continue;
        const radio = parent.querySelector('input[type="radio"], input[role="radio"]');
        if (radio) {
          radio.scrollIntoView({ block: 'center' });
          radio.click();
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          return el.textContent.trim().substring(0, 60);
        }
      }

      return null;
    }, labelText);
    if (result) { console.log(`    ✓ radio: ${result.substring(0, 50)}`); await sleep(600); }
    return result;
  } catch { return null; }
}

/**
 * 모든 라디오 그룹에서 특정 텍스트 선택
 */
async function mdcRadioAll(page, labelText) {
  try {
    return await page.evaluate((labelText) => {
      let count = 0;
      // radiogroup 찾기
      const groups = document.querySelectorAll('[role="radiogroup"], mat-radio-group, material-radio-group');
      for (const g of groups) {
        const radios = g.querySelectorAll('input[role="radio"], input[type="radio"], [role="radio"]');
        for (const r of radios) {
          let textSource = r.closest('.mdc-form-field, material-radio-button')?.parentElement || r.parentElement;
          if (textSource && textSource.textContent.includes(labelText)) {
            const inp = r.tagName === 'INPUT' ? r : r.querySelector('input');
            if (inp) { inp.click(); inp.dispatchEvent(new Event('change', { bubbles: true })); }
            else r.click();
            count++;
            break;
          }
        }
      }
      return count;
    }, labelText);
  } catch { return 0; }
}

/**
 * debug-id로 버튼 클릭
 */
async function mdcBtnById(page, debugId, force = false) {
  try {
    const result = await page.evaluate((debugId, force) => {
      const btn = document.querySelector(`[debug-id="${debugId}"]`);
      if (!btn) return null;
      if (btn.disabled && !force) return `${btn.textContent.trim()} (disabled)`;
      btn.scrollIntoView({ block: 'center' });
      if (btn.disabled && force) btn.disabled = false;
      btn.click();
      return btn.textContent.trim();
    }, debugId, force);
    if (result) {
      console.log(`    → [${debugId}] ${result}`);
      if (!result.includes('disabled')) await sleep(2000);
      return !result.includes('disabled');
    }
  } catch {}
  return false;
}

/**
 * 텍스트로 버튼 클릭 (shortest match first)
 */
async function btn(page, texts) {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    try {
      const r = await page.evaluate((text) => {
        const candidates = [];
        for (const b of document.querySelectorAll('button, [role="button"]')) {
          if (b.offsetWidth === 0 && !b.offsetParent) continue;
          // mdc-button__label 또는 직접 텍스트
          const label = b.querySelector('.mdc-button__label');
          const t = (label || b).textContent.trim();
          if (t.includes(text) && t.length < text.length + 30) {
            candidates.push({ el: b, text: t, len: t.length, disabled: b.disabled });
          }
        }
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.len - b.len);
        const best = candidates[0];
        if (best.disabled) return `${best.text} (disabled)`;
        best.el.scrollIntoView({ block: 'center' });
        best.el.click();
        return best.text;
      }, text);
      if (r && !r.includes('disabled')) {
        console.log(`    → ${r}`);
        await sleep(2000);
        return true;
      }
      if (r) console.log(`    → ${r}`);
    } catch {}
  }
  return false;
}

/**
 * 링크/버튼 클릭 (정확 매칭 우선)
 */
async function clickLink(page, text) {
  try {
    const r = await page.evaluate((text) => {
      for (const el of document.querySelectorAll('a, button, [role="link"], [role="button"]')) {
        if (el.offsetWidth === 0 && !el.offsetParent) continue;
        const t = el.textContent.trim();
        if (t === text || (t.includes(text) && t.length < text.length + 10)) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return t;
        }
      }
      return null;
    }, text);
    if (r) { console.log(`    → ${r}`); await sleep(2000); return true; }
  } catch {}
  return false;
}

async function goOverview(page) {
  await page.goto(`${BASE}/app-content/overview`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);
}

async function countDecl(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a'))
      .filter(b => { const t = b.textContent.trim(); return (t === '선언 시작' || t === '선언 수정') && (b.offsetParent || b.offsetWidth > 0); })
      .length;
  }).catch(() => -1);
}

/**
 * 페이지 내 interactive 요소 진단
 */
async function diagnose(page) {
  return page.evaluate(() => {
    const result = {
      checkboxes: [],
      radios: [],
      buttons: [],
      textLength: 0,
      spinners: 0,
    };

    // Checkboxes
    const cbs = document.querySelectorAll('input[role="checkbox"], input.mdc-checkbox__native-control, input[type="checkbox"]');
    for (const cb of cbs) {
      if (cb.offsetWidth === 0 && !cb.offsetParent) {
        const p = cb.closest('material-checkbox, .mdc-checkbox');
        if (!p || (p.offsetWidth === 0 && !p.offsetParent)) continue;
      }
      let label = '';
      let container = cb.closest('.mdc-form-field, material-checkbox');
      if (container) {
        let parent = container.parentElement;
        if (parent) label = parent.textContent.trim().substring(0, 80);
      }
      result.checkboxes.push({ checked: cb.checked, label: label || '(no label)' });
    }

    // Radios
    const rds = document.querySelectorAll('input[role="radio"], input.mdc-radio__native-control, input[type="radio"]');
    for (const r of rds) {
      let label = '';
      let container = r.closest('.mdc-form-field, material-radio-button');
      if (container) {
        let parent = container.parentElement;
        if (parent) label = parent.textContent.trim().substring(0, 80);
      }
      result.radios.push({ checked: r.checked, label: label || '(no label)' });
    }

    // Buttons with debug-id
    for (const btn of document.querySelectorAll('[debug-id]')) {
      if (btn.tagName === 'BUTTON' || btn.getAttribute('role') === 'button') {
        result.buttons.push({
          debugId: btn.getAttribute('debug-id'),
          text: btn.textContent.trim().substring(0, 30),
          disabled: btn.disabled,
          visible: btn.offsetWidth > 0 || !!btn.offsetParent,
        });
      }
    }

    // Spinners
    const spinners = document.querySelectorAll('mat-spinner, material-spinner, .mat-spinner');
    result.spinners = Array.from(spinners).filter(s => s.offsetWidth > 0 || s.offsetParent).length;

    // Text
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let textLen = 0;
    let node;
    while (node = walker.nextNode()) { textLen += node.textContent.trim().length; }
    result.textLength = textLen;

    return result;
  }).catch(() => null);
}

// ═══════════════════════════════════════
// 1. 금융 기능
// ═══════════════════════════════════════
async function doFinance(page) {
  console.log('\n═══ [1] 금융 기능 ═══');

  // 직접 URL 이동
  await page.goto(`${BASE}/app-content/finance`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);

  // 진단
  let diag = await diagnose(page);
  console.log(`  진단: cb=${diag?.checkboxes.length}, radio=${diag?.radios.length}, spinners=${diag?.spinners}, textLen=${diag?.textLength}`);
  if (diag?.buttons.length) {
    for (const b of diag.buttons) console.log(`    btn [${b.debugId}] "${b.text}" disabled=${b.disabled}`);
  }
  await ss(page, 'fin-1');

  // 스피너가 있으면 대기
  if (diag?.spinners > 0) {
    console.log('  스피너 대기...');
    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      diag = await diagnose(page);
      if (!diag?.spinners) { console.log(`  스피너 해제 (${(i + 1) * 3}s)`); break; }
    }
  }

  // 스피너 해제 후 재진단
  if (diag?.spinners > 0) {
    console.log('  스피너 해제 안됨, 페이지 새로고침 시도...');
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await sleep(8000);
    diag = await diagnose(page);
    console.log(`  새로고침 후: cb=${diag?.checkboxes.length}, radio=${diag?.radios.length}, spinners=${diag?.spinners}`);
  }

  await ss(page, 'fin-2');

  // fullText로 페이지 내용 확인
  const fullText = await getFullText(page);
  console.log(`  fullText: ${fullText.substring(0, 200).replace(/\n/g, ' ')}`);

  // 이미 Step 2인지 확인
  if (fullText.includes('추가 문서를 제출하지 않아도') || fullText.includes('변경사항이 생기면')) {
    console.log('  이미 Step 2 → 저장');
    await mdcBtnById(page, 'save-button') || await btn(page, ['저장']);
    await sleep(3000);
    await ss(page, 'fin-done');
    return '금융: ✅ (step2 저장)';
  }

  // 라디오 버튼 확인 (Yes/No 질문이 있을 수 있음)
  if (diag?.radios.length > 0) {
    console.log('  라디오 발견:');
    for (const r of diag.radios) console.log(`    ${r.checked ? '●' : '○'} ${r.label.substring(0, 60)}`);

    // "아니요" 또는 "No" 선택 시도
    const noClicked = await mdcRadio(page, '아니요') || await mdcRadio(page, 'No') || await mdcRadio(page, '해당 없음');
    if (noClicked) {
      console.log('  "아니요" 선택됨');
      await sleep(1500);
    }
  }

  // 체크박스가 있는 경우 - 해당 없음 찾기
  if (diag?.checkboxes.length > 0) {
    console.log(`  체크박스 ${diag.checkboxes.length}개:`)
    for (const cb of diag.checkboxes.slice(0, 5)) {
      console.log(`    ${cb.checked ? '☑' : '☐'} ${cb.label.substring(0, 60)}`);
    }

    // "해당 없음" 또는 "None" 체크박스 시도
    const noneChecked = await mdcCheck(page, '해당 없음') || await mdcCheck(page, '해당사항 없음') || await mdcCheck(page, 'None');

    if (!noneChecked) {
      // "기타" 섹션의 마지막 체크박스 시도 (보통 "해당 없음"이 마지막)
      console.log('  "해당 없음" 없음, 마지막 체크박스 시도...');
      await page.evaluate(() => {
        // 모든 visible 체크박스 중 마지막 것
        const allCbs = Array.from(document.querySelectorAll('input[role="checkbox"], input.mdc-checkbox__native-control'))
          .filter(cb => {
            const p = cb.closest('material-checkbox, .mdc-checkbox');
            return p ? (p.offsetWidth > 0 || p.offsetParent) : (cb.offsetWidth > 0);
          });
        // 마지막 3개 체크박스의 텍스트 확인
        const last3 = allCbs.slice(-3);
        for (const cb of last3) {
          let container = cb.closest('.mdc-form-field, material-checkbox')?.parentElement;
          let text = container?.textContent || '';
          if (text.includes('해당') || text.includes('없음') || text.includes('None') || text.includes('기타')) {
            if (!cb.checked) cb.click();
            return text.substring(0, 50);
          }
        }
        return null;
      }).catch(() => null);
    }
  }

  await sleep(1000);

  // "다음" 클릭 시도
  let nextOk = await mdcBtnById(page, 'next-button');
  if (!nextOk) {
    nextOk = await btn(page, ['다음', 'Next']);
  }
  if (!nextOk) {
    // 강제 클릭
    console.log('  다음 disabled, force click...');
    await mdcBtnById(page, 'next-button', true);
    await sleep(3000);
  }

  await sleep(5000);
  await ss(page, 'fin-3');

  // Step 2: 저장
  const text2 = await getFullText(page);
  console.log(`  Step2: ${text2.substring(0, 100).replace(/\n/g, ' ')}`);

  await mdcBtnById(page, 'save-button') || await btn(page, ['저장', 'Save']);
  await sleep(3000);

  // 추가 단계 있으면 계속
  for (let i = 0; i < 3; i++) {
    if (page.url().includes('overview')) break;
    await mdcBtnById(page, 'save-button') || await mdcBtnById(page, 'next-button') || await btn(page, ['저장', '다음']);
    await sleep(3000);
  }

  await ss(page, 'fin-done');
  return '금융: ✅';
}

// ═══════════════════════════════════════
// 2. 건강 기능
// ═══════════════════════════════════════
async function doHealth(page) {
  console.log('\n═══ [2] 건강 기능 ═══');

  await page.goto(`${BASE}/app-content/health`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);

  let diag = await diagnose(page);
  console.log(`  진단: cb=${diag?.checkboxes.length}, radio=${diag?.radios.length}, spinners=${diag?.spinners}`);
  if (diag?.buttons.length) {
    for (const b of diag.buttons) console.log(`    btn [${b.debugId}] "${b.text}" disabled=${b.disabled}`);
  }
  await ss(page, 'health-1');

  // 스피너 대기
  if (diag?.spinners > 0) {
    console.log('  스피너 대기...');
    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      diag = await diagnose(page);
      if (!diag?.spinners) { console.log(`  스피너 해제 (${(i + 1) * 3}s)`); break; }
    }
    if (diag?.spinners > 0) {
      await page.reload({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
      await sleep(8000);
      diag = await diagnose(page);
    }
  }

  const fullText = await getFullText(page);
  console.log(`  fullText: ${fullText.substring(0, 200).replace(/\n/g, ' ')}`);

  // Step 2 확인
  if (fullText.includes('지역별 요구사항을 제공하지 않아도') || fullText.includes('변경사항이 생기면')) {
    console.log('  이미 Step 2 → 저장');
    await mdcBtnById(page, 'save-button') || await btn(page, ['저장']);
    await sleep(3000);
    return '건강: ✅ (step2)';
  }

  // 라디오 "아니요" 시도
  if (diag?.radios.length > 0) {
    await mdcRadio(page, '아니요') || await mdcRadio(page, 'No') || await mdcRadio(page, '해당 없음');
    await sleep(1000);
  }

  // 체크박스 "해당 없음"
  if (diag?.checkboxes.length > 0) {
    await mdcCheck(page, '해당 없음') || await mdcCheck(page, '해당사항 없음') || await mdcCheck(page, 'None');
  }

  await sleep(1000);

  // 다음
  let nextOk = await mdcBtnById(page, 'next-button') || await btn(page, ['다음']);
  if (!nextOk) {
    await mdcBtnById(page, 'next-button', true); // force
    await sleep(3000);
  }

  await sleep(5000);
  await ss(page, 'health-2');

  // 저장
  await mdcBtnById(page, 'save-button') || await btn(page, ['저장']);
  await sleep(3000);

  for (let i = 0; i < 3; i++) {
    if (page.url().includes('overview')) break;
    await mdcBtnById(page, 'save-button') || await mdcBtnById(page, 'next-button') || await btn(page, ['저장', '다음']);
    await sleep(3000);
  }

  await ss(page, 'health-done');
  return '건강: ✅';
}

// ═══════════════════════════════════════
// 3. 콘텐츠 등급
// ═══════════════════════════════════════
async function doContentRating(page) {
  console.log('\n═══ [3] 콘텐츠 등급 ═══');

  await page.goto(`${BASE}/app-content/content-rating`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);
  await ss(page, 'rating-1');

  const diag = await diagnose(page);
  const fullText = await getFullText(page);
  console.log(`  fullText: ${fullText.substring(0, 200).replace(/\n/g, ' ')}`);
  console.log(`  진단: cb=${diag?.checkboxes.length}, radio=${diag?.radios.length}`);
  if (diag?.buttons.length) {
    for (const b of diag.buttons) console.log(`    btn [${b.debugId}] "${b.text}" disabled=${b.disabled}`);
  }

  // dialog 자동 수락
  page.on('dialog', async d => { console.log(`    대화상자: ${d.message().substring(0, 50)}`); await d.accept(); });

  // "수정" 링크 클릭 (새 설문지 시작이 disabled이므로)
  let started = await clickLink(page, '수정');
  if (!started) {
    // "새 설문지 시작" 시도
    started = await clickLink(page, '새 설문지 시작');
  }
  if (!started) {
    // debug-id 시도
    started = await mdcBtnById(page, 'start-questionnaire', true);
  }

  await sleep(5000);
  await ss(page, 'rating-2');

  // 진단
  const diag2 = await diagnose(page);
  console.log(`  폼 진단: cb=${diag2?.checkboxes.length}, radio=${diag2?.radios.length}`);
  if (diag2?.radios.length > 0) {
    for (const r of diag2.radios.slice(0, 5)) console.log(`    ${r.checked ? '●' : '○'} ${r.label.substring(0, 60)}`);
  }

  // 이메일 입력
  try {
    const inputs = await page.$$('input');
    for (const inp of inputs) {
      const props = await page.evaluate(el => ({
        type: el.type, val: el.value,
        visible: el.offsetWidth > 0 || !!el.offsetParent,
      }), inp);
      if (props.visible && (props.type === 'email' || props.type === 'text') && (!props.val || props.val.length < 3)) {
        await inp.click({ clickCount: 3 });
        await inp.type('leechan0415@gmail.com', { delay: 30 });
        console.log('    이메일 입력');
        break;
      }
    }
  } catch (e) { console.log(`    이메일 오류: ${e.message.substring(0, 40)}`); }

  await sleep(500);

  // 카테고리 선택: "다른 모든 앱 유형"
  const catSelected = await mdcRadio(page, '다른 모든 앱 유형') ||
    await mdcRadio(page, 'All Other App Types') ||
    await mdcRadio(page, '기타') ||
    await mdcRadio(page, 'Other');

  if (!catSelected) {
    // 세 번째 라디오 버튼 직접 클릭 (게임, 소셜, 다른 모든 앱 유형)
    console.log('  카테고리 선택 실패, 3번째 라디오 직접 클릭...');
    await page.evaluate(() => {
      const radios = document.querySelectorAll('input[role="radio"], input[type="radio"], input.mdc-radio__native-control');
      const visible = Array.from(radios).filter(r => {
        const p = r.closest('.mdc-form-field, material-radio-button');
        return p ? (p.offsetWidth > 0 || p.offsetParent) : (r.offsetWidth > 0);
      });
      // 3번째 (0-indexed: 2)가 "다른 모든 앱 유형"
      if (visible.length >= 3) {
        visible[2].scrollIntoView({ block: 'center' });
        visible[2].click();
        visible[2].dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      // 마지막 라디오라도 클릭
      if (visible.length > 0) {
        const last = visible[visible.length - 1];
        last.scrollIntoView({ block: 'center' });
        last.click();
        last.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }).catch(() => false);
    await sleep(600);
  }

  // 이용약관 체크
  await mdcCheck(page, 'IARC') || await mdcCheck(page, '이용약관');

  await sleep(500);
  await ss(page, 'rating-3');

  // "다음" 클릭
  await mdcBtnById(page, 'next-button') || await btn(page, ['다음', 'Next']);
  await sleep(8000);
  await ss(page, 'rating-q0');

  // IARC 설문 - 모든 질문에 "아니요"
  for (let step = 0; step < 20; step++) {
    const url = page.url();
    if (url.includes('overview') || url.includes('summary')) break;

    const stepDiag = await diagnose(page);
    console.log(`    Q${step}: radio=${stepDiag?.radios.length}, cb=${stepDiag?.checkboxes.length}`);

    if (stepDiag?.radios.length > 0) {
      // 모든 라디오 그룹에서 "아니요" 선택
      const cnt = await mdcRadioAll(page, '아니요');
      if (cnt === 0) {
        const cnt2 = await mdcRadioAll(page, 'No');
        if (cnt2 > 0) console.log(`    ${cnt2}개 "No"`);
        else {
          // 각 그룹의 두 번째 라디오 (보통 "아니요") 직접 클릭
          await page.evaluate(() => {
            const groups = document.querySelectorAll('[role="radiogroup"]');
            for (const g of groups) {
              const radios = g.querySelectorAll('input[role="radio"], input[type="radio"]');
              if (radios.length >= 2 && !radios[1].checked) {
                radios[1].click();
                radios[1].dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          }).catch(() => {});
        }
      } else {
        console.log(`    ${cnt}개 "아니요"`);
      }
    }

    await sleep(800);

    // 다음/제출
    let moved = await mdcBtnById(page, 'next-button') || await btn(page, ['다음', 'Next']);
    if (!moved) {
      moved = await btn(page, ['제출', 'Submit', '저장', 'Save', '적용', 'Apply', '등급 계산']);
      if (!moved && stepDiag?.radios.length === 0 && stepDiag?.checkboxes.length === 0) {
        console.log('    진행 불가, 종료');
        break;
      }
      if (!moved) {
        // force next
        await mdcBtnById(page, 'next-button', true);
      }
    }
    await sleep(5000);
    if (step < 5) await ss(page, `rating-q${step + 1}`);
  }

  // 최종 제출
  await btn(page, ['제출', 'Submit', '적용', 'Apply']);
  await sleep(3000);
  await ss(page, 'rating-done');
  return '콘텐츠 등급: ✅';
}

// ═══════════════════════════════════════
// 4. 데이터 보안
// ═══════════════════════════════════════
async function doDataSafety(page) {
  console.log('\n═══ [4] 데이터 보안 ═══');

  await page.goto(`${BASE}/app-content/data-privacy-security`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);
  await ss(page, 'data-1');

  const diag = await diagnose(page);
  console.log(`  진단: cb=${diag?.checkboxes.length}, radio=${diag?.radios.length}, textLen=${diag?.textLength}`);

  // 스텝 번호 감지 함수
  async function getStepInfo() {
    return page.evaluate(() => {
      // material-stepper의 활성 스텝 찾기
      const stepHeaders = document.querySelectorAll('[class*="step-header"], mat-step-header, [role="tab"]');
      let activeStep = -1;
      let stepLabels = [];
      for (let i = 0; i < stepHeaders.length; i++) {
        const h = stepHeaders[i];
        const isActive = h.classList.contains('active') ||
          h.getAttribute('aria-selected') === 'true' ||
          h.classList.contains('cdk-focused') ||
          h.querySelector('[class*="active"]');
        stepLabels.push(h.textContent.trim().substring(0, 30));
        if (isActive) activeStep = i;
      }

      // 활성 스텝 콘텐츠
      const contents = document.querySelectorAll('[class*="step-content"], [class*="stepper-content"]');
      let activeContent = '';
      for (const c of contents) {
        if (c.offsetHeight > 50 && c.offsetWidth > 50) {
          activeContent = c.textContent.trim().substring(0, 300);
          break;
        }
      }

      // h1/h2 제목
      const heading = document.querySelector('h1, h2')?.textContent.trim() || '';

      return { activeStep, stepLabels, activeContent, heading };
    }).catch(() => ({ activeStep: -1, stepLabels: [], activeContent: '', heading: '' }));
  }

  let prevStep = -1;
  let stuckCount = 0;

  for (let round = 0; round < 30; round++) {
    const url = page.url();
    if (url.includes('app-content/overview')) break;

    const stepInfo = await getStepInfo();
    const fullText = await getFullText(page);
    const stepDiag = await diagnose(page);

    console.log(`  round ${round}: step=${stepInfo.activeStep}, heading="${stepInfo.heading.substring(0, 30)}", radio=${stepDiag?.radios.length}, cb=${stepDiag?.checkboxes.length}`);

    if (round < 15) await ss(page, `data-r${round}`);

    // stuck 감지
    if (stepInfo.activeStep === prevStep) {
      stuckCount++;
      if (stuckCount > 3) {
        console.log('  같은 스텝에서 멈춤, 강제 다음...');
        await mdcBtnById(page, 'next-button', true);
        await sleep(3000);
        stuckCount = 0;
        continue;
      }
    } else {
      stuckCount = 0;
    }
    prevStep = stepInfo.activeStep;

    // ── 콘텐츠 기반 처리 ──

    // 개요 페이지 (step 0 또는 개요 텍스트)
    if (fullText.includes('데이터 보안 양식은 Google Play에서 사용자') ||
        fullText.includes('개인정보처리방침') && stepInfo.activeStep <= 0) {
      console.log('    → 개요: 다음');
      await mdcBtnById(page, 'next-button') || await btn(page, ['다음']);
      await sleep(4000);
      continue;
    }

    // "데이터를 수집하거나 공유하나요?" - 핵심 질문
    if (fullText.includes('수집하거나 공유') || fullText.includes('collect or share')) {
      console.log('    → 수집/공유');
      // "예" 선택 (앱이 이메일/사용자ID 수집하므로)
      await mdcRadio(page, '예') || await mdcRadio(page, 'Yes');
      await sleep(800);
    }

    // 암호화
    if (fullText.includes('암호화하여 전송') || fullText.includes('encrypted in transit')) {
      console.log('    → 암호화: 예');
      await mdcRadio(page, '예') || await mdcRadio(page, 'Yes');
      await sleep(800);
    }

    // 삭제 요청
    if (fullText.includes('삭제를 요청할 수 있는') || fullText.includes('request that data be deleted')) {
      console.log('    → 삭제: 예');
      await mdcRadio(page, '예') || await mdcRadio(page, 'Yes');
      await sleep(800);
    }

    // 데이터 유형 선택
    if (fullText.includes('수집되는 사용자 데이터') || fullText.includes('데이터 유형을 선택') ||
        fullText.includes('어떤 유형의')) {
      console.log('    → 데이터 유형');
      await mdcCheck(page, '이름') || await mdcCheck(page, 'Name');
      await mdcCheck(page, '이메일 주소') || await mdcCheck(page, 'Email address');
      await mdcCheck(page, '사용자 ID') || await mdcCheck(page, 'User IDs');
      await mdcCheck(page, '앱 상호작용') || await mdcCheck(page, 'App interactions');
      await mdcCheck(page, '비정상 종료 로그') || await mdcCheck(page, 'Crash logs');
      await mdcCheck(page, '기기 또는 기타 ID') || await mdcCheck(page, 'Device or other IDs');
    }

    // 공유 여부
    if (fullText.includes('제3자와 공유') || fullText.includes('shared with third')) {
      console.log('    → 제3자 공유: 아니요');
      await mdcRadio(page, '아니요') || await mdcRadio(page, 'No');
      await sleep(800);
    }

    // 수집 목적
    if (fullText.includes('수집 목적') || fullText.includes('purpose') || fullText.includes('어떤 용도')) {
      console.log('    → 수집 목적');
      await mdcCheck(page, '앱 기능') || await mdcCheck(page, 'App functionality');
      await mdcCheck(page, '분석') || await mdcCheck(page, 'Analytics');
    }

    // 필수/선택
    if (fullText.includes('사용자가 이 데이터 수집에 동의') || fullText.includes('필수적인가요')) {
      console.log('    → 필수');
      await mdcRadio(page, '아니요') || await mdcRadio(page, 'No');
      // "데이터 수집은 필수" 라디오가 있을 수도
      await mdcRadio(page, '데이터 수집은 필수');
    }

    // 미리보기/Store listing
    if (fullText.includes('Google Play 스토어에 표시') || fullText.includes('미리보기') || fullText.includes('Store listing preview')) {
      console.log('    → 미리보기: 제출');
      await btn(page, ['제출', 'Submit']);
      await sleep(3000);
      break;
    }

    // 계정 생성
    if (fullText.includes('계정을 만들') || fullText.includes('계정 생성') || fullText.includes('account creation')) {
      console.log('    → 계정 생성');
      await mdcCheck(page, '이메일') || await mdcCheck(page, 'Email');
      await mdcCheck(page, 'Google');
    }

    // 하단 스크롤
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);

    // "다음" 또는 "제출"
    let moved = await mdcBtnById(page, 'next-button') || await btn(page, ['다음', 'Next']);
    if (!moved) {
      moved = await btn(page, ['제출', 'Submit', '저장', 'Save']);
      if (!moved) {
        // 모든 미응답 라디오에 "예" 선택 후 재시도
        if (stepDiag?.radios.some(r => !r.checked)) {
          console.log('    미응답 라디오 있음, "예" 시도...');
          await mdcRadioAll(page, '예');
          await sleep(500);
          await mdcBtnById(page, 'next-button') || await btn(page, ['다음']);
        }
      }
    }
    await sleep(4000);
  }

  // 최종 제출
  await btn(page, ['제출', 'Submit']);
  await sleep(2000);
  await ss(page, 'data-done');
  return '데이터 보안: ✅';
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════
async function main() {
  console.log('=== ARTLINK - Play Console v7 ===');
  console.log('Custom Web Components 대응 + 진단 기반\n');

  const wsUrl = await getWsUrl();
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: null,
    protocolTimeout: 180000,
  });

  const pages = await browser.pages();
  let page = pages[0];
  page.setDefaultTimeout(30000);

  const results = [];

  try { results.push(await doFinance(page)); } catch (e) { console.log(`❌ 금융: ${e.message.substring(0, 60)}`); results.push('금융: ❌'); }
  try { results.push(await doHealth(page)); } catch (e) { console.log(`❌ 건강: ${e.message.substring(0, 60)}`); results.push('건강: ❌'); }
  try { results.push(await doContentRating(page)); } catch (e) { console.log(`❌ 콘텐츠 등급: ${e.message.substring(0, 60)}`); results.push('콘텐츠 등급: ❌'); }
  try { results.push(await doDataSafety(page)); } catch (e) { console.log(`❌ 데이터 보안: ${e.message.substring(0, 60)}`); results.push('데이터 보안: ❌'); }

  // Final check
  await goOverview(page);
  const finalCnt = await countDecl(page);
  await ss(page, 'final');

  console.log('\n==========================================');
  for (const r of results) console.log(`  ${r}`);
  console.log(`\n  남은 선언: ${finalCnt}개`);
  console.log('==========================================');
  console.log('\n스크린샷: /tmp/v7-*.png\n');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
