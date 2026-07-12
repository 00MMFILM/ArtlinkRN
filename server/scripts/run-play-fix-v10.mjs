#!/usr/bin/env node
/**
 * ARTLINK - Play Console v10 (데이터 보안)
 *
 * 핵심: MDC Web은 evaluate().click()이 안 됨!
 *       → Puppeteer mouse.click()을 사용 (실제 마우스 이벤트)
 *       → 각 요소를 scrollIntoView 후 좌표 재계산하여 클릭
 */
import puppeteer from 'puppeteer';

const DEVELOPER_ID = '8820412626693118100';
const APP_ID = '4975271741081347187';
const BASE = `https://play.google.com/console/u/0/developers/${DEVELOPER_ID}/app/${APP_ID}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getWsUrl() {
  const resp = await fetch(`http://127.0.0.1:9222/json/version`);
  return (await resp.json()).webSocketDebuggerUrl;
}

async function ss(page, name) {
  try { await page.screenshot({ path: `/tmp/v10-${name}.png`, fullPage: false }); console.log(`  📸 ${name}`); } catch {}
}

/**
 * 스크롤+좌표재계산+마우스클릭
 * selector: CSS 셀렉터
 * index: 같은 셀렉터에서 N번째 요소 (0-based)
 */
async function scrollAndClick(page, selector, index = 0) {
  // 1. 요소를 scrollIntoView
  await page.evaluate(({ sel, idx }) => {
    const els = document.querySelectorAll(sel);
    if (els[idx]) {
      const container = els[idx].closest('material-radio-button, material-checkbox, .mdc-form-field, .mdc-radio, .mdc-checkbox') || els[idx];
      container.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }, { sel: selector, idx: index });
  await sleep(300);

  // 2. 좌표 가져오기
  const coords = await page.evaluate(({ sel, idx }) => {
    const els = document.querySelectorAll(sel);
    if (!els[idx]) return null;
    const container = els[idx].closest('material-radio-button, material-checkbox, .mdc-form-field, .mdc-radio, .mdc-checkbox') || els[idx];
    const rect = container.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height };
  }, { sel: selector, idx: index });

  if (!coords || coords.w === 0) return false;

  // 3. 마우스 클릭
  await page.mouse.click(coords.x, coords.y);
  await sleep(500);
  return true;
}

/**
 * 라디오그룹 N번째의 M번째 라디오 클릭
 * groupIdx: radiogroup index, radioIdx: 그룹 내 라디오 index
 */
async function clickRadioInGroup(page, groupIdx, radioIdx) {
  // 스크롤
  await page.evaluate(({ gi, ri }) => {
    const groups = document.querySelectorAll('[role="radiogroup"]');
    if (!groups[gi]) return;
    const radios = groups[gi].querySelectorAll('input[role="radio"], input[type="radio"]');
    if (!radios[ri]) return;
    const container = radios[ri].closest('material-radio-button, .mdc-form-field, .mdc-radio') || radios[ri];
    container.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, { gi: groupIdx, ri: radioIdx });
  await sleep(300);

  // 좌표
  const coords = await page.evaluate(({ gi, ri }) => {
    const groups = document.querySelectorAll('[role="radiogroup"]');
    if (!groups[gi]) return null;
    const radios = groups[gi].querySelectorAll('input[role="radio"], input[type="radio"]');
    if (!radios[ri]) return null;
    const container = radios[ri].closest('material-radio-button, .mdc-form-field, .mdc-radio') || radios[ri];
    const rect = container.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width };
  }, { gi: groupIdx, ri: radioIdx });

  if (!coords || coords.w === 0) return false;
  await page.mouse.click(coords.x, coords.y);
  await sleep(500);
  return true;
}

/**
 * 텍스트를 포함하는 체크박스 클릭 (스크롤+마우스클릭)
 */
async function clickCheckboxByText(page, text) {
  // 스크롤 + 좌표 가져오기
  const coords = await page.evaluate((text) => {
    const cbs = document.querySelectorAll('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
    for (const cb of cbs) {
      if (cb.checked) continue;
      const container = cb.closest('material-checkbox, .mdc-checkbox, .mdc-form-field') || cb.parentElement;
      // 부모를 올라가며 텍스트 검색
      let p = container;
      for (let i = 0; i < 5 && p; i++) {
        if (p.textContent?.includes(text)) {
          container.scrollIntoView({ block: 'center', behavior: 'instant' });
          const rect = container.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width };
        }
        p = p.parentElement;
      }
    }
    return null;
  }, text);

  if (!coords || coords.w === 0) return false;

  await sleep(300);

  // 좌표 재계산 (scrollIntoView 후)
  const freshCoords = await page.evaluate((text) => {
    const cbs = document.querySelectorAll('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
    for (const cb of cbs) {
      if (cb.checked) continue;
      const container = cb.closest('material-checkbox, .mdc-checkbox, .mdc-form-field') || cb.parentElement;
      let p = container;
      for (let i = 0; i < 5 && p; i++) {
        if (p.textContent?.includes(text)) {
          const rect = container.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
        p = p.parentElement;
      }
    }
    return null;
  }, text);

  if (!freshCoords) return false;
  await page.mouse.click(freshCoords.x, freshCoords.y);
  await sleep(500);
  return true;
}

/**
 * N번째 체크박스 클릭 (인덱스 기반)
 */
async function clickCheckboxByIndex(page, idx) {
  await page.evaluate((idx) => {
    const cbs = document.querySelectorAll('input[role="checkbox"]:not(:checked), input.mdc-checkbox__native-control:not(:checked)');
    const arr = Array.from(cbs).filter(c => c.offsetWidth > 0 || c.offsetParent);
    if (arr[idx]) {
      const container = arr[idx].closest('material-checkbox, .mdc-checkbox, .mdc-form-field') || arr[idx];
      container.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }, idx);
  await sleep(300);

  const coords = await page.evaluate((idx) => {
    const cbs = document.querySelectorAll('input[role="checkbox"]:not(:checked), input.mdc-checkbox__native-control:not(:checked)');
    const arr = Array.from(cbs).filter(c => c.offsetWidth > 0 || c.offsetParent);
    if (!arr[idx]) return null;
    const container = arr[idx].closest('material-checkbox, .mdc-checkbox, .mdc-form-field') || arr[idx];
    const rect = container.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width };
  }, idx);

  if (!coords || coords.w === 0) return false;
  await page.mouse.click(coords.x, coords.y);
  await sleep(500);
  return true;
}

/**
 * debug-id 버튼 클릭 (Puppeteer native click)
 */
async function clickDebug(page, id) {
  const btn = await page.$(`[debug-id="${id}"]`);
  if (!btn) { console.log(`    [${id}] not found`); return false; }

  const disabled = await page.evaluate(el => el.disabled, btn);
  if (disabled) { console.log(`    [${id}] disabled`); return false; }

  await btn.scrollIntoView();
  await btn.click();
  console.log(`    [${id}] clicked`);
  await sleep(2000);
  return true;
}

/**
 * 상태 감지
 */
async function detectState(page) {
  return page.evaluate(() => {
    const mainBtn = document.querySelector('[debug-id="main-button"]');
    if (mainBtn && (mainBtn.offsetWidth > 0 || mainBtn.offsetParent)) {
      return { step: 'preview', mainBtnDisabled: mainBtn.disabled };
    }

    const nextBtn = document.querySelector('[debug-id="button-next"]');
    const radioGroups = document.querySelectorAll('[role="radiogroup"]');
    const cbs = document.querySelectorAll('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
    const visibleCbs = Array.from(cbs).filter(c => c.offsetWidth > 0 || c.offsetParent);

    let unansweredGroups = 0;
    let totalRadios = 0;
    for (const g of radioGroups) {
      const radios = g.querySelectorAll('input[role="radio"]');
      totalRadios += radios.length;
      if (!Array.from(radios).some(r => r.checked)) unansweredGroups++;
    }

    return {
      step: 'form',
      hasNextBtn: !!nextBtn,
      nextEnabled: nextBtn && !nextBtn.disabled,
      radioGroupCount: radioGroups.length,
      unansweredGroups,
      totalRadios,
      cbCount: visibleCbs.length,
      checkedCbs: visibleCbs.filter(c => c.checked).length,
    };
  }).catch(() => ({ step: 'error' }));
}

// ═══════════════════════════════════════
async function main() {
  console.log('=== ARTLINK - Play Console v10 (데이터 보안) ===\n');

  const wsUrl = await getWsUrl();
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: null,
    protocolTimeout: 180000,
  });

  const pages = await browser.pages();
  let page = pages[0];
  page.setDefaultTimeout(30000);

  // ─── 데이터 보안 페이지 ───
  console.log('[1] 데이터 보안 페이지 이동');
  await page.goto(`${BASE}/app-content/data-privacy-security`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);

  let state = await detectState(page);
  console.log(`  상태: ${JSON.stringify(state)}`);

  // Step 0 → 1
  if (state.step !== 'preview' && state.radioGroupCount === 0 && state.cbCount === 0) {
    console.log('\n[2] Step 0 → 1 (button-next)');
    await clickDebug(page, 'button-next');
    await sleep(5000);
  }

  // ─── Step 1 처리 ───
  state = await detectState(page);
  console.log(`\n[3] Step 1 상태: groups=${state.radioGroupCount}, unanswered=${state.unansweredGroups}, cbs=${state.cbCount}, checked=${state.checkedCbs}`);

  if (state.step === 'preview') {
    console.log('  이미 미리보기 페이지!');
  } else if (state.radioGroupCount > 0) {
    await ss(page, 'step1-before');

    // 모든 라디오그룹 상태 파악
    const groupInfo = await page.evaluate(() => {
      const groups = document.querySelectorAll('[role="radiogroup"]');
      return Array.from(groups).map((g, i) => {
        const radios = g.querySelectorAll('input[role="radio"], input[type="radio"]');
        const checkedIdx = Array.from(radios).findIndex(r => r.checked);
        return { idx: i, count: radios.length, checked: checkedIdx };
      });
    });

    console.log('  라디오그룹 상세:');
    for (const g of groupInfo) {
      console.log(`    Group ${g.idx}: ${g.count}개 라디오, checked=${g.checked}`);
    }

    // 미답변 그룹에 첫번째 라디오 선택
    for (const g of groupInfo) {
      if (g.checked >= 0) continue;
      console.log(`  → Group ${g.idx} 첫번째 라디오 클릭`);
      const ok = await clickRadioInGroup(page, g.idx, 0);
      console.log(`    결과: ${ok}`);
      await sleep(800);
    }

    // 라디오 확인
    const afterRadio = await page.evaluate(() => {
      const groups = document.querySelectorAll('[role="radiogroup"]');
      return Array.from(groups).map((g, i) => {
        const radios = Array.from(g.querySelectorAll('input[role="radio"]'));
        return { idx: i, checked: radios.findIndex(r => r.checked) };
      });
    });
    console.log('  라디오 확인:', JSON.stringify(afterRadio));

    // 체크박스 처리: "계정을 만들도록 허용하지 않음" 체크
    console.log('\n  체크박스 처리...');
    let cbOk = await clickCheckboxByText(page, '허용하지 않음');
    if (!cbOk) cbOk = await clickCheckboxByText(page, '계정을 만들도록');
    if (!cbOk) {
      // 없으면 "OAuth" 또는 첫번째 체크박스
      cbOk = await clickCheckboxByText(page, 'OAuth');
      if (!cbOk) {
        console.log('  텍스트 매칭 실패, 첫번째 CB 클릭');
        cbOk = await clickCheckboxByIndex(page, 0);
      }
    }
    console.log(`  체크박스 결과: ${cbOk}`);
    await sleep(1000);

    // 상태 재확인
    state = await detectState(page);
    console.log(`  step1 결과: unanswered=${state.unansweredGroups}, checkedCbs=${state.checkedCbs}, nextEnabled=${state.nextEnabled}`);
    await ss(page, 'step1-after');

    // 아직 미답변이 있으면 2차 시도 (스크롤 문제 등)
    if (state.unansweredGroups > 0) {
      console.log(`  미답변 ${state.unansweredGroups}개 → 2차 시도`);
      const remaining = await page.evaluate(() => {
        const groups = document.querySelectorAll('[role="radiogroup"]');
        return Array.from(groups).map((g, i) => {
          const radios = Array.from(g.querySelectorAll('input[role="radio"]'));
          if (radios.some(r => r.checked)) return null;
          return i;
        }).filter(x => x !== null);
      });

      for (const gi of remaining) {
        console.log(`    2차: Group ${gi} 클릭`);
        await clickRadioInGroup(page, gi, 0);
        await sleep(1000);
      }
    }

    // 체크박스 재확인
    state = await detectState(page);
    if (state.checkedCbs === 0) {
      console.log('  체크박스 2차 시도');
      await clickCheckboxByIndex(page, 0);
      await sleep(1000);
    }

    state = await detectState(page);
    console.log(`  최종 step1: unanswered=${state.unansweredGroups}, checkedCbs=${state.checkedCbs}, nextEnabled=${state.nextEnabled}`);

    // "다음" 클릭
    if (state.nextEnabled) {
      console.log('\n[4] Step 1 → 다음');
      await clickDebug(page, 'button-next');
      await sleep(5000);
    } else {
      console.log('\n[4] button-next 비활성 - 강제 클릭 시도');
      // Force click
      const btn = await page.$('[debug-id="button-next"]');
      if (btn) {
        await btn.click({ force: true });
        await sleep(5000);
      }
    }
  }

  // ─── 이후 스텝들 자동 진행 ───
  for (let round = 0; round < 20; round++) {
    state = await detectState(page);
    console.log(`\n[Step ${round + 2}] ${state.step}, radios=${state.totalRadios}, cbs=${state.cbCount}, unanswered=${state.unansweredGroups}`);
    await ss(page, `step${round + 2}`);

    // 미리보기 → 저장
    if (state.step === 'preview') {
      console.log('  🎯 미리보기 → "저장" 클릭');
      const saved = await clickDebug(page, 'main-button');
      if (saved) {
        await sleep(5000);
        console.log('  ✅ 저장 완료!');
        break;
      }
      // 안되면 save-draft
      await clickDebug(page, 'save-draft-button');
      await sleep(3000);
      break;
    }

    // 라디오 채우기
    if (state.unansweredGroups > 0) {
      const unanswered = await page.evaluate(() => {
        const groups = document.querySelectorAll('[role="radiogroup"]');
        return Array.from(groups).map((g, i) => {
          const radios = Array.from(g.querySelectorAll('input[role="radio"]'));
          if (radios.some(r => r.checked)) return null;
          return i;
        }).filter(x => x !== null);
      });
      for (const gi of unanswered) {
        await clickRadioInGroup(page, gi, 0);
        await sleep(500);
      }
    }

    // 체크박스 채우기 (데이터 유형 or 용도)
    if (state.cbCount > 0 && state.checkedCbs === 0) {
      // 데이터 유형 체크박스들
      const typeTexts = ['이름', '이메일 주소', '앱 상호작용', '비정상 종료 로그', '기기 또는 기타 ID'];
      let typeChecked = 0;
      for (const t of typeTexts) {
        if (await clickCheckboxByText(page, t)) {
          typeChecked++;
          console.log(`    ✓ ${t}`);
          await sleep(500);
        }
      }
      // 용도 체크박스들
      if (typeChecked === 0) {
        const purposeTexts = ['앱 기능', '분석', '계정 관리'];
        for (const t of purposeTexts) {
          if (await clickCheckboxByText(page, t)) {
            console.log(`    ✓ ${t}`);
            await sleep(500);
          }
        }
      }
      // 아무것도 안되면 인덱스로
      state = await detectState(page);
      if (state.checkedCbs === 0 && state.cbCount > 0) {
        console.log('    인덱스 기반 CB 클릭');
        await clickCheckboxByIndex(page, 0);
      }
    }

    await sleep(1000);

    // "다음" 시도
    let moved = await clickDebug(page, 'button-next');
    if (!moved) {
      moved = await clickDebug(page, 'main-button');
    }
    if (!moved) {
      // 텍스트 버튼 시도
      const btns = await page.$$('button:not([disabled])');
      for (const btn of btns) {
        const text = await page.evaluate(el => el.textContent?.trim(), btn);
        if (text === '다음' || text === '제출' || text === '저장') {
          await btn.click();
          console.log(`    → "${text}" 클릭`);
          moved = true;
          break;
        }
      }
    }
    if (!moved && state.totalRadios === 0 && state.cbCount === 0) {
      console.log('  진행 불가 - 종료');
      break;
    }
    await sleep(4000);
  }

  // ─── 최종 확인 ───
  console.log('\n[최종] 개요 확인');
  await page.goto(`${BASE}/app-content/overview`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);
  await ss(page, 'final');

  const remaining = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a'))
      .filter(b => {
        const t = b.textContent.trim();
        return (t === '선언 시작' || t === '선언 수정') && (b.offsetParent || b.offsetWidth > 0);
      }).length;
  }).catch(() => -1);

  console.log('\n==========================================');
  console.log(`  남은 선언: ${remaining}개`);
  console.log('==========================================\n');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
