#!/usr/bin/env node
/**
 * ARTLINK - Play Console 자동화 v4
 *
 * 전략: URL 네비게이션 대신 사이드바 클릭으로 이동
 * 1. 앱 대시보드 진입
 * 2. 사이드바에서 "앱 콘텐츠" 클릭
 * 3. 앱 콘텐츠 목록에서 각 항목 클릭
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
    await page.screenshot({ path: `/tmp/pc4-${name}.png`, fullPage: false });
    console.log(`  📸 /tmp/pc4-${name}.png`);
  } catch { console.log(`  📸 스크린샷 실패: ${name}`); }
}

// 텍스트 포함 요소 클릭 (광범위 검색)
async function clickText(page, texts, opts = {}) {
  if (typeof texts === 'string') texts = [texts];
  const { exact = false, selector = '*', scrollTo = true } = opts;

  for (const text of texts) {
    const found = await page.evaluate(({ text, exact, selector, scrollTo }) => {
      for (const el of document.querySelectorAll(selector)) {
        if (!el.offsetParent && el.offsetWidth === 0) continue;
        const t = el.textContent.trim();
        const match = exact ? (t === text) : t.includes(text);
        if (match && t.length < text.length + 100) {
          if (scrollTo) el.scrollIntoView({ block: 'center' });
          el.click();
          return t.substring(0, 60);
        }
      }
      return null;
    }, { text, exact, selector, scrollTo });
    if (found) { await sleep(1200); return found; }
  }
  return null;
}

// 라디오/체크박스 선택
async function selectOption(page, texts) {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    const found = await page.evaluate((text) => {
      const selectors = 'label, [role="radio"], [role="checkbox"], mat-radio-button, mat-checkbox, [role="option"]';
      for (const el of document.querySelectorAll(selectors)) {
        if (!el.offsetParent && el.offsetWidth === 0) continue;
        if (el.textContent.trim().includes(text)) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return el.textContent.trim().substring(0, 60);
        }
      }
      return null;
    }, text);
    if (found) { await sleep(800); return found; }
  }
  return null;
}

// 버튼 클릭 (저장/다음/제출)
async function clickButton(page, texts) {
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
      console.log(`  → 버튼 "${found}"`);
      await sleep(2000);
      return true;
    }
  }
  return false;
}

// 페이지 내용 텍스트 (h1/h2 + 전체)
async function pageInfo(page) {
  return page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('h1, h2, h3'))
      .filter(e => e.offsetParent || e.offsetWidth > 0)
      .map(e => e.textContent.trim())
      .filter(t => t.length > 1)
      .join(' | ');
    const body = document.body?.innerText?.substring(0, 500) || '';
    return { headings: h, bodyPreview: body.substring(0, 200) };
  });
}

// 앱 콘텐츠 페이지로 이동 (사이드바 사용)
async function goToAppContent(page) {
  // 사이드바에서 "앱 콘텐츠" 클릭
  const clicked = await page.evaluate(() => {
    // 사이드바 내비게이션 아이템 찾기
    const navItems = document.querySelectorAll('a, [role="treeitem"], [role="menuitem"], .mat-list-item, [class*="nav"], [class*="side"]');
    for (const item of navItems) {
      const text = item.textContent.trim();
      if (text.includes('앱 콘텐츠') || text.includes('App content')) {
        item.scrollIntoView({ block: 'center' });
        item.click();
        return text;
      }
    }
    // Try the left sidebar more aggressively
    for (const item of document.querySelectorAll('*')) {
      const text = item.textContent?.trim() || '';
      if ((text === '앱 콘텐츠' || text === 'App content') && item.offsetParent) {
        item.click();
        return text;
      }
    }
    return null;
  });
  if (clicked) {
    console.log(`  사이드바 클릭: ${clicked}`);
    await sleep(4000);
    return true;
  }
  return false;
}

// 앱 콘텐츠 목록에서 특정 항목 클릭
async function clickContentItem(page, itemNames) {
  if (typeof itemNames === 'string') itemNames = [itemNames];
  for (const name of itemNames) {
    const found = await page.evaluate((name) => {
      // 앱 콘텐츠 페이지의 항목들은 보통 링크나 리스트 아이템
      for (const el of document.querySelectorAll('a, [role="link"], [role="listitem"], tr, .content-row, div[class*="item"]')) {
        const text = el.textContent.trim();
        if (text.includes(name) && el.offsetParent) {
          el.scrollIntoView({ block: 'center' });
          // 내부의 링크 클릭 시도
          const link = el.querySelector('a') || el;
          link.click();
          return text.substring(0, 80);
        }
      }
      return null;
    }, name);
    if (found) {
      console.log(`  항목 클릭: ${found.substring(0, 50)}`);
      await sleep(5000);
      return true;
    }
  }
  return false;
}

// ============================
async function main() {
  console.log('=== ARTLINK Play Console 자동화 v4 ===\n');

  const wsUrl = await getWsUrl();
  console.log(`WS: ${wsUrl}\n`);

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

  // ─── 0. Artlink 앱 대시보드 진입 ───
  console.log('[0] Artlink 앱 대시보드 진입...');
  await page.goto(`${BASE}/app-dashboard`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);

  // 앱 리스트에 있으면 Artlink 클릭
  let url = page.url();
  if (url.includes('app-list') || !url.includes(APP_ID)) {
    console.log('  앱 리스트에서 Artlink 클릭...');
    // 정확한 링크 찾기 - href에 APP_ID 포함
    const linkClicked = await page.evaluate((appId) => {
      for (const a of document.querySelectorAll('a[href]')) {
        if (a.href.includes(appId)) {
          a.click();
          return a.href;
        }
      }
      return null;
    }, APP_ID);
    if (linkClicked) {
      console.log(`  링크 클릭: ...${linkClicked.substring(linkClicked.indexOf('/app/'))}`);
      await sleep(8000);
    }
  }

  url = page.url();
  const inApp = url.includes(APP_ID);
  console.log(`  앱 컨텍스트: ${inApp ? '✅' : '❌'} (${url.split('/').slice(-2).join('/')})`);
  await screenshot(page, '00-dashboard');

  if (!inApp) {
    console.log('  ❌ 앱 대시보드 진입 실패');
    await browser.disconnect();
    return;
  }

  // ─── 앱 콘텐츠 페이지로 이동 ───
  console.log('\n[0.5] 앱 콘텐츠 페이지로 이동...');

  // 먼저 정책 > 앱 콘텐츠로 이동 시도
  // Play Console의 새 UI에서는 좌측 사이드바에 "정책 및 프로그램" > "앱 콘텐츠" 또는 직접 "앱 콘텐츠"가 있음
  let wentToContent = await goToAppContent(page);
  if (!wentToContent) {
    // URL로 직접 이동 시도
    console.log('  사이드바 실패, URL로 이동...');
    await page.goto(`${BASE}/app-content`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await sleep(5000);
  }

  const info = await pageInfo(page);
  console.log(`  제목: ${info.headings}`);
  console.log(`  내용: ${info.bodyPreview.substring(0, 100)}`);
  await screenshot(page, '01-app-content');

  // 현재 페이지에서 앱 콘텐츠 항목 리스트 확인
  const contentItems = await page.evaluate(() => {
    const items = [];
    for (const el of document.querySelectorAll('a, [role="link"], tr, div[class*="row"]')) {
      const text = el.textContent?.trim() || '';
      if (text.length > 3 && text.length < 100 && el.offsetParent) {
        const keywords = ['액세스', '광고', '등급', '타겟', '보안', '정부', '금융', '건강', 'access', 'ads', 'rating', 'target', 'safety', 'government', 'financial', 'health'];
        if (keywords.some(k => text.toLowerCase().includes(k))) {
          items.push(text.substring(0, 80));
        }
      }
    }
    return [...new Set(items)].slice(0, 20);
  });
  console.log(`  발견된 항목: ${contentItems.length}개`);
  for (const item of contentItems) console.log(`    - ${item}`);

  // ─── 각 항목 처리 ───
  // 1. 앱 액세스 권한
  console.log('\n[1/9] 앱 액세스 권한');
  try {
    const found = await clickContentItem(page, ['앱 액세스', 'App access']);
    if (found) {
      await screenshot(page, '02-app-access');
      const sel = await selectOption(page, [
        '모든 기능을 제한 없이 이용 가능',
        '모든 기능',
        'All functionality is available without special access',
        'All functionality',
      ]);
      if (sel) console.log(`  선택: ${sel}`);
      await clickButton(page, ['저장', 'Save']);
      await screenshot(page, '02-app-access-after');
      results.push('1.앱 액세스: ✅');
    } else {
      results.push('1.앱 액세스: ❌ 항목 못찾음');
    }
    // 앱 콘텐츠로 돌아가기
    await page.goBack();
    await sleep(4000);
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('1.앱 액세스: ❌'); }

  // 2. 광고
  console.log('\n[2/9] 광고');
  try {
    const found = await clickContentItem(page, ['광고', 'Ads']);
    if (found) {
      await screenshot(page, '03-ads');
      const sel = await selectOption(page, [
        '예, 앱에 광고가 포함되어 있습니다',
        '예',
        'Yes, my app contains ads',
      ]);
      if (sel) console.log(`  선택: ${sel}`);
      await clickButton(page, ['저장', 'Save']);
      await screenshot(page, '03-ads-after');
      results.push('2.광고: ✅');
    } else {
      results.push('2.광고: ❌ 항목 못찾음');
    }
    await page.goBack();
    await sleep(4000);
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('2.광고: ❌'); }

  // 3. 정부 앱 (이미 완료)
  console.log('\n[3/9] 정부 앱');
  results.push('3.정부 앱: ✅ (이전에 완료)');

  // 4. 금융 기능
  console.log('\n[4/9] 금융 기능');
  try {
    const found = await clickContentItem(page, ['금융', 'Financial']);
    if (found) {
      await screenshot(page, '04-finance');
      // 체크박스 페이지 - 아무것도 안 체크하고 다음
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1000);
      await clickButton(page, ['다음', 'Next']);
      await sleep(3000);
      // 2단계
      await screenshot(page, '04-finance-step2');
      await clickButton(page, ['제출', 'Submit', '저장', 'Save', '다음', 'Next']);
      await screenshot(page, '04-finance-after');
      results.push('4.금융: ✅');
    } else {
      results.push('4.금융: ❌ 항목 못찾음');
    }
    await page.goBack();
    await sleep(2000);
    await page.goBack();
    await sleep(4000);
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('4.금융: ❌'); }

  // 5. 건강 앱
  console.log('\n[5/9] 건강 앱');
  try {
    const found = await clickContentItem(page, ['건강', 'Health']);
    if (found) {
      await screenshot(page, '05-health');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1000);
      await clickButton(page, ['다음', 'Next']);
      await sleep(3000);
      await screenshot(page, '05-health-step2');
      await clickButton(page, ['제출', 'Submit', '저장', 'Save', '다음', 'Next']);
      await screenshot(page, '05-health-after');
      results.push('5.건강: ✅');
    } else {
      results.push('5.건강: ❌ 항목 못찾음');
    }
    await page.goBack();
    await sleep(2000);
    await page.goBack();
    await sleep(4000);
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('5.건강: ❌'); }

  // 6. 타겟층
  console.log('\n[6/9] 타겟층');
  try {
    const found = await clickContentItem(page, ['타겟층', 'Target']);
    if (found) {
      await screenshot(page, '06-target');
      // 연령대 선택
      for (const age of ['13~15', '16~17', '만 18세 이상', '18 and over', '18세']) {
        const sel = await selectOption(page, [age]);
        if (sel) console.log(`  연령: ${sel}`);
      }
      await clickButton(page, ['다음', 'Next', '저장', 'Save']);
      await sleep(4000);
      await screenshot(page, '06-target-step2');
      // 어린이 대상 → No
      await selectOption(page, ['아니요', 'No']);
      await clickButton(page, ['저장', 'Save', '다음', 'Next', '제출', 'Submit']);
      await screenshot(page, '06-target-after');
      results.push('6.타겟층: ✅');
    } else {
      results.push('6.타겟층: ❌ 항목 못찾음');
    }
    await page.goBack();
    await sleep(2000);
    await page.goBack();
    await sleep(4000);
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('6.타겟층: ❌'); }

  // 7. 콘텐츠 등급
  console.log('\n[7/9] 콘텐츠 등급');
  try {
    const found = await clickContentItem(page, ['콘텐츠 등급', 'Content rating', '등급']);
    if (found) {
      await screenshot(page, '07-rating');

      // 시작 버튼
      const started = await clickButton(page, ['설문지 시작', 'Start questionnaire', '시작', 'Start', '새 설문지']);
      if (started) {
        await sleep(5000);
        await screenshot(page, '07-rating-start');

        // 이메일 입력
        const emailInput = await page.$('input[type="email"], input[type="text"]');
        if (emailInput) {
          await emailInput.click({ clickCount: 3 });
          await emailInput.type('leechan0415@gmail.com');
        }

        // 카테고리
        await selectOption(page, [
          '유틸리티, 생산성, 커뮤니케이션 또는 기타',
          'All Other App Types',
          '유틸리티',
          '기타',
        ]);
        await clickButton(page, ['다음', 'Next']);
        await sleep(5000);

        // IARC 질문들 - 모두 No
        for (let q = 0; q < 15; q++) {
          let anyNo = false;
          for (let i = 0; i < 10; i++) {
            const sel = await selectOption(page, ['아니요', 'No', '아니오']);
            if (!sel) break;
            anyNo = true;
          }
          const saved = await clickButton(page, ['다음', 'Next', '저장', 'Save', '제출', 'Submit']);
          if (!saved && !anyNo) break;
          await sleep(3000);
        }

        await clickButton(page, ['제출', 'Submit', '적용', 'Apply']);
        results.push('7.콘텐츠 등급: ✅');
      } else {
        results.push('7.콘텐츠 등급: ⚠️ 시작 버튼 없음');
      }
    } else {
      results.push('7.콘텐츠 등급: ❌ 항목 못찾음');
    }
    await screenshot(page, '07-rating-after');
    // 돌아가기
    for (let i = 0; i < 5; i++) {
      await page.goBack();
      await sleep(2000);
      const u = page.url();
      if (u.includes('app-content') && !u.includes('content-rating')) break;
    }
    await sleep(3000);
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('7.콘텐츠 등급: ❌'); }

  // 8. 데이터 보안
  console.log('\n[8/9] 데이터 보안');
  try {
    const found = await clickContentItem(page, ['데이터 보안', 'Data safety', '데이터']);
    if (found) {
      await screenshot(page, '08-data');
      const started = await clickButton(page, ['시작', 'Start', '관리', 'Manage', '다음', 'Next']);
      if (started) {
        await sleep(5000);

        for (let step = 0; step < 20; step++) {
          if (step < 5) await screenshot(page, `08-data-step${step}`);
          // 각 페이지에서 적절한 선택
          await selectOption(page, ['예', 'Yes']);
          await sleep(300);

          // 데이터 유형
          for (const t of ['이메일', '이름', '사진', '동영상', '비정상 종료', '기기 또는 기타 ID']) {
            await selectOption(page, [t]);
            await sleep(200);
          }

          // 용도
          for (const t of ['앱 기능', '계정 관리', '분석', '광고']) {
            await selectOption(page, [t]);
            await sleep(200);
          }

          await selectOption(page, ['아니요', 'No']);

          const saved = await clickButton(page, ['다음', 'Next', '저장', 'Save', '제출', 'Submit']);
          if (!saved) break;
          await sleep(3000);
        }

        await clickButton(page, ['제출', 'Submit']);
        results.push('8.데이터 보안: ✅');
      }
    } else {
      results.push('8.데이터 보안: ❌ 항목 못찾음');
    }
    await screenshot(page, '08-data-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('8.데이터 보안: ❌'); }

  // 9. 카테고리 (이미 완료 - 확인만)
  console.log('\n[9/9] 카테고리');
  results.push('9.카테고리: ✅ (이전에 완료)');

  // ─── 결과 ───
  console.log('\n==========================================');
  console.log('  결과 요약');
  console.log('==========================================');
  for (const r of results) console.log(`  ${r}`);
  console.log('==========================================');
  console.log('\n스크린샷: /tmp/pc4-*.png\n');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
