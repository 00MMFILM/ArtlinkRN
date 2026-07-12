#!/usr/bin/env node
/**
 * ARTLINK - Play Console 자동화 v3
 *
 * 전략:
 * 1. 먼저 작동하는 URL (main-store-listing)로 앱 컨텍스트 진입
 * 2. 앱 컨텍스트 안에서 SPA 내부 네비게이션 사용
 * 3. page.goto 대신 location.assign 사용 (SPA 라우터 트리거)
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
  await page.screenshot({ path: `/tmp/pc3-${name}.png`, fullPage: false });
  console.log(`  📸 /tmp/pc3-${name}.png`);
}

// 앱 컨텍스트 내에서 페이지 이동 (SPA 네비게이션)
async function navigateInApp(page, path) {
  const targetUrl = `${BASE}/${path}`;

  // SPA 내부 네비게이션 - location.assign 사용
  await page.evaluate((url) => {
    window.location.assign(url);
  }, targetUrl);

  // 페이지 로드 대기
  await sleep(5000);

  // networkidle 대기
  try {
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 15000 });
  } catch {}

  const currentUrl = page.url();
  const success = currentUrl.includes(APP_ID);
  console.log(`  URL: ${currentUrl.split('/').pop()}`);
  return success;
}

// 텍스트로 요소 클릭
async function clickByText(page, texts, selector = 'button, [role="button"], a') {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    const found = await page.evaluate((text, selector) => {
      for (const el of document.querySelectorAll(selector)) {
        const t = el.textContent.trim();
        if (t.includes(text) && el.offsetParent !== null) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return text;
        }
      }
      return null;
    }, text, selector);
    if (found) { await sleep(1500); return found; }
  }
  return null;
}

// 라디오/체크박스 선택
async function selectOption(page, texts) {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    const found = await page.evaluate((text) => {
      // role 기반 셀렉터
      const selectors = '[role="radio"], [role="checkbox"], label, mat-radio-button, mat-checkbox, [role="option"]';
      for (const el of document.querySelectorAll(selectors)) {
        const t = el.textContent.trim();
        if (t.includes(text) && el.offsetParent !== null) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return text;
        }
      }
      // TextWalker fallback
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (walker.currentNode.textContent.includes(text)) {
          let target = walker.currentNode.parentElement;
          const clickable = target.closest('[role="radio"], [role="checkbox"], [role="option"], label, button') || target;
          if (clickable.offsetParent !== null) {
            clickable.scrollIntoView({ block: 'center' });
            clickable.click();
            return text;
          }
        }
      }
      return null;
    }, text);
    if (found) { await sleep(800); return found; }
  }
  return null;
}

// 저장/다음 버튼 클릭
async function clickSave(page) {
  const texts = ['저장', 'Save', '다음', 'Next', '제출', 'Submit'];
  for (const text of texts) {
    const found = await page.evaluate((text) => {
      for (const btn of document.querySelectorAll('button, [role="button"]')) {
        const t = btn.textContent.trim();
        if ((t === text || t.includes(text)) && btn.offsetParent !== null && !btn.disabled) {
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return text;
        }
      }
      return null;
    }, text);
    if (found) {
      console.log(`  → "${found}" 클릭`);
      await sleep(2500);
      return true;
    }
  }
  return false;
}

// 페이지 제목 읽기
async function getPageTitle(page) {
  return page.evaluate(() => {
    for (const h of document.querySelectorAll('h1, h2')) {
      if (h.offsetParent !== null && h.textContent.trim().length > 1) {
        return h.textContent.trim().substring(0, 80);
      }
    }
    return '';
  });
}

// ============================
async function main() {
  console.log('=== ARTLINK Play Console 자동화 v3 ===\n');

  const wsUrl = await getWsUrl();
  console.log(`WS: ${wsUrl}\n`);

  const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl, defaultViewport: null, protocolTimeout: 120000 });

  // 기존 탭 사용 (첫 번째 탭)
  const pages = await browser.pages();
  let page = pages[0];
  if (!page) page = await browser.newPage();
  page.setDefaultTimeout(30000);

  const results = [];

  // ─── 0. 앱 컨텍스트 진입 ───
  console.log('[0] Artlink 앱 컨텍스트 진입...');

  // 먼저 main-store-listing으로 이동 (이 URL은 작동함)
  await page.goto(`${BASE}/main-store-listing`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);

  let currentUrl = page.url();
  if (currentUrl.includes('app-list') || !currentUrl.includes(APP_ID)) {
    console.log('  앱 리스트에서 Artlink 클릭...');

    // 앱 리스트에서 Artlink 링크 찾아서 클릭
    const clicked = await page.evaluate(() => {
      // <a> 태그 중 Artlink 포함하는 것 찾기
      for (const a of document.querySelectorAll('a')) {
        if (a.textContent.includes('Artlink') && a.href) {
          a.click();
          return a.href;
        }
      }
      // 테이블 행 클릭 시도
      for (const tr of document.querySelectorAll('tr')) {
        if (tr.textContent.includes('Artlink')) {
          // 행 안의 첫 번째 링크 클릭
          const a = tr.querySelector('a');
          if (a) { a.click(); return a.href; }
          tr.click();
          return 'tr-clicked';
        }
      }
      return null;
    });
    console.log(`  클릭 결과: ${clicked}`);
    await sleep(8000);

    currentUrl = page.url();
    console.log(`  현재 URL: ${currentUrl.substring(currentUrl.indexOf('/developers/'))}`);
  }

  // 앱 컨텍스트 확인
  const inAppContext = page.url().includes(APP_ID);
  console.log(`  앱 컨텍스트: ${inAppContext ? '✅' : '❌'}`);
  await screenshot(page, '00-context');

  if (!inAppContext) {
    console.log('  ❌ 앱 컨텍스트 진입 실패. 종료.');
    await browser.disconnect();
    return;
  }

  const title = await getPageTitle(page);
  console.log(`  페이지: ${title}\n`);

  // ─── 1. 앱 액세스 권한 ───
  console.log('[1/9] 앱 액세스 권한');
  try {
    await navigateInApp(page, 'app-content/app-access');
    const pageTitle = await getPageTitle(page);
    console.log(`  제목: ${pageTitle}`);
    await screenshot(page, '01-before');

    if (pageTitle.includes('액세스') || pageTitle.includes('access') || pageTitle.includes('Access')) {
      const sel = await selectOption(page, [
        '모든 기능을 제한 없이 이용 가능',
        '모든 기능',
        'All functionality is available without special access',
        'All functionality',
      ]);
      if (sel) console.log(`  선택: ${sel}`);
      await clickSave(page);
      await screenshot(page, '01-after');
      results.push('1.앱 액세스: ✅');
    } else {
      await screenshot(page, '01-after');
      results.push(`1.앱 액세스: ⚠️ 페이지="${pageTitle}"`);
    }
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('1.앱 액세스: ❌'); }

  // ─── 2. 광고 ───
  console.log('\n[2/9] 광고');
  try {
    await navigateInApp(page, 'app-content/ads');
    const pageTitle = await getPageTitle(page);
    console.log(`  제목: ${pageTitle}`);
    await screenshot(page, '02-before');

    if (pageTitle.includes('광고') || pageTitle.includes('Ads') || pageTitle.includes('ads')) {
      const sel = await selectOption(page, [
        '예, 앱에 광고가 포함되어 있습니다',
        '예',
        'Yes, my app contains ads',
        'Yes',
      ]);
      if (sel) console.log(`  선택: ${sel}`);
      await clickSave(page);
      await screenshot(page, '02-after');
      results.push('2.광고: ✅');
    } else {
      await screenshot(page, '02-after');
      results.push(`2.광고: ⚠️ 페이지="${pageTitle}"`);
    }
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('2.광고: ❌'); }

  // ─── 3. 정부 앱 (이미 완료) ───
  console.log('\n[3/9] 정부 앱 (이미 완료)');
  results.push('3.정부 앱: ✅ (이전에 완료)');

  // ─── 4. 금융 기능 ───
  console.log('\n[4/9] 금융 기능');
  try {
    await navigateInApp(page, 'app-content/financial-features');
    const pageTitle = await getPageTitle(page);
    console.log(`  제목: ${pageTitle}`);
    await screenshot(page, '04-before');

    if (pageTitle.includes('금융') || pageTitle.includes('Financial') || pageTitle.includes('financial')) {
      // 체크박스 형식 - 아무것도 안 체크하고 다음
      // "다음" 버튼이 비활성화될 수 있음 → 스크롤 후 시도
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1000);

      const saved = await clickSave(page);
      if (saved) {
        await sleep(3000);
        // 2단계 (문서) - 또 다음
        await screenshot(page, '04-step2');
        await clickSave(page);
        await sleep(2000);
      }
      await screenshot(page, '04-after');
      results.push('4.금융: ✅');
    } else {
      await screenshot(page, '04-after');
      results.push(`4.금융: ⚠️ 페이지="${pageTitle}"`);
    }
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('4.금융: ❌'); }

  // ─── 5. 건강 앱 ───
  console.log('\n[5/9] 건강 앱');
  try {
    await navigateInApp(page, 'app-content/health');
    const pageTitle = await getPageTitle(page);
    console.log(`  제목: ${pageTitle}`);
    await screenshot(page, '05-before');

    if (pageTitle.includes('건강') || pageTitle.includes('Health') || pageTitle.includes('health')) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1000);

      const saved = await clickSave(page);
      if (saved) {
        await sleep(3000);
        await screenshot(page, '05-step2');
        await clickSave(page);
        await sleep(2000);
      }
      await screenshot(page, '05-after');
      results.push('5.건강: ✅');
    } else {
      await screenshot(page, '05-after');
      results.push(`5.건강: ⚠️ 페이지="${pageTitle}"`);
    }
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('5.건강: ❌'); }

  // ─── 6. 타겟층 ───
  console.log('\n[6/9] 타겟층');
  try {
    await navigateInApp(page, 'app-content/target-audience');
    const pageTitle = await getPageTitle(page);
    console.log(`  제목: ${pageTitle}`);
    await screenshot(page, '06-before');

    if (pageTitle.includes('타겟') || pageTitle.includes('Target') || pageTitle.includes('target') || pageTitle.includes('대상')) {
      // 연령대 체크박스
      for (const age of ['13~15', '13-15', '16~17', '16-17', '18세', '18 and over', 'Over 18', '만 18세 이상']) {
        const sel = await selectOption(page, [age]);
        if (sel) console.log(`  연령 선택: ${sel}`);
        await sleep(500);
      }
      await clickSave(page);
      await sleep(4000);

      // 2단계 - 어린이 대상 여부 → No
      const pageTitle2 = await getPageTitle(page);
      console.log(`  2단계: ${pageTitle2}`);
      await screenshot(page, '06-step2');

      await selectOption(page, ['아니요', 'No', '아니오']);
      await clickSave(page);
      await sleep(2000);

      await screenshot(page, '06-after');
      results.push('6.타겟층: ✅');
    } else {
      await screenshot(page, '06-after');
      results.push(`6.타겟층: ⚠️ 페이지="${pageTitle}"`);
    }
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('6.타겟층: ❌'); }

  // ─── 7. 콘텐츠 등급 (IARC) ───
  console.log('\n[7/9] 콘텐츠 등급');
  try {
    await navigateInApp(page, 'app-content/content-rating');
    const pageTitle = await getPageTitle(page);
    console.log(`  제목: ${pageTitle}`);
    await screenshot(page, '07-before');

    if (pageTitle.includes('콘텐츠') || pageTitle.includes('Content') || pageTitle.includes('content') || pageTitle.includes('등급') || pageTitle.includes('rating')) {
      // 시작 버튼
      const started = await clickByText(page, [
        '설문지 시작', '새 설문지 시작', 'Start questionnaire', 'Start new questionnaire',
        '시작', 'Start',
      ]);

      if (started) {
        console.log(`  설문 시작: ${started}`);
        await sleep(5000);
        await screenshot(page, '07-step1');

        // 이메일 입력
        const emailInput = await page.$('input[type="email"], input[type="text"]');
        if (emailInput) {
          await emailInput.click({ clickCount: 3 });
          await emailInput.type('leechan0415@gmail.com');
          console.log('  이메일 입력');
        }

        // 카테고리 선택
        const cat = await selectOption(page, [
          '유틸리티, 생산성, 커뮤니케이션 또는 기타',
          '유틸리티',
          'All Other App Types',
          'Utility, Productivity, Communication, or Other',
          'All Other',
          '기타',
        ]);
        if (cat) console.log(`  카테고리: ${cat}`);
        await sleep(1000);
        await clickSave(page);
        await sleep(5000);

        // IARC 질문들 - 모두 No 선택
        for (let step = 0; step < 15; step++) {
          const heading = await getPageTitle(page);
          console.log(`  [Q${step}] ${heading}`);

          // "아니요" 라디오 버튼 모두 선택
          let anyNo = false;
          for (let i = 0; i < 10; i++) {
            const selected = await page.evaluate(() => {
              const radios = document.querySelectorAll('[role="radio"], mat-radio-button, .mdc-radio, label');
              for (const r of radios) {
                const text = r.textContent.trim();
                if ((text === '아니요' || text === 'No' || text === '아니오') &&
                    r.getAttribute('aria-checked') !== 'true' &&
                    r.offsetParent !== null) {
                  r.scrollIntoView({ block: 'center' });
                  r.click();
                  return true;
                }
              }
              return false;
            });
            if (!selected) break;
            anyNo = true;
            await sleep(500);
          }

          const saved = await clickSave(page);
          if (!saved && !anyNo) break;
          await sleep(3000);
        }

        // 최종 제출
        await clickByText(page, ['제출', 'Submit', '적용', 'Apply']);
        await sleep(3000);
        results.push('7.콘텐츠 등급: ✅');
      } else {
        console.log('  시작 버튼 없음 - 이미 설정됨?');
        results.push('7.콘텐츠 등급: ⚠️ 이미 설정됨');
      }
    } else {
      results.push(`7.콘텐츠 등급: ⚠️ 페이지="${pageTitle}"`);
    }
    await screenshot(page, '07-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('7.콘텐츠 등급: ❌'); }

  // ─── 8. 데이터 보안 ───
  console.log('\n[8/9] 데이터 보안');
  try {
    await navigateInApp(page, 'app-content/data-safety');
    const pageTitle = await getPageTitle(page);
    console.log(`  제목: ${pageTitle}`);
    await screenshot(page, '08-before');

    if (pageTitle.includes('데이터') || pageTitle.includes('Data') || pageTitle.includes('data') || pageTitle.includes('보안') || pageTitle.includes('safety')) {
      // 시작/관리 버튼
      const started = await clickByText(page, ['시작', 'Start', '관리', 'Manage']);
      if (started) console.log(`  시작: ${started}`);
      await sleep(5000);

      // 여러 단계 처리
      for (let step = 0; step < 30; step++) {
        const heading = await getPageTitle(page);
        console.log(`  [Step ${step}] ${heading}`);

        if (step < 5) await screenshot(page, `08-step${step}`);

        // 현재 페이지에서 할 수 있는 선택 시도
        // 데이터 수집 여부 → 예
        await selectOption(page, ['예', 'Yes']);
        await sleep(300);

        // 데이터 유형 체크
        for (const t of ['이메일 주소', '이름', '사진', '동영상', '비정상 종료 로그', '기기 또는 기타 ID']) {
          await selectOption(page, [t]);
          await sleep(200);
        }

        // 용도 선택
        for (const t of ['앱 기능', '계정 관리', '분석', '광고 또는 마케팅', '광고']) {
          await selectOption(page, [t]);
          await sleep(200);
        }

        // 아니요 선택 (공유 여부 등)
        await selectOption(page, ['아니요', 'No']);
        await sleep(300);

        const saved = await clickSave(page);
        if (!saved) break;
        await sleep(3000);
      }

      // 제출
      await clickByText(page, ['제출', 'Submit']);
      await sleep(3000);
      results.push('8.데이터 보안: ✅ (확인 필요)');
    } else {
      results.push(`8.데이터 보안: ⚠️ 페이지="${pageTitle}"`);
    }
    await screenshot(page, '08-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('8.데이터 보안: ❌'); }

  // ─── 9. 앱 카테고리 ───
  console.log('\n[9/9] 앱 카테고리');
  try {
    await navigateInApp(page, 'main-store-listing');
    const pageTitle = await getPageTitle(page);
    console.log(`  제목: ${pageTitle}`);
    await screenshot(page, '09-before');

    // 스크롤 다운해서 카테고리 찾기
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(2000);

    // 드롭다운 찾아서 클릭
    const dropdown = await page.evaluate(() => {
      for (const el of document.querySelectorAll('mat-select, [role="combobox"], [role="listbox"], .mat-select, select')) {
        if (el.offsetParent !== null) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return true;
        }
      }
      return false;
    });
    if (dropdown) {
      await sleep(1500);
      await selectOption(page, ['교육', 'Education', '예술 및 디자인', 'Art & Design']);
      await sleep(1000);
    }

    await clickSave(page);
    await screenshot(page, '09-after');
    results.push('9.카테고리: ✅');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('9.카테고리: ❌'); }

  // ─── 결과 요약 ───
  console.log('\n==========================================');
  console.log('  결과 요약');
  console.log('==========================================');
  for (const r of results) console.log(`  ${r}`);
  console.log('==========================================');
  console.log('\n스크린샷: /tmp/pc3-*.png\n');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
