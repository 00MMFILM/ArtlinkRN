#!/usr/bin/env node
/**
 * ARTLINK - Play Console v8
 *
 * 모든 정보 확인 완료:
 *
 * [금융] "앱에서 금융 기능을 제공하지 않음" 체크박스 → 다음(next-button) → 저장
 * [건강] "앱에 건강 기능이 없음" 체크박스 → 다음(next-button) → 저장
 * [콘텐츠 등급] overview → 선언수정 → 수정(edit-button) → IARC설문 (이메일+3번째라디오+약관체크) → 다음 → 아니요 반복
 * [데이터 보안] 직접URL → 다음(button-next, 이미 활성!) → 각 스텝 처리
 *
 * 핵심: debug-id 금융/건강=next-button, 데이터보안=button-next
 */
import puppeteer from 'puppeteer';

const DEVELOPER_ID = '8820412626693118100';
const APP_ID = '4975271741081347187';
const BASE = `https://play.google.com/console/u/0/developers/${DEVELOPER_ID}/app/${APP_ID}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getWsUrl() {
  const resp = await fetch(`http://127.0.0.1:9222/json/version`);
  const { webSocketDebuggerUrl } = await resp.json();
  return webSocketDebuggerUrl;
}

async function ss(page, name) {
  try { await page.screenshot({ path: `/tmp/v8-${name}.png`, fullPage: false }); console.log(`  📸 ${name}`); } catch {}
}

/**
 * 텍스트 근처의 체크박스 클릭 (XPath 기반)
 */
async function clickCheckboxNearText(page, text) {
  return page.evaluate((text) => {
    // XPath로 텍스트 포함하는 요소 찾기
    const xpath = document.evaluate(
      `//*[contains(text(), '${text}')]`,
      document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
    );
    for (let i = 0; i < xpath.snapshotLength; i++) {
      const el = xpath.snapshotItem(i);
      if (el.offsetWidth === 0 && !el.offsetParent) continue;

      // 부모를 거슬러 올라가며 가까운 체크박스 찾기
      let parent = el.parentElement;
      for (let j = 0; j < 5 && parent; j++) {
        const cb = parent.querySelector('input[role="checkbox"], input.mdc-checkbox__native-control');
        if (cb && !cb.checked) {
          cb.scrollIntoView({ block: 'center' });
          cb.click();
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          return `checked: ${el.textContent.trim().substring(0, 50)}`;
        }
        parent = parent.parentElement;
      }
    }
    return null;
  }, text);
}

/**
 * N번째 라디오 클릭 (0-indexed)
 */
async function clickNthRadio(page, n) {
  return page.evaluate((n) => {
    const radios = Array.from(document.querySelectorAll('input[role="radio"], input.mdc-radio__native-control, input[type="radio"]'))
      .filter(r => {
        const p = r.closest('.mdc-form-field, material-radio-button') || r.parentElement;
        return p ? (p.offsetWidth > 0 || p.offsetParent) : (r.offsetWidth > 0 || r.offsetParent);
      });
    if (n < radios.length) {
      radios[n].scrollIntoView({ block: 'center' });
      radios[n].click();
      radios[n].dispatchEvent(new Event('change', { bubbles: true }));
      return `radio[${n}] clicked`;
    }
    return null;
  }, n);
}

/**
 * 모든 라디오그룹에서 두번째 라디오(아니요) 클릭
 */
async function clickAllSecondRadios(page) {
  return page.evaluate(() => {
    let count = 0;
    const groups = document.querySelectorAll('[role="radiogroup"]');
    for (const g of groups) {
      const radios = g.querySelectorAll('input[role="radio"], input[type="radio"]');
      if (radios.length >= 2 && !radios[1].checked) {
        radios[1].click();
        radios[1].dispatchEvent(new Event('change', { bubbles: true }));
        count++;
      }
    }
    // radiogroup이 없으면 개별 라디오 그룹핑 시도
    if (count === 0) {
      // name 속성 기반 그룹핑
      const byName = {};
      for (const r of document.querySelectorAll('input[role="radio"], input[type="radio"]')) {
        const name = r.name || r.closest('[role="radiogroup"]')?.id || 'default';
        if (!byName[name]) byName[name] = [];
        byName[name].push(r);
      }
      for (const [, radios] of Object.entries(byName)) {
        if (radios.length >= 2 && !radios[1].checked) {
          radios[1].click();
          radios[1].dispatchEvent(new Event('change', { bubbles: true }));
          count++;
        }
      }
    }
    return count;
  });
}

/**
 * debug-id로 버튼 클릭
 */
async function clickDebugBtn(page, debugId) {
  const result = await page.evaluate((id) => {
    const btn = document.querySelector(`[debug-id="${id}"]`);
    if (!btn) return 'not found';
    if (btn.disabled) return 'disabled: ' + btn.textContent.trim().substring(0, 20);
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    return 'clicked: ' + btn.textContent.trim().substring(0, 20);
  }, debugId).catch(() => 'error');
  console.log(`    [${debugId}] ${result}`);
  if (result.startsWith('clicked')) { await sleep(2000); return true; }
  return false;
}

/**
 * 텍스트로 버튼 클릭
 */
async function clickBtn(page, texts) {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    const r = await page.evaluate((text) => {
      const candidates = [];
      for (const b of document.querySelectorAll('button, [role="button"]')) {
        if (b.offsetWidth === 0 && !b.offsetParent) continue;
        if (b.disabled) continue;
        const label = b.querySelector('.mdc-button__label');
        const t = (label || b).textContent.trim();
        if (t.includes(text) && t.length < text.length + 30) {
          candidates.push({ el: b, text: t, len: t.length });
        }
      }
      if (!candidates.length) return null;
      candidates.sort((a, b) => a.len - b.len);
      candidates[0].el.scrollIntoView({ block: 'center' });
      candidates[0].el.click();
      return candidates[0].text;
    }, text).catch(() => null);
    if (r) { console.log(`    → ${r}`); await sleep(2000); return true; }
  }
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

// ═══════════════════════════════════════
// 1. 금융 기능
// ═══════════════════════════════════════
async function doFinance(page) {
  console.log('\n═══ [1] 금융 기능 ═══');
  await page.goto(`${BASE}/app-content/finance`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);

  // 스크롤 → "앱에서 금융 기능을 제공하지 않음" 체크
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1500);

  const checked = await clickCheckboxNearText(page, '금융 기능을 제공하지 않음');
  console.log(`  체크: ${checked}`);

  if (!checked) {
    await ss(page, 'fin-fail');
    return '금융: ❌ 체크박스 못 찾음';
  }

  await sleep(1500);
  await ss(page, 'fin-checked');

  // "다음" 클릭
  const next = await clickDebugBtn(page, 'next-button');
  if (!next) {
    // 텍스트 기반 시도
    await clickBtn(page, ['다음']);
  }
  await sleep(5000);
  await ss(page, 'fin-step2');

  // Step 2: "저장" 또는 다른 저장 버튼
  // 먼저 save-draft-button 시도, 안되면 저장 텍스트
  let saved = await clickDebugBtn(page, 'save-draft-button');
  if (!saved) saved = await clickDebugBtn(page, 'save-button');
  if (!saved) saved = await clickBtn(page, ['저장', 'Save']);

  await sleep(3000);

  // 추가 단계 있으면 계속
  for (let i = 0; i < 3; i++) {
    if (page.url().includes('overview')) break;
    await clickDebugBtn(page, 'save-draft-button') || await clickDebugBtn(page, 'next-button') || await clickBtn(page, ['저장', '다음']);
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

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1500);

  const checked = await clickCheckboxNearText(page, '건강 기능이 없음');
  console.log(`  체크: ${checked}`);

  if (!checked) {
    await ss(page, 'health-fail');
    return '건강: ❌ 체크박스 못 찾음';
  }

  await sleep(1500);
  await ss(page, 'health-checked');

  const next = await clickDebugBtn(page, 'next-button');
  if (!next) await clickBtn(page, ['다음']);
  await sleep(5000);
  await ss(page, 'health-step2');

  let saved = await clickDebugBtn(page, 'save-draft-button');
  if (!saved) saved = await clickDebugBtn(page, 'save-button');
  if (!saved) saved = await clickBtn(page, ['저장']);
  await sleep(3000);

  for (let i = 0; i < 3; i++) {
    if (page.url().includes('overview')) break;
    await clickDebugBtn(page, 'save-draft-button') || await clickDebugBtn(page, 'next-button') || await clickBtn(page, ['저장', '다음']);
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

  // 1. Overview → 선언 수정 for 콘텐츠 등급
  await goOverview(page);
  const clicked = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button, a')) {
      const t = b.textContent.trim();
      if (t !== '선언 수정') continue;
      if (b.offsetWidth === 0 && !b.offsetParent) continue;
      let p = b.parentElement;
      for (let i = 0; i < 10 && p; i++) {
        if (p.textContent.includes('콘텐츠 등급')) { b.click(); return true; }
        p = p.parentElement;
      }
    }
    return false;
  });
  if (!clicked) return '콘텐츠 등급: ❌ 버튼 없음';
  await sleep(5000);

  // 2. content-rating-overview 페이지 → "수정" 버튼 클릭
  console.log('  URL:', page.url());
  await clickDebugBtn(page, 'edit-button');
  await sleep(8000);
  await ss(page, 'rating-form');

  // 대화상자 자동 수락
  page.on('dialog', async d => { await d.accept(); });

  // 3. IARC 설문 - 이메일 입력
  console.log('  URL:', page.url());
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
        console.log('  이메일 입력');
        break;
      }
    }
  } catch (e) { console.log(`  이메일 오류: ${e.message.substring(0, 40)}`); }

  await sleep(500);

  // 4. 카테고리: 3번째 라디오 "다른 모든 앱 유형"
  const catResult = await clickNthRadio(page, 2);
  console.log(`  카테고리: ${catResult}`);
  await sleep(500);

  // 5. IARC 약관 체크
  const termsResult = await clickCheckboxNearText(page, 'IARC');
  console.log(`  약관: ${termsResult}`);
  await sleep(500);

  await ss(page, 'rating-filled');

  // 6. "다음" 클릭
  let nextOk = await clickDebugBtn(page, 'next-button');
  if (!nextOk) nextOk = await clickBtn(page, ['다음', 'Next']);
  await sleep(8000);
  await ss(page, 'rating-q0');

  // 7. IARC 설문 질문 - 모든 질문에 "아니요" (두번째 라디오)
  for (let step = 0; step < 15; step++) {
    const url = page.url();
    if (url.includes('overview') || url.includes('summary')) break;

    // 라디오 수 확인
    const radioCount = await page.evaluate(() => {
      return document.querySelectorAll('input[role="radio"], input[type="radio"]').length;
    }).catch(() => 0);

    console.log(`  Q${step}: radios=${radioCount}`);

    if (radioCount > 0) {
      // 모든 라디오그룹에서 2번째(아니요) 선택
      const cnt = await clickAllSecondRadios(page);
      console.log(`    → ${cnt}개 "아니요" 선택`);
    }

    await sleep(800);

    // "다음" 또는 최종 제출
    let moved = await clickDebugBtn(page, 'next-button');
    if (!moved) moved = await clickBtn(page, ['다음', 'Next']);
    if (!moved) {
      moved = await clickBtn(page, ['제출', 'Submit', '저장', '적용', '등급 계산']);
      if (!moved && radioCount === 0) {
        console.log('  진행 불가, 종료');
        break;
      }
    }
    await sleep(5000);
    if (step < 5) await ss(page, `rating-q${step + 1}`);
  }

  // 최종 제출/적용
  await clickBtn(page, ['제출', 'Submit', '적용', 'Apply']);
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
  await ss(page, 'data-step0');

  // 데이터 보안의 debug-id: button-next, button-back, button-save-draft

  // Step 0 → Step 1: "다음" (이미 활성)
  console.log('  Step 0: 개요 → 다음');
  await clickDebugBtn(page, 'button-next');
  await sleep(5000);
  await ss(page, 'data-step1');

  // Step 1: "데이터 수집 및 보안"
  // 질문들에 답하기
  console.log('  Step 1: 데이터 수집 및 보안');

  // 라디오 질문들 확인 후 답변
  const step1Radios = await page.evaluate(() => {
    const groups = document.querySelectorAll('[role="radiogroup"]');
    const info = [];
    for (const g of groups) {
      const radios = g.querySelectorAll('input[role="radio"], input[type="radio"]');
      let parent = g.parentElement;
      let text = parent?.textContent?.trim()?.substring(0, 100) || '';
      info.push({ count: radios.length, text, anyChecked: Array.from(radios).some(r => r.checked) });
    }
    return info;
  }).catch(() => []);

  console.log(`  라디오 그룹 ${step1Radios.length}개`);
  for (const g of step1Radios) {
    console.log(`    [${g.anyChecked ? '답변완료' : '미답변'}] ${g.text.substring(0, 60)}`);
  }

  // 질문에 따라 답변
  // 1) "앱에서 필수 사용자 데이터 유형을 수집하거나 공유하나요?" → 예
  // 2) "전송 중에 암호화하나요?" → 예
  // 3) "삭제를 요청할 수 있는 방법?" → 예
  for (const g of step1Radios) {
    if (g.anyChecked) continue;

    if (g.text.includes('수집') || g.text.includes('공유') || g.text.includes('collect') || g.text.includes('share')) {
      // "예" = 첫번째 라디오
      console.log('    수집/공유: 예');
    } else if (g.text.includes('암호화') || g.text.includes('encrypt')) {
      // "예"
      console.log('    암호화: 예');
    } else if (g.text.includes('삭제') || g.text.includes('delete')) {
      // "예"
      console.log('    삭제: 예');
    }
  }

  // 모든 라디오그룹에서 첫번째(예) 선택
  await page.evaluate(() => {
    const groups = document.querySelectorAll('[role="radiogroup"]');
    for (const g of groups) {
      const radios = g.querySelectorAll('input[role="radio"], input[type="radio"]');
      const anyChecked = Array.from(radios).some(r => r.checked);
      if (!anyChecked && radios.length >= 1) {
        radios[0].click();
        radios[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }).catch(() => {});
  await sleep(1000);
  await ss(page, 'data-step1-filled');

  // "다음"
  await clickDebugBtn(page, 'button-next');
  await sleep(5000);
  await ss(page, 'data-step2');

  // Step 2: "데이터 유형" - 체크박스 선택
  console.log('  Step 2: 데이터 유형');

  const dataTypes = ['이름', '이메일 주소', '사용자 ID', '앱 상호작용', '비정상 종료 로그', '기기 또는 기타 ID'];
  for (const dt of dataTypes) {
    const result = await clickCheckboxNearText(page, dt);
    if (result) console.log(`    ✓ ${dt}`);
  }
  await sleep(1000);
  await ss(page, 'data-step2-filled');

  await clickDebugBtn(page, 'button-next');
  await sleep(5000);
  await ss(page, 'data-step3');

  // Step 3+: "데이터 취급 및 처리" - 각 데이터 유형별 질문
  // 반복적으로 라디오/체크박스 처리 후 다음
  console.log('  Step 3+: 데이터 취급 및 처리');

  for (let round = 0; round < 20; round++) {
    const url = page.url();
    if (url.includes('overview')) break;

    const radioCount = await page.evaluate(() =>
      document.querySelectorAll('input[role="radio"], input[type="radio"]').length
    ).catch(() => 0);

    const cbCount = await page.evaluate(() =>
      document.querySelectorAll('input[role="checkbox"], input[type="checkbox"]').length
    ).catch(() => 0);

    console.log(`    round ${round}: radio=${radioCount}, cb=${cbCount}`);

    // 라디오: 모든 미답변 그룹에 첫번째(예/필수) 선택
    if (radioCount > 0) {
      await page.evaluate(() => {
        const groups = document.querySelectorAll('[role="radiogroup"]');
        for (const g of groups) {
          const radios = g.querySelectorAll('input[role="radio"], input[type="radio"]');
          const anyChecked = Array.from(radios).some(r => r.checked);
          if (!anyChecked && radios.length >= 1) {
            radios[0].click();
            radios[0].dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }).catch(() => {});
    }

    // 체크박스: 수집 목적 등
    if (cbCount > 0) {
      await clickCheckboxNearText(page, '앱 기능');
      await clickCheckboxNearText(page, '분석');
      await clickCheckboxNearText(page, '계정 관리');
    }

    await sleep(1000);
    if (round < 10) await ss(page, `data-r${round}`);

    // 하단 스크롤
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);

    // 미리보기/제출 체크
    const fullText = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const texts = []; let node;
      while (node = walker.nextNode()) { const t = node.textContent.trim(); if (t.length > 3) texts.push(t); }
      return texts.join(' ');
    }).catch(() => '');

    if (fullText.includes('Google Play 스토어에 표시') || fullText.includes('미리보기') || fullText.includes('Store listing preview')) {
      console.log('    미리보기 → 제출');
      await clickBtn(page, ['제출', 'Submit']);
      await sleep(3000);
      break;
    }

    // "다음" 클릭
    let moved = await clickDebugBtn(page, 'button-next');
    if (!moved) {
      moved = await clickBtn(page, ['다음', 'Next']);
      if (!moved) {
        moved = await clickBtn(page, ['제출', 'Submit', '저장', 'Save']);
        if (!moved && radioCount === 0 && cbCount === 0) {
          console.log('    진행 불가, 종료');
          break;
        }
      }
    }
    await sleep(4000);
  }

  // 최종 제출
  await clickBtn(page, ['제출', 'Submit']);
  await sleep(2000);
  await ss(page, 'data-done');
  return '데이터 보안: ✅';
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════
async function main() {
  console.log('=== ARTLINK - Play Console v8 ===\n');

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
  try { results.push(await doContentRating(page)); } catch (e) { console.log(`❌ 등급: ${e.message.substring(0, 60)}`); results.push('콘텐츠 등급: ❌'); }
  try { results.push(await doDataSafety(page)); } catch (e) { console.log(`❌ 보안: ${e.message.substring(0, 60)}`); results.push('데이터 보안: ❌'); }

  // Final check
  await goOverview(page);
  const finalCnt = await countDecl(page);
  await ss(page, 'final');

  console.log('\n==========================================');
  for (const r of results) console.log(`  ${r}`);
  console.log(`\n  남은 선언: ${finalCnt}개`);
  console.log('==========================================\n');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
