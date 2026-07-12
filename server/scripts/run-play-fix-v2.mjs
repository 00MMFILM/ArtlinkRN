#!/usr/bin/env node
/**
 * ARTLINK - Play Console 남은 항목 직접 처리 v2
 * overview에서 "선언 시작/선언 수정" 버튼을 순차 클릭하여 처리
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
  try { await page.screenshot({ path: `/tmp/pc7-${name}.png`, fullPage: false }); console.log(`  📸 ${name}`); } catch {}
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
    if (r) { await sleep(600); console.log(`    ✓ ${r}`); }
    return r;
  } catch { return null; }
}

async function check(page, text) {
  try {
    return await page.evaluate((text) => {
      for (const el of document.querySelectorAll('mat-checkbox, label[class*="check"], [role="checkbox"]')) {
        if (el.offsetWidth === 0 && !el.offsetParent) continue;
        if (el.textContent.trim().includes(text)) {
          el.scrollIntoView({ block: 'center' });
          // 체크 안 됐으면 클릭
          const inp = el.querySelector('input[type="checkbox"]');
          if (!inp || !inp.checked) el.click();
          return true;
        }
      }
      return false;
    }, text);
  } catch { return false; }
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

// overview에서 첫 번째 "선언 시작" 또는 "선언 수정" 클릭
async function clickFirstDecl(page) {
  return page.evaluate(() => {
    for (const b of document.querySelectorAll('button, a')) {
      const t = b.textContent.trim();
      if ((t === '선언 시작' || t === '선언 수정') && (b.offsetParent || b.offsetWidth > 0)) {
        b.scrollIntoView({ block: 'center' });
        b.click();
        return t;
      }
    }
    return null;
  });
}

async function countDecl(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a'))
      .filter(b => { const t = b.textContent.trim(); return (t === '선언 시작' || t === '선언 수정') && (b.offsetParent || b.offsetWidth > 0); })
      .length;
  }).catch(() => -1);
}

async function goOverview(page) {
  await page.goto(`${BASE}/app-content/overview`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(4000);
}

// ─── 페이지별 핸들러 ───
async function handleAds(page) {
  console.log('  📋 광고');
  await radio(page, '예, 앱에 광고가 있습니다') || await radio(page, '예');
  await btn(page, ['저장', 'Save']);
  return '광고: ✅';
}

async function handleAdId(page) {
  console.log('  📋 광고 ID');
  // 스크롤해서 전체 확인
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  // "예" 선택
  await radio(page, '예');
  await sleep(1000);

  // 스크롤 다운해서 체크박스 확인
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);

  // 용도 체크
  const c1 = await check(page, '앱 기능');
  const c2 = await check(page, '애널리틱스');
  console.log(`    체크: 앱 기능=${!!c1}, 애널리틱스=${!!c2}`);
  await sleep(500);

  await ss(page, 'adid-filled');

  // 저장 버튼 (페이지 하단)
  const saved = await btn(page, ['저장', 'Save']);
  if (!saved) {
    // 스크롤 후 재시도
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
    await btn(page, ['저장', 'Save']);
  }
  await sleep(2000);
  await ss(page, 'adid-saved');
  return '광고 ID: ✅';
}

async function handleAccess(page) {
  console.log('  📋 앱 액세스');
  await radio(page, '액세스 제한 없이') || await radio(page, '모든 기능');
  await btn(page, ['저장', 'Save']);
  return '앱 액세스: ✅';
}

async function handleRating(page) {
  console.log('  📋 콘텐츠 등급');

  // 시작 또는 계속
  const startBtn = await btn(page, ['설문지 시작', '시작', 'Start']);
  if (startBtn) await sleep(5000);

  await ss(page, 'rating-form');

  // 이메일 입력
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
        }
      }
    }
  } catch {}

  // 카테고리: "다른 모든 앱 유형"
  await radio(page, '다른 모든 앱 유형') || await radio(page, 'All Other') || await radio(page, '기타');

  // 이용약관
  await check(page, '이용약관') || await check(page, 'terms');

  await ss(page, 'rating-cat');

  // 다음
  await btn(page, ['다음', 'Next']);
  await sleep(5000);

  // 설문 진행 - 모두 아니요
  for (let step = 0; step < 12; step++) {
    const url = page.url();
    if (url.includes('overview')) break;

    // 모든 "아니요" 선택
    let count = 0;
    for (let i = 0; i < 25; i++) {
      const s = await radio(page, '아니요');
      if (!s) { const s2 = await radio(page, 'No'); if (!s2) break; }
      count++;
    }

    if (step < 4) await ss(page, `rating-q${step}`);

    const next = await btn(page, ['다음', 'Next']);
    if (!next) {
      const sub = await btn(page, ['제출', 'Submit', '저장', 'Save', '적용', 'Apply']);
      if (!sub && count === 0) break;
    }
    await sleep(4000);
  }

  await btn(page, ['제출', 'Submit', '적용', 'Apply']);
  await ss(page, 'rating-done');
  return '콘텐츠 등급: ✅';
}

async function handleTarget(page) {
  console.log('  📋 타겟층');
  await check(page, '만 18세 이상') || await check(page, '18세') || await check(page, '18 and over');
  await btn(page, ['다음', 'Next']);
  await sleep(3000);
  await radio(page, '아니요') || await radio(page, 'No');
  await btn(page, ['다음', 'Next', '저장', 'Save', '제출', 'Submit']);
  await sleep(2000);
  // 추가 단계
  for (let i = 0; i < 3; i++) {
    if (page.url().includes('overview')) break;
    await radio(page, '아니요') || await radio(page, 'No');
    if (!await btn(page, ['다음', 'Next', '저장', 'Save', '제출', 'Submit'])) break;
    await sleep(2000);
  }
  return '타겟층: ✅';
}

async function handleData(page) {
  console.log('  📋 데이터 보안');

  for (let step = 0; step < 25; step++) {
    if (page.url().includes('overview')) break;

    if (step < 8) await ss(page, `data-s${step}`);

    // 본문 텍스트로 현재 단계 판별
    let bodyText = '';
    try {
      bodyText = await page.evaluate(() => document.body.innerText.substring(0, 800));
    } catch {}

    if (bodyText.includes('수집하거나 공유')) {
      await radio(page, '예') || await radio(page, 'Yes');
    } else if (bodyText.includes('암호화')) {
      await radio(page, '예') || await radio(page, 'Yes');
    } else if (bodyText.includes('삭제를 요청') || bodyText.includes('삭제 메커니즘')) {
      await radio(page, '예') || await radio(page, 'Yes');
    } else if (bodyText.includes('데이터 유형을 선택') || bodyText.includes('수집되는 사용자 데이터')) {
      await check(page, '이름');
      await check(page, '이메일 주소');
      await check(page, '사용자 이름');
      await check(page, '비정상 종료 로그');
      await check(page, '기기 또는 기타 ID');
      await check(page, '앱 상호작용');
    } else if (bodyText.includes('계정 생성') || bodyText.includes('계정을 만들')) {
      await check(page, '이메일');
      await check(page, 'Google');
      await check(page, '사용자 이름');
    } else if (bodyText.includes('미리보기')) {
      await btn(page, ['제출', 'Submit']);
      break;
    } else if (bodyText.includes('공유') && bodyText.includes('제3자')) {
      await radio(page, '아니요') || await radio(page, 'No');
    } else {
      // 기본: 라디오가 있으면 아니요, 없으면 다음
      await radio(page, '아니요') || await radio(page, 'No') || await radio(page, '예') || await radio(page, 'Yes');
    }

    await sleep(800);

    const next = await btn(page, ['다음', 'Next']);
    if (!next) {
      const sub = await btn(page, ['제출', 'Submit', '저장', 'Save', '임시저장']);
      if (!sub) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(500);
        if (!await btn(page, ['다음', 'Next', '제출', 'Submit', '저장', 'Save'])) break;
      }
    }
    await sleep(3000);
  }

  await btn(page, ['제출', 'Submit']);
  await ss(page, 'data-done');
  return '데이터 보안: ✅';
}

async function handleFinance(page) {
  console.log('  📋 금융');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  await btn(page, ['다음', 'Next']);
  await sleep(3000);
  await btn(page, ['제출', 'Submit', '저장', 'Save', '다음', 'Next']);
  await sleep(2000);
  await btn(page, ['제출', 'Submit', '저장', 'Save']);
  return '금융: ✅';
}

async function handleHealth(page) {
  console.log('  📋 건강');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  await btn(page, ['다음', 'Next']);
  await sleep(3000);
  await btn(page, ['제출', 'Submit', '저장', 'Save', '다음', 'Next']);
  await sleep(2000);
  await btn(page, ['제출', 'Submit', '저장', 'Save']);
  return '건강: ✅';
}

async function handleGov(page) {
  console.log('  📋 정부 앱');
  await radio(page, '아니요') || await radio(page, 'No');
  await btn(page, ['저장', 'Save', '제출', 'Submit']);
  return '정부 앱: ✅';
}

async function handlePage(page) {
  const url = page.url();
  const slug = url.split('/').pop();
  console.log(`  URL: .../${slug}`);

  if (slug.includes('ads-declaration')) return handleAds(page);
  if (slug.includes('ad-id')) return handleAdId(page);
  if (slug.includes('testing-credentials') || slug.includes('app-access')) return handleAccess(page);
  if (slug.includes('content-rating')) return handleRating(page);
  if (slug.includes('target-audience')) return handleTarget(page);
  if (slug.includes('data-privacy') || slug.includes('data-safety')) return handleData(page);
  if (slug.includes('financ')) return handleFinance(page);
  if (slug.includes('health')) return handleHealth(page);
  if (slug.includes('gov')) return handleGov(page);

  // 본문으로 추가 판별
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300)).catch(() => '');
  if (bodyText.includes('광고 ID')) return handleAdId(page);
  if (bodyText.includes('광고')) return handleAds(page);
  if (bodyText.includes('액세스 권한')) return handleAccess(page);
  if (bodyText.includes('콘텐츠 등급')) return handleRating(page);
  if (bodyText.includes('타겟')) return handleTarget(page);
  if (bodyText.includes('데이터') && bodyText.includes('보안')) return handleData(page);

  console.log(`  ⚠️ 미식별: ${slug}`);
  await ss(page, `unknown-${slug}`);
  return `미식별(${slug}): ⚠️`;
}

// ============================
async function main() {
  console.log('=== ARTLINK - 남은 항목 처리 v2 ===\n');

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
  const seenUrls = new Set();
  let sameCount = 0;

  await goOverview(page);
  console.log('✅ overview 진입\n');

  for (let round = 1; round <= 12; round++) {
    const cnt = await countDecl(page);
    console.log(`\n[${round}] 남은: ${cnt}개`);
    if (cnt <= 0) { console.log('✅ 모든 선언 완료!'); break; }

    const clickType = await clickFirstDecl(page);
    if (!clickType) { console.log('❌ 클릭 실패'); break; }
    console.log(`  클릭: ${clickType}`);
    await sleep(5000);

    const url = page.url();
    if (seenUrls.has(url)) {
      sameCount++;
      if (sameCount >= 2) {
        console.log(`  ⚠️ 반복 URL, 스킵 (${url.split('/').pop()})`);
        results.push(`${url.split('/').pop()}: ⚠️ 반복`);
        await goOverview(page);
        if (sameCount >= 3) break;
        continue;
      }
    } else {
      sameCount = 0;
      seenUrls.add(url);
    }

    try {
      const result = await handlePage(page);
      results.push(result);
      console.log(`  결과: ${result}`);
    } catch (e) {
      console.log(`  ❌ ${e.message.substring(0, 60)}`);
      results.push(`오류: ${e.message.substring(0, 40)}`);
    }

    await goOverview(page);
  }

  const finalCnt = await countDecl(page);
  await ss(page, 'final');

  console.log('\n==========================================');
  for (const r of results) console.log(`  ${r}`);
  console.log(`\n  남은: ${finalCnt}개`);
  console.log('==========================================\n');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
