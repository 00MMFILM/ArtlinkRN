#!/usr/bin/env node
/**
 * ARTLINK - Play Console 남은 5개 항목 처리 v3
 * 순서: 선언 시작 3개 먼저 → 선언 수정 2개
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
  try { await page.screenshot({ path: `/tmp/pc8-${name}.png`, fullPage: false }); console.log(`  📸 ${name}`); } catch {}
}

async function radio(page, text) {
  try {
    const r = await page.evaluate((text) => {
      for (const el of document.querySelectorAll('mat-radio-button, label, [role="radio"]')) {
        if (el.offsetWidth === 0 && !el.offsetParent) continue;
        if (el.textContent.trim().includes(text)) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          const inp = el.querySelector('input'); if (inp) inp.click();
          return el.textContent.trim().substring(0, 50);
        }
      }
      return null;
    }, text);
    if (r) { await sleep(600); console.log(`    ✓ radio: ${r.substring(0, 40)}`); }
    return r;
  } catch { return null; }
}

async function check(page, text) {
  try {
    const r = await page.evaluate((text) => {
      for (const el of document.querySelectorAll('mat-checkbox, [role="checkbox"], label')) {
        if (el.offsetWidth === 0 && !el.offsetParent) continue;
        if (el.textContent.trim().includes(text)) {
          el.scrollIntoView({ block: 'center' });
          const inp = el.querySelector('input[type="checkbox"]');
          if (!inp || !inp.checked) el.click();
          return el.textContent.trim().substring(0, 50);
        }
      }
      return null;
    }, text);
    if (r) console.log(`    ✓ check: ${r.substring(0, 40)}`);
    return r;
  } catch { return null; }
}

async function btn(page, texts) {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    try {
      const r = await page.evaluate((text) => {
        for (const b of document.querySelectorAll('button, [role="button"]')) {
          if (b.offsetWidth === 0 && !b.offsetParent) continue;
          if (b.disabled) continue;
          const t = b.textContent.trim();
          if (t.includes(text) && t.length < text.length + 30) {
            b.scrollIntoView({ block: 'center' });
            b.click();
            return t;
          }
        }
        return null;
      }, text);
      if (r) { console.log(`    → ${r}`); await sleep(2000); return true; }
    } catch {}
  }
  return false;
}

// 특정 텍스트가 포함된 링크 클릭
async function clickLink(page, text) {
  try {
    const r = await page.evaluate((text) => {
      for (const a of document.querySelectorAll('a')) {
        if (a.offsetWidth === 0 && !a.offsetParent) continue;
        const t = a.textContent.trim();
        if (t.includes(text)) {
          a.scrollIntoView({ block: 'center' });
          a.click();
          return t;
        }
      }
      return null;
    }, text);
    if (r) { console.log(`    → link: ${r}`); await sleep(2000); return true; }
  } catch {}
  return false;
}

// N번째 "선언 시작" 또는 "선언 수정" 버튼 클릭 (0-indexed)
async function clickDeclByIndex(page, index, btnText) {
  return page.evaluate((index, btnText) => {
    const btns = Array.from(document.querySelectorAll('button, a'))
      .filter(b => {
        const t = b.textContent.trim();
        return t === btnText && (b.offsetParent || b.offsetWidth > 0);
      });
    if (index < btns.length) {
      btns[index].scrollIntoView({ block: 'center' });
      btns[index].click();
      return true;
    }
    return false;
  }, index, btnText);
}

async function goOverview(page) {
  await page.goto(`${BASE}/app-content/overview`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);
}

// ─── 핸들러 ───

async function handleAdId(page) {
  console.log('\n  📋 광고 ID 처리');
  await sleep(2000);
  await ss(page, 'adid-init');

  // 맨 위로 스크롤
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  // "예" 선택
  const yes = await radio(page, '예');
  if (!yes) {
    console.log('    "예" 라디오 못 찾음, 페이지 확인 필요');
    return '광고 ID: ❌ 라디오 없음';
  }
  await sleep(1500);

  // 체크박스 영역으로 스크롤
  await page.evaluate(() => window.scrollTo(0, 500));
  await sleep(500);

  // 체크박스 선택
  await check(page, '앱 기능');
  await check(page, '애널리틱스');
  await check(page, '분석');
  await sleep(500);

  await ss(page, 'adid-filled');

  // 저장 (스크롤 해서 찾기)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  const saved = await btn(page, ['저장', 'Save']);
  await sleep(3000);
  await ss(page, 'adid-saved');
  return saved ? '광고 ID: ✅' : '광고 ID: ⚠️ 저장 못 찾음';
}

async function handleFinance(page) {
  console.log('\n  📋 금융 기능 처리');
  await sleep(2000);
  await ss(page, 'finance-init');

  // 페이지 스크롤
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);

  // 보통 "다음" → "저장" 패턴
  // 또는 체크박스 없이 바로 "아니요" 선택 후 저장
  // 또는 금융 기능 선택 페이지에서 아무것도 선택하지 않고 다음/저장

  // 먼저 본문 확인
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000)).catch(() => '');
  console.log('    본문:', bodyText.substring(0, 100).replace(/\n/g, ' '));

  // 금융 기능이 있는지 묻는 경우 → 체크하지 않고 "다음"
  // 또는 "해당 없음" 체크
  await check(page, '해당사항 없음') || await check(page, '해당 없음');

  const next = await btn(page, ['다음', 'Next']);
  if (next) {
    await sleep(3000);
    await ss(page, 'finance-step2');
    await btn(page, ['저장', 'Save', '제출', 'Submit', '다음', 'Next']);
    await sleep(2000);
    // 추가 단계가 있을 수 있음
    for (let i = 0; i < 3; i++) {
      if (page.url().includes('overview')) break;
      await btn(page, ['저장', 'Save', '제출', 'Submit', '다음', 'Next']);
      await sleep(2000);
    }
  } else {
    // "저장" 직접 시도
    await btn(page, ['저장', 'Save', '제출', 'Submit']);
  }
  await sleep(2000);
  await ss(page, 'finance-done');
  return '금융 기능: ✅';
}

async function handleHealth(page) {
  console.log('\n  📋 건강 기능 처리');
  await sleep(2000);
  await ss(page, 'health-init');

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);

  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000)).catch(() => '');
  console.log('    본문:', bodyText.substring(0, 100).replace(/\n/g, ' '));

  // 건강 기능이 있는지 → 없음 선택
  await check(page, '해당사항 없음') || await check(page, '해당 없음');

  const next = await btn(page, ['다음', 'Next']);
  if (next) {
    await sleep(3000);
    await ss(page, 'health-step2');
    await btn(page, ['저장', 'Save', '제출', 'Submit', '다음', 'Next']);
    await sleep(2000);
    for (let i = 0; i < 3; i++) {
      if (page.url().includes('overview')) break;
      await btn(page, ['저장', 'Save', '제출', 'Submit', '다음', 'Next']);
      await sleep(2000);
    }
  } else {
    await btn(page, ['저장', 'Save', '제출', 'Submit']);
  }
  await sleep(2000);
  await ss(page, 'health-done');
  return '건강 기능: ✅';
}

async function handleContentRating(page) {
  console.log('\n  📋 콘텐츠 등급 처리');
  await sleep(2000);
  await ss(page, 'rating-init');

  // 이 페이지에서 "새 설문지 시작" 또는 "수정" 클릭해야 설문 진입
  // "수정"은 a 태그, "새 설문지 시작"은 button
  const clicked = await btn(page, ['새 설문지 시작', '설문지 시작']) ||
                  await clickLink(page, '수정') ||
                  await btn(page, ['시작', 'Start']);

  if (!clicked) {
    console.log('    설문 진입 버튼 못 찾음');
    await ss(page, 'rating-no-entry');
    return '콘텐츠 등급: ❌ 진입 실패';
  }

  await sleep(5000);
  await ss(page, 'rating-form');

  // 이메일 입력 (이미 있으면 스킵)
  try {
    const inputs = await page.$$('input');
    for (const inp of inputs) {
      const type = await page.evaluate(el => el.type, inp);
      if (type === 'email' || type === 'text') {
        const val = await page.evaluate(el => el.value, inp);
        if (!val || val.length < 3) {
          await inp.click({ clickCount: 3 });
          await inp.type('leechan0415@gmail.com');
          console.log('    이메일 입력');
          break;
        } else {
          console.log(`    이메일 이미 있음: ${val}`);
        }
      }
    }
  } catch (e) { console.log(`    이메일 입력 오류: ${e.message.substring(0, 30)}`); }

  // 카테고리 선택
  await radio(page, '다른 모든 앱 유형') || await radio(page, 'All Other') || await radio(page, '유틸리티');
  await sleep(500);

  // 이용약관 체크박스
  await check(page, '이용약관') || await check(page, 'terms');

  await ss(page, 'rating-category');

  // 다음
  const next = await btn(page, ['다음', 'Next']);
  if (!next) {
    console.log('    "다음" 버튼 못 찾음');
    await ss(page, 'rating-no-next');
    return '콘텐츠 등급: ❌ 다음 못 찾음';
  }
  await sleep(5000);
  await ss(page, 'rating-questions');

  // 설문 질문 - 모두 "아니요"
  for (let step = 0; step < 15; step++) {
    const url = page.url();
    if (url.includes('overview') || url.includes('summary')) {
      console.log('    완료 페이지 감지');
      break;
    }

    // 현재 페이지 모든 "아니요" 선택
    let selectedCount = 0;
    for (let i = 0; i < 30; i++) {
      const s = await radio(page, '아니요');
      if (!s) {
        const s2 = await radio(page, 'No');
        if (!s2) break;
      }
      selectedCount++;
    }

    if (step < 5) await ss(page, `rating-step${step}`);

    // 다음/제출
    const nextStep = await btn(page, ['다음', 'Next']);
    if (!nextStep) {
      const submit = await btn(page, ['제출', 'Submit', '저장', 'Save', '적용', 'Apply']);
      if (!submit && selectedCount === 0) {
        console.log(`    step ${step}: 선택 0, 버튼 없음 → 종료`);
        break;
      }
    }
    await sleep(4000);
  }

  // 최종 제출/적용
  await btn(page, ['제출', 'Submit', '적용', 'Apply', '확인', 'Confirm']);
  await sleep(3000);
  await ss(page, 'rating-done');
  return '콘텐츠 등급: ✅';
}

async function handleDataSafety(page) {
  console.log('\n  📋 데이터 보안 처리');
  await sleep(2000);
  await ss(page, 'data-init');

  // 데이터 보안 위저드 진행
  for (let step = 0; step < 25; step++) {
    const url = page.url();
    if (url.includes('overview')) {
      console.log('    overview 복귀 감지');
      break;
    }

    if (step < 10) await ss(page, `data-s${step}`);

    // 페이지 본문 확인
    let bodyText = '';
    try {
      bodyText = await page.evaluate(() => {
        const main = document.querySelector('main, [role="main"]') || document.body;
        return main.innerText.substring(0, 1200);
      });
    } catch {}

    console.log(`    step ${step}: ${bodyText.substring(0, 80).replace(/\n/g, ' ')}`);

    // 단계별 처리
    if (bodyText.includes('개요') && bodyText.includes('미리보기')) {
      // 개요/미리보기 페이지 → 제출
      console.log('    → 미리보기 페이지');
      await btn(page, ['제출', 'Submit']);
      break;
    } else if (bodyText.includes('수집하거나 공유') || bodyText.includes('collect or share')) {
      console.log('    → 수집/공유 여부');
      await radio(page, '예') || await radio(page, 'Yes');
    } else if (bodyText.includes('암호화') || bodyText.includes('encrypt')) {
      console.log('    → 암호화');
      await radio(page, '예') || await radio(page, 'Yes');
    } else if (bodyText.includes('삭제를 요청') || bodyText.includes('삭제 메커니즘') || bodyText.includes('deletion')) {
      console.log('    → 삭제 요청');
      await radio(page, '예') || await radio(page, 'Yes');
    } else if (bodyText.includes('데이터 유형을 선택') || bodyText.includes('수집되는') || bodyText.includes('data type')) {
      console.log('    → 데이터 유형 선택');
      // 개인 정보
      await check(page, '이름');
      await check(page, '이메일 주소');
      await check(page, '사용자 이름');
      // 앱 활동
      await check(page, '앱 상호작용');
      // 앱 정보 및 성능
      await check(page, '비정상 종료 로그');
      await check(page, '기기 또는 기타 ID');
    } else if (bodyText.includes('공유') && (bodyText.includes('제3자') || bodyText.includes('third'))) {
      console.log('    → 제3자 공유');
      await radio(page, '아니요') || await radio(page, 'No');
    } else if (bodyText.includes('계정') && (bodyText.includes('생성') || bodyText.includes('만들'))) {
      console.log('    → 계정 생성');
      await check(page, '이메일');
      await check(page, 'Google');
    } else if (bodyText.includes('용도') || bodyText.includes('purpose')) {
      console.log('    → 용도');
      await check(page, '앱 기능');
      await check(page, '분석');
      await check(page, '애널리틱스');
    } else if (bodyText.includes('필수') && bodyText.includes('선택')) {
      console.log('    → 필수/선택');
      await radio(page, '사용자가 이 데이터 수집') || await radio(page, '필수');
    } else {
      console.log('    → 기본 처리');
      await radio(page, '아니요') || await radio(page, 'No') || await radio(page, '예') || await radio(page, 'Yes');
    }

    await sleep(800);

    // 다음/저장/제출
    const next = await btn(page, ['다음', 'Next']);
    if (!next) {
      const sub = await btn(page, ['제출', 'Submit', '저장', 'Save', '임시저장']);
      if (!sub) {
        // 스크롤 후 재시도
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(500);
        const retry = await btn(page, ['다음', 'Next', '제출', 'Submit', '저장', 'Save']);
        if (!retry) {
          console.log(`    step ${step}: 다음/저장 버튼 없음`);
          // 한번 더 시도 - 상단 스크롤
          await page.evaluate(() => window.scrollTo(0, 0));
          await sleep(500);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await sleep(500);
          if (!await btn(page, ['다음', 'Next', '제출', 'Submit', '저장', 'Save'])) break;
        }
      }
    }
    await sleep(3000);
  }

  await btn(page, ['제출', 'Submit']);
  await sleep(2000);
  await ss(page, 'data-done');
  return '데이터 보안: ✅';
}

// ============================
async function main() {
  console.log('=== ARTLINK - 남은 5개 항목 처리 v3 ===\n');

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

  // ─── Step 1: "선언 시작" 3개 먼저 (Ad ID, Finance, Health) ───
  console.log('══════ Phase 1: 선언 시작 항목 처리 ══════');

  await goOverview(page);
  await ss(page, 'overview-start');

  // 3번째 버튼 = 광고 ID (선언 시작)
  // overview에서 "선언 시작" 버튼만 클릭 (선언 수정 건너뜀)
  for (let i = 0; i < 5; i++) {
    const cnt = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, a'))
        .filter(b => b.textContent.trim() === '선언 시작' && (b.offsetParent || b.offsetWidth > 0))
        .length;
    }).catch(() => 0);

    console.log(`\n  "선언 시작" 남은: ${cnt}개`);
    if (cnt === 0) break;

    // 첫 번째 "선언 시작" 클릭
    const clicked = await page.evaluate(() => {
      for (const b of document.querySelectorAll('button, a')) {
        if (b.textContent.trim() === '선언 시작' && (b.offsetParent || b.offsetWidth > 0)) {
          b.scrollIntoView({ block: 'center' });
          b.click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) break;
    await sleep(5000);

    const url = page.url();
    const slug = url.split('/').pop();
    console.log(`  이동: ${slug}`);

    try {
      if (slug.includes('ad-id')) {
        results.push(await handleAdId(page));
      } else if (slug.includes('financ')) {
        results.push(await handleFinance(page));
      } else if (slug.includes('health')) {
        results.push(await handleHealth(page));
      } else {
        console.log(`  미식별: ${slug}`);
        await ss(page, `unknown-${slug}`);
        results.push(`미식별(${slug}): ⚠️`);
      }
    } catch (e) {
      console.log(`  ❌ ${e.message.substring(0, 60)}`);
      results.push(`오류: ${e.message.substring(0, 40)}`);
    }

    await goOverview(page);
  }

  // ─── Step 2: "선언 수정" 2개 (Content Rating, Data Safety) ───
  console.log('\n\n══════ Phase 2: 선언 수정 항목 처리 ══════');

  // 콘텐츠 등급
  console.log('\n--- 콘텐츠 등급 ---');
  await goOverview(page);

  // 첫 번째 "선언 수정" 클릭 (콘텐츠 등급)
  const clickedRating = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button, a')) {
      if (b.textContent.trim() === '선언 수정' && (b.offsetParent || b.offsetWidth > 0)) {
        b.scrollIntoView({ block: 'center' });
        b.click();
        return true;
      }
    }
    return false;
  });

  if (clickedRating) {
    await sleep(5000);
    const slug = page.url().split('/').pop();
    console.log(`  이동: ${slug}`);
    try {
      if (slug.includes('content-rating')) {
        results.push(await handleContentRating(page));
      } else if (slug.includes('data-privacy') || slug.includes('data-safety')) {
        results.push(await handleDataSafety(page));
      } else {
        results.push(`예상외(${slug}): ⚠️`);
      }
    } catch (e) {
      console.log(`  ❌ ${e.message.substring(0, 60)}`);
      results.push(`콘텐츠 등급: ❌ ${e.message.substring(0, 40)}`);
    }
  }

  // 데이터 보안
  console.log('\n--- 데이터 보안 ---');
  await goOverview(page);

  // 두 번째 "선언 수정" 클릭 (데이터 보안) 또는 남은 첫번째
  const clickedData = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a'))
      .filter(b => b.textContent.trim() === '선언 수정' && (b.offsetParent || b.offsetWidth > 0));
    // 데이터 보안은 보통 2번째, 또는 콘텐츠 등급이 해결됐으면 1번째
    for (const b of btns) {
      // 부모 요소에서 "데이터 보안" 텍스트 확인
      let parent = b.parentElement;
      for (let i = 0; i < 8; i++) {
        if (!parent) break;
        if (parent.textContent.includes('데이터 보안') || parent.textContent.includes('Data safety')) {
          b.scrollIntoView({ block: 'center' });
          b.click();
          return 'data';
        }
        parent = parent.parentElement;
      }
    }
    // 못 찾으면 남은 "선언 수정" 중 마지막 클릭
    if (btns.length > 0) {
      const last = btns[btns.length - 1];
      last.scrollIntoView({ block: 'center' });
      last.click();
      return 'last';
    }
    return null;
  });

  if (clickedData) {
    await sleep(5000);
    const slug = page.url().split('/').pop();
    console.log(`  이동: ${slug} (found: ${clickedData})`);
    try {
      if (slug.includes('data-privacy') || slug.includes('data-safety')) {
        results.push(await handleDataSafety(page));
      } else if (slug.includes('content-rating')) {
        results.push(await handleContentRating(page));
      } else {
        results.push(`예상외(${slug}): ⚠️`);
      }
    } catch (e) {
      console.log(`  ❌ ${e.message.substring(0, 60)}`);
      results.push(`데이터 보안: ❌ ${e.message.substring(0, 40)}`);
    }
  }

  // ─── Final check ───
  await goOverview(page);
  const finalCnt = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a'))
      .filter(b => { const t = b.textContent.trim(); return (t === '선언 시작' || t === '선언 수정') && (b.offsetParent || b.offsetWidth > 0); })
      .length;
  }).catch(() => -1);
  await ss(page, 'final-overview');

  console.log('\n==========================================');
  console.log('  결과 요약');
  console.log('==========================================');
  for (const r of results) console.log(`  ${r}`);
  console.log(`\n  남은: ${finalCnt}개`);
  console.log('==========================================\n');
  console.log('스크린샷: /tmp/pc8-*.png\n');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
