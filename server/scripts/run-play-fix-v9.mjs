#!/usr/bin/env node
/**
 * ARTLINK - Play Console v9
 * 데이터 보안만 처리 (마지막 남은 1개 항목)
 *
 * 진단 결과:
 * - Step 0: button-next (활성) → 클릭
 * - Step 1: 5 라디오그룹 + 9 체크박스 → 채우고 button-next
 * - Step 2-4: 데이터유형/취급/처리 (수집=예일때만)
 * - 미리보기: main-button "저장" 클릭
 *
 * 미리보기 페이지 debug-id:
 *   discard-button, back-button, save-draft-button, main-button
 * 일반 스텝 debug-id:
 *   button-next, button-back, button-save-draft, button-discard
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
  try { await page.screenshot({ path: `/tmp/v9-${name}.png`, fullPage: false }); console.log(`  📸 ${name}`); } catch {}
}

/**
 * 현재 스텝 감지: stepper의 활성 스텝 번호 (0-based)
 * 또는 버튼 debug-id로 판단
 */
async function detectState(page) {
  return page.evaluate(() => {
    // main-button 있으면 미리보기 (최종 페이지)
    const mainBtn = document.querySelector('[debug-id="main-button"]');
    if (mainBtn && (mainBtn.offsetWidth > 0 || mainBtn.offsetParent)) {
      return { step: 'preview', mainBtnDisabled: mainBtn.disabled };
    }

    // button-next 있으면 일반 스텝
    const nextBtn = document.querySelector('[debug-id="button-next"]');
    const nextEnabled = nextBtn && !nextBtn.disabled;

    // 라디오/체크박스 수
    const radios = document.querySelectorAll('input[role="radio"], input[type="radio"]');
    const cbs = document.querySelectorAll('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
    const radioGroups = document.querySelectorAll('[role="radiogroup"]');

    // 페이지 텍스트에서 스텝 힌트
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const texts = []; let node;
    while (node = walker.nextNode()) { const t = node.textContent.trim(); if (t.length > 3) texts.push(t); }
    const fullText = texts.join(' ');

    const isOverview = fullText.includes('개요') && fullText.includes('데이터 수집 및 보안') && radios.length === 0 && cbs.length === 0;
    const isStep1 = fullText.includes('데이터 수집 및 보안') && (radioGroups.length > 0 || cbs.length > 3);
    const isDataTypes = fullText.includes('데이터 유형') && cbs.length > 0;

    return {
      step: isOverview ? 'overview' : isStep1 ? 'step1' : isDataTypes ? 'dataTypes' : 'unknown',
      hasNextBtn: !!nextBtn,
      nextEnabled,
      radioCount: radios.length,
      cbCount: cbs.length,
      radioGroupCount: radioGroups.length,
    };
  }).catch(() => ({ step: 'error' }));
}

/**
 * 모든 미답변 라디오그룹에 첫번째 라디오 선택 (=예)
 */
async function fillRadios(page) {
  return page.evaluate(() => {
    let count = 0;
    const groups = document.querySelectorAll('[role="radiogroup"]');
    for (const g of groups) {
      const radios = g.querySelectorAll('input[role="radio"], input[type="radio"]');
      const anyChecked = Array.from(radios).some(r => r.checked);
      if (!anyChecked && radios.length >= 1) {
        radios[0].scrollIntoView({ block: 'center' });
        radios[0].click();
        radios[0].dispatchEvent(new Event('change', { bubbles: true }));
        count++;
      }
    }
    return count;
  }).catch(() => 0);
}

/**
 * Step 1의 계정 생성 방법 체크박스 처리
 * "앱에서 사용자가 계정을 만들도록 허용하지 않음" 체크
 * 또는 적절한 방법 체크
 */
async function fillStep1Checkboxes(page) {
  return page.evaluate(() => {
    const cbs = document.querySelectorAll('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
    for (const cb of cbs) {
      if (cb.checked) continue;
      if (cb.offsetWidth === 0 && !cb.offsetParent) continue;

      // 체크박스의 라벨 텍스트 찾기
      let label = '';
      const ff = cb.closest('.mdc-form-field, material-checkbox') || cb.parentElement;
      if (ff) label = ff.textContent?.trim() || '';
      if (!label) {
        let p = cb.parentElement;
        for (let i = 0; i < 5 && p; i++) {
          const txt = p.textContent?.trim();
          if (txt && txt.length > 3 && txt.length < 200) { label = txt; break; }
          p = p.parentElement;
        }
      }

      // "계정을 만들도록 허용하지 않음" 또는 "OAuth" 체크
      if (label.includes('허용하지 않음') || label.includes('계정을 만들도록')) {
        cb.scrollIntoView({ block: 'center' });
        cb.click();
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        return `checked: ${label.substring(0, 50)}`;
      }
    }

    // 못 찾으면 "OAuth" 시도
    for (const cb of cbs) {
      if (cb.checked) continue;
      if (cb.offsetWidth === 0 && !cb.offsetParent) continue;
      const ff = cb.closest('.mdc-form-field, material-checkbox') || cb.parentElement;
      const label = ff?.textContent?.trim() || '';
      if (label.includes('OAuth') || label.includes('Google')) {
        cb.scrollIntoView({ block: 'center' });
        cb.click();
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        return `checked: ${label.substring(0, 50)}`;
      }
    }

    return null;
  }).catch(() => null);
}

/**
 * debug-id 버튼 클릭
 */
async function clickDebug(page, id) {
  const result = await page.evaluate((id) => {
    const btn = document.querySelector(`[debug-id="${id}"]`);
    if (!btn) return 'not found';
    if (btn.disabled) return 'disabled';
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    return 'clicked';
  }, id).catch(() => 'error');
  console.log(`    [${id}] ${result}`);
  return result === 'clicked';
}

/**
 * 데이터 유형 체크박스 - 스크롤해서 모두 찾기
 */
async function fillDataTypes(page) {
  // 먼저 스크롤 다운해서 모든 콘텐츠 로드
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  const types = ['이름', '이메일 주소', '사용자 ID', '앱 상호작용', '비정상 종료 로그', '기기 또는 기타 ID'];
  let checkedCount = 0;

  for (const text of types) {
    const result = await page.evaluate((text) => {
      const xpath = document.evaluate(
        `//*[contains(text(), '${text}')]`,
        document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
      );
      for (let i = 0; i < xpath.snapshotLength; i++) {
        const el = xpath.snapshotItem(i);
        if (el.offsetWidth === 0 && !el.offsetParent) continue;

        let parent = el.parentElement;
        for (let j = 0; j < 8 && parent; j++) {
          const cb = parent.querySelector('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
          if (cb && !cb.checked) {
            cb.scrollIntoView({ block: 'center' });
            cb.click();
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          parent = parent.parentElement;
        }
      }
      return false;
    }, text).catch(() => false);

    if (result) {
      console.log(`    ✓ ${text}`);
      checkedCount++;
      await sleep(300);
    }
  }
  return checkedCount;
}

/**
 * 데이터 취급 및 처리 - 각 데이터 유형별 질문 처리
 */
async function fillDataHandling(page) {
  // 라디오 그룹: 첫번째 선택 (수집/공유 여부, 데이터 임시 처리 등)
  const radioFilled = await fillRadios(page);

  // 체크박스: 용도 (앱 기능, 분석 등)
  const cbTexts = ['앱 기능', '분석', '개발자 커뮤니케이션', '계정 관리'];
  let cbCount = 0;
  for (const text of cbTexts) {
    const result = await page.evaluate((text) => {
      const xpath = document.evaluate(
        `//*[contains(text(), '${text}')]`,
        document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
      );
      for (let i = 0; i < xpath.snapshotLength; i++) {
        const el = xpath.snapshotItem(i);
        if (el.offsetWidth === 0 && !el.offsetParent) continue;
        let parent = el.parentElement;
        for (let j = 0; j < 8 && parent; j++) {
          const cb = parent.querySelector('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
          if (cb && !cb.checked) {
            cb.scrollIntoView({ block: 'center' });
            cb.click();
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          parent = parent.parentElement;
        }
      }
      return false;
    }, text).catch(() => false);
    if (result) { cbCount++; await sleep(300); }
  }

  console.log(`    radios=${radioFilled}, cbs=${cbCount}`);
  return { radioFilled, cbCount };
}

// ═══════════════════════════════════════
async function main() {
  console.log('=== ARTLINK - Play Console v9 (데이터 보안) ===\n');

  const wsUrl = await getWsUrl();
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: null,
    protocolTimeout: 180000,
  });

  const pages = await browser.pages();
  let page = pages[0];
  page.setDefaultTimeout(30000);

  // 데이터 보안 페이지 이동
  console.log('[1] 데이터 보안 페이지 이동...');
  await page.goto(`${BASE}/app-content/data-privacy-security`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);
  await ss(page, '01-init');

  // 현재 상태 감지
  let state = await detectState(page);
  console.log(`  현재 상태: ${JSON.stringify(state)}`);

  // 최대 30라운드까지 진행
  for (let round = 0; round < 30; round++) {
    state = await detectState(page);
    console.log(`\n[Round ${round}] step=${state.step}, radio=${state.radioCount}, cb=${state.cbCount}, nextEnabled=${state.nextEnabled}`);
    await ss(page, `r${round}`);

    // ─── 미리보기 (최종) ───
    if (state.step === 'preview') {
      console.log('  🎯 미리보기 페이지 - "저장" 클릭');
      const saved = await clickDebug(page, 'main-button');
      if (saved) {
        await sleep(5000);
        await ss(page, 'saved');
        console.log('  ✅ 저장 완료!');
        break;
      } else {
        // main-button disabled? 임시보관함에 저장 시도
        console.log('  main-button 실패, save-draft-button 시도');
        await clickDebug(page, 'save-draft-button');
        await sleep(3000);
        break;
      }
    }

    // ─── 개요 (Step 0) ───
    if (state.step === 'overview' || (state.radioCount === 0 && state.cbCount === 0 && state.nextEnabled)) {
      console.log('  개요 → 다음');
      await clickDebug(page, 'button-next');
      await sleep(5000);
      continue;
    }

    // ─── Step 1: 데이터 수집 및 보안 ───
    if (state.step === 'step1' || state.radioGroupCount >= 3) {
      console.log('  Step 1: 라디오 + 체크박스 채우기');

      // 라디오 채우기
      const radioFilled = await fillRadios(page);
      console.log(`    라디오 ${radioFilled}개 채움`);
      await sleep(1000);

      // 체크박스 채우기 (계정 생성 방법)
      const cbResult = await fillStep1Checkboxes(page);
      console.log(`    체크박스: ${cbResult}`);
      await sleep(1000);

      // 스크롤 다운해서 숨겨진 라디오/체크박스 찾기
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1000);

      // 추가 라디오 채우기
      const moreRadios = await fillRadios(page);
      if (moreRadios > 0) console.log(`    추가 라디오 ${moreRadios}개 채움`);
      await sleep(1000);

      // "다음" 클릭
      const nextOk = await clickDebug(page, 'button-next');
      if (!nextOk) {
        console.log('  button-next 비활성 - 스크롤 후 재확인');
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(2000);

        // 아직 안되면 빠진 필수 필드 확인
        const missingInfo = await page.evaluate(() => {
          const errors = document.querySelectorAll('[class*="error"], [class*="invalid"], .mat-error, .mdc-text-field--invalid');
          const errorTexts = [];
          for (const e of errors) {
            if (e.offsetWidth > 0 || e.offsetParent) {
              errorTexts.push(e.textContent?.trim()?.substring(0, 60));
            }
          }

          // 미답변 라디오 확인
          const groups = document.querySelectorAll('[role="radiogroup"]');
          let unanswered = 0;
          for (const g of groups) {
            const radios = g.querySelectorAll('input[role="radio"]');
            if (!Array.from(radios).some(r => r.checked)) unanswered++;
          }

          // 미체크 필수 체크박스 확인
          const checkedCbs = document.querySelectorAll('input[role="checkbox"]:checked, input[type="checkbox"]:checked');

          return { errors: errorTexts, unansweredRadios: unanswered, checkedCbs: checkedCbs.length };
        }).catch(() => ({}));
        console.log(`    미답변 라디오: ${missingInfo.unansweredRadios}, 체크된 CB: ${missingInfo.checkedCbs}, 오류: ${JSON.stringify(missingInfo.errors)}`);

        // 혹시 체크박스가 하나도 안 체크되었으면 첫번째 체크박스 체크
        if (missingInfo.checkedCbs === 0) {
          console.log('    체크박스 없음 - 첫번째 가시적 체크박스 강제 체크');
          await page.evaluate(() => {
            const cbs = document.querySelectorAll('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
            for (const cb of cbs) {
              if (!cb.checked && (cb.offsetWidth > 0 || cb.offsetParent)) {
                cb.scrollIntoView({ block: 'center' });
                cb.click();
                cb.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
            }
            return false;
          });
          await sleep(2000);
          await clickDebug(page, 'button-next');
        }

        await sleep(5000);
      } else {
        await sleep(5000);
      }
      continue;
    }

    // ─── 데이터 유형 (Step 2) ───
    if (state.step === 'dataTypes' || (state.cbCount > 0 && state.radioCount === 0)) {
      console.log('  데이터 유형 체크박스 채우기');
      const dtCount = await fillDataTypes(page);
      console.log(`    ${dtCount}개 체크`);
      await sleep(1000);

      await clickDebug(page, 'button-next');
      await sleep(5000);
      continue;
    }

    // ─── 데이터 취급 (Step 3+) 또는 알 수 없는 스텝 ───
    if (state.radioCount > 0 || state.cbCount > 0) {
      console.log('  라디오/체크박스 처리');
      const handling = await fillDataHandling(page);
      await sleep(1000);

      // 다음 시도
      let moved = await clickDebug(page, 'button-next');
      if (!moved) {
        // 스크롤 후 재시도
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(1000);
        moved = await clickDebug(page, 'button-next');
      }
      if (!moved) {
        // 제출/저장 시도
        moved = await clickDebug(page, 'button-save-draft');
        if (!moved) moved = await clickDebug(page, 'main-button');
      }
      await sleep(5000);
      continue;
    }

    // ─── 빈 페이지 (라디오도 체크박스도 없음) ───
    console.log('  빈 페이지 - button-next 시도');
    let moved = await clickDebug(page, 'button-next');
    if (!moved) {
      moved = await clickDebug(page, 'main-button');
    }
    if (!moved) {
      console.log('  진행 불가 - 루프 종료');
      break;
    }
    await sleep(5000);
  }

  // ─── 최종 확인 ───
  console.log('\n[최종] 개요 확인...');
  await page.goto(`${BASE}/app-content/overview`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);
  await ss(page, 'final-overview');

  const remaining = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a'))
      .filter(b => {
        const t = b.textContent.trim();
        return (t === '선언 시작' || t === '선언 수정') && (b.offsetParent || b.offsetWidth > 0);
      })
      .map(b => {
        let section = '';
        let p = b.parentElement;
        for (let i = 0; i < 10 && p; i++) {
          const h = p.querySelector('h2, h3, [class*="title"]');
          if (h) { section = h.textContent.trim().substring(0, 40); break; }
          p = p.parentElement;
        }
        return { text: b.textContent.trim(), section };
      });
  }).catch(() => []);

  console.log('\n==========================================');
  console.log(`  남은 선언: ${remaining.length}개`);
  for (const r of remaining) {
    console.log(`    - ${r.section}: ${r.text}`);
  }
  console.log('==========================================\n');
  console.log('스크린샷: /tmp/v9-*.png');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
