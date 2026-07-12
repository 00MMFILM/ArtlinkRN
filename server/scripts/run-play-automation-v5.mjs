#!/usr/bin/env node
/**
 * ARTLINK - Play Console 자동화 v5
 *
 * 전략: app-content/overview에서 "선언 시작" 버튼을 순서대로 클릭
 * - 각 페이지를 URL로 식별하고, 적절한 폼 작성 후 저장
 * - overview로 돌아와서 다음 버튼 클릭
 */
import puppeteer from 'puppeteer';

const DEVELOPER_ID = '8820412626693118100';
const APP_ID = '4975271741081347187';
const BASE = `https://play.google.com/console/u/0/developers/${DEVELOPER_ID}/app/${APP_ID}`;
const DEBUG_PORT = 9222;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getWsUrl() {
  const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  const data = await resp.json();
  return data.webSocketDebuggerUrl;
}

async function screenshot(page, name) {
  try {
    await page.screenshot({ path: `/tmp/pc5-${name}.png`, fullPage: false });
    console.log(`  📸 ${name}`);
  } catch { console.log(`  📸 실패: ${name}`); }
}

// 라디오/체크박스 선택
async function selectRadio(page, text) {
  const found = await page.evaluate((text) => {
    // mat-radio-button, label, role=radio 등 검색
    const selectors = 'mat-radio-button, label, [role="radio"], [role="checkbox"], mat-checkbox, [role="option"]';
    for (const el of document.querySelectorAll(selectors)) {
      if (!el.offsetParent && el.offsetWidth === 0) continue;
      const t = el.textContent.trim();
      if (t.includes(text)) {
        el.scrollIntoView({ block: 'center' });
        el.click();
        // 내부의 input도 클릭
        const input = el.querySelector('input[type="radio"], input[type="checkbox"]');
        if (input) input.click();
        return t.substring(0, 60);
      }
    }
    return null;
  }, text);
  if (found) {
    await sleep(800);
    console.log(`    ✓ 선택: ${found.substring(0, 50)}`);
  }
  return found;
}

// 체크박스 선택 (여러 개)
async function selectCheckbox(page, text) {
  return selectRadio(page, text); // 같은 로직
}

// 버튼 클릭
async function clickBtn(page, texts) {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    const found = await page.evaluate((text) => {
      for (const btn of document.querySelectorAll('button, [role="button"], a.mdc-button')) {
        if (!btn.offsetParent && btn.offsetWidth === 0) continue;
        if (btn.disabled) continue;
        const t = btn.textContent.trim();
        if (t.includes(text) && t.length < text.length + 30) {
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return t;
        }
      }
      return null;
    }, text);
    if (found) {
      console.log(`    → ${found}`);
      await sleep(2500);
      return true;
    }
  }
  return false;
}

// 입력 필드에 텍스트 입력
async function typeInInput(page, selector, text) {
  const input = await page.$(selector);
  if (input) {
    await input.click({ clickCount: 3 });
    await input.type(text);
    console.log(`    입력: ${text}`);
    return true;
  }
  return false;
}

// overview 페이지의 "선언 시작" 버튼 수 확인
async function countDeclButtons(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a'))
      .filter(b => b.textContent.trim() === '선언 시작').length;
  });
}

// 첫 번째 "선언 시작" 버튼 클릭
async function clickFirstDeclButton(page) {
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a'))
      .filter(b => b.textContent.trim() === '선언 시작');
    if (btns.length > 0) {
      btns[0].scrollIntoView({ block: 'center' });
      btns[0].click();
      return btns.length;
    }
    return 0;
  });
  if (clicked > 0) {
    await sleep(5000);
    return true;
  }
  return false;
}

// overview로 돌아가기
async function goToOverview(page) {
  await page.goto(`${BASE}/app-content/overview`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(4000);
  // 스크롤로 모든 항목 로드
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      window.scrollBy(0, 300);
      await new Promise(r => setTimeout(r, 200));
    }
    window.scrollTo(0, 0);
  });
  await sleep(1000);
}

// ─── 페이지별 핸들러 ───

async function handleAds(page) {
  console.log('  📋 광고 페이지');
  // "예, 앱에 광고가 있습니다" 선택
  await selectRadio(page, '예, 앱에 광고가 있습니다') ||
    await selectRadio(page, '예') ||
    await selectRadio(page, 'Yes');
  await screenshot(page, 'ads-selected');
  await clickBtn(page, ['저장', 'Save']);
  return '광고: ✅';
}

async function handleAppAccess(page) {
  console.log('  📋 앱 액세스 권한 페이지');
  // "액세스 제한 없이 앱의 모든 기능을 사용할 수 있음" 선택
  await selectRadio(page, '액세스 제한 없이') ||
    await selectRadio(page, '모든 기능을 사용할 수 있음') ||
    await selectRadio(page, '모든 기능을 제한 없이') ||
    await selectRadio(page, 'All functionality is available') ||
    await selectRadio(page, 'All functionality');
  await screenshot(page, 'access-selected');
  await clickBtn(page, ['저장', 'Save']);
  return '앱 액세스: ✅';
}

async function handleContentRating(page) {
  console.log('  📋 콘텐츠 등급 페이지');

  // 1. 시작 버튼 클릭
  const started = await clickBtn(page, ['설문지 시작', 'Start questionnaire', '시작', 'Start', '새 설문지']);
  if (!started) {
    // 이미 완료됐을 수 있음
    await screenshot(page, 'rating-nostart');
    return '콘텐츠 등급: ⚠️ 시작 버튼 없음';
  }
  await sleep(5000);
  await screenshot(page, 'rating-start');

  // 2. 이메일 입력
  await typeInInput(page, 'input[type="email"]', 'leechan0415@gmail.com');
  if (!await typeInInput(page, 'input[type="email"]', 'leechan0415@gmail.com')) {
    // text input 시도
    const inputs = await page.$$('input[type="text"]');
    for (const input of inputs) {
      const val = await page.evaluate(el => el.value, input);
      if (!val) {
        await input.click({ clickCount: 3 });
        await input.type('leechan0415@gmail.com');
        console.log('    이메일 입력 (text)');
        break;
      }
    }
  }

  // 3. 카테고리 선택 (유틸리티/기타)
  await selectRadio(page, '유틸리티, 생산성, 커뮤니케이션 또는 기타') ||
    await selectRadio(page, 'All Other App Types') ||
    await selectRadio(page, '유틸리티') ||
    await selectRadio(page, '기타');

  await clickBtn(page, ['다음', 'Next']);
  await sleep(5000);
  await screenshot(page, 'rating-q1');

  // 4. IARC 질문들 - 모두 "아니요" 선택하고 다음
  for (let step = 0; step < 15; step++) {
    // 페이지에서 모든 "아니요" 라디오 선택
    let anySelected = false;
    for (let i = 0; i < 20; i++) {
      const sel = await selectRadio(page, '아니요');
      if (!sel) {
        const sel2 = await selectRadio(page, 'No');
        if (!sel2) break;
      }
      anySelected = true;
    }

    // 다음/저장/제출 클릭
    const saved = await clickBtn(page, ['다음', 'Next']);
    if (!saved) {
      const submitted = await clickBtn(page, ['제출', 'Submit', '저장', 'Save', '적용', 'Apply']);
      if (!submitted && !anySelected) break;
    }
    await sleep(3000);
    if (step < 5) await screenshot(page, `rating-step${step}`);

    // URL 확인 - overview로 돌아왔으면 종료
    if (page.url().includes('overview')) break;
  }

  // 최종 제출
  await clickBtn(page, ['제출', 'Submit', '적용', 'Apply']);
  await screenshot(page, 'rating-done');
  return '콘텐츠 등급: ✅';
}

async function handleTargetAudience(page) {
  console.log('  📋 타겟층 페이지');

  // 연령대 선택 - 만 18세 이상만
  // 먼저 모든 체크된 연령을 해제하고 18세 이상만 선택
  await selectCheckbox(page, '만 18세 이상') ||
    await selectCheckbox(page, '18세') ||
    await selectCheckbox(page, '18 and over');

  await screenshot(page, 'target-age');
  await clickBtn(page, ['다음', 'Next']);
  await sleep(4000);
  await screenshot(page, 'target-step2');

  // 어린이 대상 → 아니요
  await selectRadio(page, '아니요') ||
    await selectRadio(page, 'No');

  await clickBtn(page, ['다음', 'Next', '저장', 'Save', '제출', 'Submit']);
  await sleep(3000);

  // 추가 단계가 있을 수 있음
  for (let i = 0; i < 5; i++) {
    const url = page.url();
    if (url.includes('overview')) break;
    await selectRadio(page, '아니요') || await selectRadio(page, 'No');
    const saved = await clickBtn(page, ['다음', 'Next', '저장', 'Save', '제출', 'Submit']);
    if (!saved) break;
    await sleep(3000);
  }

  await screenshot(page, 'target-done');
  return '타겟층: ✅';
}

async function handleDataSafety(page) {
  console.log('  📋 데이터 보안 페이지');

  // 1. 개요/시작
  await clickBtn(page, ['다음', 'Next', '시작', 'Start']);
  await sleep(4000);
  await screenshot(page, 'data-step1');

  // 데이터 수집/공유 - 단계별 진행
  for (let step = 0; step < 30; step++) {
    const url = page.url();
    if (url.includes('overview')) break;

    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));

    // 데이터를 수집하거나 공유하나요?
    if (bodyText.includes('수집하거나 공유') || bodyText.includes('collect or share')) {
      // Artlink: 이메일 로그인, 비정상 종료 로그 수집
      await selectRadio(page, '예') || await selectRadio(page, 'Yes');
    }
    // 암호화되어 전송되나요?
    else if (bodyText.includes('암호화') || bodyText.includes('encrypt')) {
      await selectRadio(page, '예') || await selectRadio(page, 'Yes');
    }
    // 데이터 삭제를 요청할 수 있나요?
    else if (bodyText.includes('삭제를 요청') || bodyText.includes('request deletion')) {
      await selectRadio(page, '예') || await selectRadio(page, 'Yes');
    }
    // 아이 대상?
    else if (bodyText.includes('어린이') || bodyText.includes('children')) {
      await selectRadio(page, '아니요') || await selectRadio(page, 'No');
    }
    // 데이터 유형 선택 페이지
    else if (bodyText.includes('데이터 유형') || bodyText.includes('data type')) {
      // 필요한 데이터 유형 체크
      await selectCheckbox(page, '이메일 주소');
      await selectCheckbox(page, '이름');
      await selectCheckbox(page, '비정상 종료 로그');
      await selectCheckbox(page, '기기 또는 기타 ID');
    }
    // 데이터 용도
    else if (bodyText.includes('용도') || bodyText.includes('purpose')) {
      await selectCheckbox(page, '앱 기능');
      await selectCheckbox(page, '분석');
    }
    // 기본: 아니요 선택
    else {
      await selectRadio(page, '아니요') || await selectRadio(page, 'No');
    }

    // 다음/저장/제출
    const saved = await clickBtn(page, ['다음', 'Next']);
    if (!saved) {
      const submitted = await clickBtn(page, ['제출', 'Submit', '저장', 'Save']);
      if (!submitted) break;
    }
    await sleep(3000);
    if (step < 6) await screenshot(page, `data-step${step + 2}`);
  }

  await clickBtn(page, ['제출', 'Submit']);
  await screenshot(page, 'data-done');
  return '데이터 보안: ✅';
}

async function handleFinance(page) {
  console.log('  📋 금융 기능 페이지');
  // 체크박스 페이지 - 아무것도 체크 안 함 (Artlink은 금융 앱 아님)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);
  await screenshot(page, 'finance');
  await clickBtn(page, ['다음', 'Next']);
  await sleep(4000);
  // 2단계
  await screenshot(page, 'finance-step2');
  await clickBtn(page, ['제출', 'Submit', '저장', 'Save', '다음', 'Next']);
  await sleep(3000);
  // 3단계 (있을 수 있음)
  await clickBtn(page, ['제출', 'Submit', '저장', 'Save']);
  await screenshot(page, 'finance-done');
  return '금융 기능: ✅';
}

async function handleHealth(page) {
  console.log('  📋 건강 앱 페이지');
  // 건강 관련 체크 없음
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);
  await screenshot(page, 'health');
  await clickBtn(page, ['다음', 'Next']);
  await sleep(4000);
  await screenshot(page, 'health-step2');
  await clickBtn(page, ['제출', 'Submit', '저장', 'Save', '다음', 'Next']);
  await sleep(3000);
  await clickBtn(page, ['제출', 'Submit', '저장', 'Save']);
  await screenshot(page, 'health-done');
  return '건강 앱: ✅';
}

async function handleGovernment(page) {
  console.log('  📋 정부 앱 페이지');
  // "아니요" 선택
  await selectRadio(page, '아니요') ||
    await selectRadio(page, 'No') ||
    await selectRadio(page, '정부 기관에서 운영하지 않');
  await screenshot(page, 'gov');
  await clickBtn(page, ['저장', 'Save', '제출', 'Submit']);
  return '정부 앱: ✅';
}

// URL 기반으로 페이지 타입 판별 및 처리
async function handlePage(page) {
  const url = page.url();
  console.log(`  URL: ...${url.split('/').slice(-2).join('/')}`);

  if (url.includes('ads')) return handleAds(page);
  if (url.includes('app-access') || url.includes('testing-credentials')) return handleAppAccess(page);
  if (url.includes('content-rating') || url.includes('rating')) return handleContentRating(page);
  if (url.includes('target-audience') || url.includes('target')) return handleTargetAudience(page);
  if (url.includes('data-safety') || url.includes('data-privacy') || url.includes('data-declaration')) return handleDataSafety(page);
  if (url.includes('financ')) return handleFinance(page);
  if (url.includes('health')) return handleHealth(page);
  if (url.includes('government') || url.includes('gov')) return handleGovernment(page);

  // 알 수 없는 페이지 - 본문 텍스트로 추가 판별
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  if (bodyText.includes('광고')) return handleAds(page);
  if (bodyText.includes('액세스 권한') || bodyText.includes('액세스 제한')) return handleAppAccess(page);
  if (bodyText.includes('콘텐츠 등급') || bodyText.includes('IARC')) return handleContentRating(page);
  if (bodyText.includes('타겟') || bodyText.includes('연령')) return handleTargetAudience(page);
  if (bodyText.includes('데이터') && bodyText.includes('수집')) return handleDataSafety(page);
  if (bodyText.includes('금융')) return handleFinance(page);
  if (bodyText.includes('건강')) return handleHealth(page);
  if (bodyText.includes('정부')) return handleGovernment(page);

  console.log('  ⚠️ 알 수 없는 페이지');
  await screenshot(page, `unknown-${url.split('/').pop()}`);
  return `알 수 없음(${url.split('/').pop()}): ⚠️`;
}

// ============================
async function main() {
  console.log('=== ARTLINK Play Console 자동화 v5 ===');
  console.log('전략: app-content/overview → 선언 시작 순차 클릭\n');

  const wsUrl = await getWsUrl();
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: null,
    protocolTimeout: 120000,
  });

  const pages = await browser.pages();
  let page = pages[0];
  if (!page) page = await browser.newPage();
  page.setDefaultTimeout(30000);

  const results = [];

  // ─── 0. app-content/overview로 이동 ───
  console.log('[0] app-content/overview 이동...');
  await goToOverview(page);

  let url = page.url();
  if (!url.includes('app-content')) {
    console.log('❌ app-content 진입 실패');
    await browser.disconnect();
    return;
  }
  console.log('✅ app-content/overview 진입\n');

  // ─── 선언 시작 버튼 순차 처리 ───
  let round = 0;
  const MAX_ROUNDS = 12;
  let lastUrl = '';
  let sameUrlCount = 0;

  while (round < MAX_ROUNDS) {
    round++;
    const btnCount = await countDeclButtons(page);
    console.log(`\n[라운드 ${round}] 남은 "선언 시작" 버튼: ${btnCount}개`);

    if (btnCount === 0) {
      console.log('✅ 모든 선언 완료!');
      break;
    }

    // 첫 번째 버튼 클릭
    const clicked = await clickFirstDeclButton(page);
    if (!clicked) {
      console.log('❌ 버튼 클릭 실패');
      break;
    }

    // 같은 URL 반복 감지
    const currentUrl = page.url();
    if (currentUrl === lastUrl) {
      sameUrlCount++;
      if (sameUrlCount >= 2) {
        console.log(`  ⚠️ 같은 URL 반복 (${sameUrlCount}회), 스킵`);
        results.push(`${currentUrl.split('/').pop()}: ⚠️ 스킵(반복)`);
        await goToOverview(page);
        // 남은 버튼이 같은 URL만 가리키면 종료
        if (sameUrlCount >= 3) break;
        await sleep(2000);
        continue;
      }
    } else {
      sameUrlCount = 0;
    }
    lastUrl = currentUrl;

    // 페이지 처리
    try {
      const result = await handlePage(page);
      results.push(result);
      console.log(`  결과: ${result}`);
    } catch (e) {
      console.log(`  ❌ 오류: ${e.message}`);
      results.push(`오류: ${e.message.substring(0, 40)}`);
    }

    // overview로 돌아가기
    console.log('  ← overview로 복귀...');
    await goToOverview(page);
    await sleep(2000);
  }

  // ─── 최종 스크린샷 ───
  await screenshot(page, 'final');

  // ─── 결과 ───
  console.log('\n==========================================');
  console.log('  결과 요약');
  console.log('==========================================');
  for (const r of results) console.log(`  ${r}`);

  const remaining = await countDeclButtons(page);
  console.log(`\n  남은 선언: ${remaining}개`);
  console.log('==========================================');
  console.log('\n스크린샷: /tmp/pc5-*.png\n');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
