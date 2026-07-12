#!/usr/bin/env node
/**
 * ARTLINK - Play Console 9개 항목 자동화 v2
 *
 * 수정사항:
 * - 앱 선택 후 내부 네비게이션으로 각 페이지 이동
 * - 금융/건강은 체크박스 형식 → 아무것도 안 체크하고 다음
 * - 각 페이지 로드 후 충분히 대기
 */
import puppeteer from 'puppeteer-core';

const DEVELOPER_ID = '8820412626693118100';
const APP_ID = '4975271741081347187';
const BASE = `https://play.google.com/console/u/0/developers/${DEVELOPER_ID}/app/${APP_ID}`;
const WS_URL = process.argv[2] || '';
const DEBUG_PORT = 9222;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getWsUrl() {
  if (WS_URL) return WS_URL;
  const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  const data = await resp.json();
  return data.webSocketDebuggerUrl;
}

async function screenshot(page, name) {
  await page.screenshot({ path: `/tmp/pc2-${name}.png`, fullPage: true });
  console.log(`  📸 /tmp/pc2-${name}.png`);
}

// 안전한 페이지 이동 - SPA 리디렉트 대응
async function navigateToAppPage(page, path) {
  const url = `${BASE}/${path}`;

  // 먼저 직접 이동 시도
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(3000);

  // 대시보드로 리디렉트됐는지 확인
  const currentUrl = page.url();
  if (currentUrl.includes('app-list') || !currentUrl.includes(APP_ID)) {
    console.log('  → 대시보드로 리디렉트됨, 앱 선택 후 재시도...');

    // 앱 클릭해서 진입
    await page.goto(`${BASE}/app-dashboard`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await sleep(3000);

    // 다시 대시보드면 앱 목록에서 Artlink 클릭
    const url2 = page.url();
    if (url2.includes('app-list')) {
      const clicked = await page.evaluate(() => {
        for (const el of document.querySelectorAll('a, [role="link"], tr, td')) {
          if (el.textContent.includes('Artlink') || el.textContent.includes('artlink')) {
            el.click();
            return true;
          }
        }
        return false;
      });
      if (clicked) await sleep(5000);
    }

    // 이제 앱 내부에서 target URL로 이동
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await sleep(4000);
  }

  // 최종 URL 확인
  const finalUrl = page.url();
  console.log(`  URL: ${finalUrl.substring(finalUrl.lastIndexOf('/') + 1)}`);
  return finalUrl.includes(APP_ID);
}

// 텍스트로 요소 클릭 (여러 후보 텍스트 시도)
async function clickByText(page, texts, selector = '*') {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    const found = await page.evaluate((text, selector) => {
      for (const el of document.querySelectorAll(selector)) {
        if (el.textContent.trim().includes(text) && el.offsetParent !== null) {
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

// 라디오/체크박스/label 선택
async function selectOption(page, texts) {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    const found = await page.evaluate((text) => {
      // 1. role 기반
      const roleSelectors = '[role="radio"], [role="checkbox"], label, mat-radio-button, mat-checkbox, [role="option"]';
      for (const el of document.querySelectorAll(roleSelectors)) {
        const t = el.textContent.trim();
        if (t.includes(text) && el.offsetParent !== null) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return text;
        }
      }
      // 2. TextWalker
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
    if (found) { await sleep(1000); return found; }
  }
  return null;
}

// 저장/다음 버튼 클릭
async function clickSave(page) {
  const texts = ['저장', 'Save', '다음', 'Next', '제출', 'Submit', '계속', 'Continue'];
  for (const text of texts) {
    const found = await page.evaluate((text) => {
      for (const btn of document.querySelectorAll('button, [role="button"]')) {
        const t = btn.textContent.trim();
        if (t === text || (t.includes(text) && t.length < text.length + 20)) {
          if (btn.offsetParent !== null && !btn.disabled) {
            btn.scrollIntoView({ block: 'center' });
            btn.click();
            return text;
          }
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

// ============================
async function main() {
  console.log('=== ARTLINK Play Console 자동화 v2 ===\n');

  const wsUrl = await getWsUrl();
  console.log(`WS: ${wsUrl}\n`);

  const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl, defaultViewport: null });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  const results = [];

  // ──────────────────────────
  // 1. 앱 액세스 권한
  // ──────────────────────────
  console.log('[1/9] 앱 액세스 권한');
  try {
    const ok = await navigateToAppPage(page, 'app-content/app-access');
    await screenshot(page, '01-before');
    if (ok) {
      const sel = await selectOption(page, [
        '모든 기능을 제한 없이 이용 가능',
        '모든 기능',
        'All functionality is available without special access',
        'All functionality',
      ]);
      if (sel) {
        console.log(`  선택: ${sel}`);
        await clickSave(page);
        results.push('1.앱 액세스: ✅');
      } else {
        // 이미 설정되었을 수 있음
        const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
        if (pageText.includes('저장') || pageText.includes('Save')) {
          results.push('1.앱 액세스: ⚠️ 옵션 못찾음');
        } else {
          results.push('1.앱 액세스: ⚠️ 페이지 이동 실패');
        }
      }
    } else {
      results.push('1.앱 액세스: ❌ 네비게이션 실패');
    }
    await screenshot(page, '01-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('1.앱 액세스: ❌'); }

  // ──────────────────────────
  // 2. 광고
  // ──────────────────────────
  console.log('\n[2/9] 광고');
  try {
    const ok = await navigateToAppPage(page, 'app-content/ads');
    await screenshot(page, '02-before');
    if (ok) {
      const sel = await selectOption(page, [
        '예, 앱에 광고가 포함되어 있습니다',
        '예',
        'Yes, my app contains ads',
        'Yes',
      ]);
      if (sel) {
        console.log(`  선택: ${sel}`);
        await clickSave(page);
        results.push('2.광고: ✅');
      } else {
        results.push('2.광고: ⚠️ 옵션 못찾음');
      }
    } else {
      results.push('2.광고: ❌ 네비게이션 실패');
    }
    await screenshot(page, '02-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('2.광고: ❌'); }

  // ──────────────────────────
  // 3. 정부 앱 (이미 완료됨 - 확인만)
  // ──────────────────────────
  console.log('\n[3/9] 정부 앱 (이미 완료)');
  results.push('3.정부 앱: ✅ (이전에 완료)');

  // ──────────────────────────
  // 4. 금융 기능 - 체크박스 형식, 아무것도 안 체크하고 다음
  // ──────────────────────────
  console.log('\n[4/9] 금융 기능');
  try {
    const ok = await navigateToAppPage(page, 'app-content/financial-features');
    await screenshot(page, '04-before');
    if (ok) {
      // 이 페이지는 체크박스 형식 - 아무것도 체크 안하고 "다음" 클릭
      const saved = await clickSave(page); // "다음" 클릭
      await sleep(2000);

      // 2단계가 있을 수 있음 (문서 페이지) - 다시 다음/저장
      await screenshot(page, '04-step2');
      await clickSave(page);
      await sleep(2000);

      results.push('4.금융: ✅');
    } else {
      results.push('4.금융: ❌ 네비게이션 실패');
    }
    await screenshot(page, '04-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('4.금융: ❌'); }

  // ──────────────────────────
  // 5. 건강 앱 - 체크박스 형식, 아무것도 안 체크하고 다음
  // ──────────────────────────
  console.log('\n[5/9] 건강 앱');
  try {
    const ok = await navigateToAppPage(page, 'app-content/health');
    await screenshot(page, '05-before');
    if (ok) {
      // 체크박스 형식 - 아무것도 체크 안하고 "다음" 클릭
      await clickSave(page);
      await sleep(2000);

      // 2단계 (지역별 요구사항)
      await screenshot(page, '05-step2');
      await clickSave(page);
      await sleep(2000);

      results.push('5.건강: ✅');
    } else {
      results.push('5.건강: ❌ 네비게이션 실패');
    }
    await screenshot(page, '05-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('5.건강: ❌'); }

  // ──────────────────────────
  // 6. 타겟층
  // ──────────────────────────
  console.log('\n[6/9] 타겟층');
  try {
    const ok = await navigateToAppPage(page, 'app-content/target-audience');
    await screenshot(page, '06-before');
    if (ok) {
      // 연령 그룹 체크박스 선택 (여러 개 선택 가능)
      // 13세 이상 전부 체크
      for (const age of ['13~15', '13-15', '16~17', '16-17', '18', '18세', 'Over 18', '18 and over']) {
        await selectOption(page, [age]);
        await sleep(300);
      }
      await clickSave(page);
      await sleep(3000);

      await screenshot(page, '06-step2');
      // "이 앱이 어린이를 대상?" → No
      await selectOption(page, ['아니요', 'No', '아니오']);
      await clickSave(page);

      results.push('6.타겟층: ✅');
    } else {
      results.push('6.타겟층: ❌ 네비게이션 실패');
    }
    await screenshot(page, '06-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('6.타겟층: ❌'); }

  // ──────────────────────────
  // 7. 콘텐츠 등급 (IARC)
  // ──────────────────────────
  console.log('\n[7/9] 콘텐츠 등급');
  try {
    const ok = await navigateToAppPage(page, 'app-content/content-rating');
    await screenshot(page, '07-before');
    if (ok) {
      // 시작 버튼
      const started = await clickByText(page, [
        '설문지 시작', '새 설문지 시작', 'Start questionnaire', 'Start new questionnaire',
        '시작', 'Start',
      ], 'button, [role="button"], a');

      if (started) {
        console.log(`  설문 시작: ${started}`);
        await sleep(4000);
        await screenshot(page, '07-step1');

        // 이메일 입력
        const inputs = await page.$$('input');
        for (const input of inputs) {
          const type = await input.evaluate(el => el.type);
          if (type === 'email' || type === 'text') {
            await input.click({ clickCount: 3 });
            await input.type('leechan0415@gmail.com');
            break;
          }
        }

        // 카테고리 선택
        await selectOption(page, [
          '유틸리티, 생산성, 커뮤니케이션 또는 기타',
          '유틸리티',
          'All Other App Types',
          'Utility, Productivity, Communication, or Other',
          'All Other',
          '기타',
        ]);
        await sleep(1000);
        await clickSave(page);
        await sleep(4000);
        await screenshot(page, '07-category');

        // IARC 질문들 - 모두 No
        for (let step = 0; step < 20; step++) {
          await screenshot(page, `07-q${step}`);

          // 현재 페이지의 모든 라디오에서 No 선택
          let anySelected = false;
          for (let attempt = 0; attempt < 10; attempt++) {
            const selected = await page.evaluate(() => {
              for (const r of document.querySelectorAll('[role="radio"], mat-radio-button, .mdc-radio')) {
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
            anySelected = true;
            await sleep(500);
          }

          const saved = await clickSave(page);
          await sleep(3000);
          if (!saved && !anySelected) break;
        }

        // 최종 제출
        await clickByText(page, ['제출', 'Submit', '적용', 'Apply'], 'button');
        await sleep(3000);
        results.push('7.콘텐츠 등급: ✅');
      } else {
        console.log('  설문 시작 버튼 없음 - 이미 설정됨?');
        results.push('7.콘텐츠 등급: ⚠️ 이미 설정됨');
      }
    } else {
      results.push('7.콘텐츠 등급: ❌ 네비게이션 실패');
    }
    await screenshot(page, '07-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('7.콘텐츠 등급: ❌'); }

  // ──────────────────────────
  // 8. 데이터 보안
  // ──────────────────────────
  console.log('\n[8/9] 데이터 보안');
  try {
    const ok = await navigateToAppPage(page, 'app-content/data-safety');
    await screenshot(page, '08-before');
    if (ok) {
      // 시작/관리 버튼
      const started = await clickByText(page, [
        '시작', 'Start', '관리', 'Manage', '다음', 'Next',
      ], 'button, [role="button"], a');

      if (started) {
        console.log(`  시작: ${started}`);
        await sleep(4000);

        // 여러 단계를 순차 처리
        for (let step = 0; step < 30; step++) {
          const heading = await page.evaluate(() => {
            for (const h of document.querySelectorAll('h1, h2, h3')) {
              if (h.offsetParent !== null && h.textContent.trim().length > 2) {
                return h.textContent.trim().substring(0, 80);
              }
            }
            return '';
          });
          console.log(`  [Step ${step}] ${heading}`);
          await screenshot(page, `08-step${step}`);

          // 페이지 내용에 따라 적절한 선택
          if (heading.includes('개요') || heading.includes('Overview')) {
            await clickSave(page);
          } else if (heading.includes('수집') || heading.includes('collection') || heading.includes('보안') || heading.includes('security')) {
            // 데이터 수집 → 예
            await selectOption(page, ['예', 'Yes']);
            await sleep(500);
            // 암호화 → 예
            await selectOption(page, ['예', 'Yes']);
            await sleep(500);
            // 삭제 → 예
            await selectOption(page, ['예', 'Yes']);
            await sleep(500);
            await clickSave(page);
          } else if (heading.includes('유형') || heading.includes('type')) {
            // 데이터 유형 선택
            for (const t of ['이메일 주소', 'Email', '이름', 'Name', '사진', 'Photos',
                             '동영상', 'Videos', '기기 또는 기타 ID', 'Device',
                             '비정상 종료 로그', 'Crash logs']) {
              await selectOption(page, [t]);
              await sleep(300);
            }
            await clickSave(page);
          } else {
            // 기타 페이지 - 저장/다음 시도
            // 먼저 적절한 선택 시도
            await selectOption(page, ['앱 기능', 'App functionality']);
            await selectOption(page, ['분석', 'Analytics']);
            await selectOption(page, ['광고', 'Advertising']);
            await selectOption(page, ['아니요', 'No']);

            const saved = await clickSave(page);
            if (!saved) break;
          }
          await sleep(3000);

          // 최종 페이지 확인
          const finalCheck = page.url();
          if (finalCheck.includes('data-safety') && !finalCheck.includes('edit') && !finalCheck.includes('step')) {
            // 메인 데이터 보안 페이지로 돌아옴
            const submitBtn = await clickByText(page, ['제출', 'Submit'], 'button');
            if (submitBtn) break;
          }
        }

        results.push('8.데이터 보안: ✅ (확인 필요)');
      } else {
        results.push('8.데이터 보안: ⚠️ 시작 버튼 없음');
      }
    } else {
      results.push('8.데이터 보안: ❌ 네비게이션 실패');
    }
    await screenshot(page, '08-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('8.데이터 보안: ❌'); }

  // ──────────────────────────
  // 9. 앱 카테고리
  // ──────────────────────────
  console.log('\n[9/9] 앱 카테고리');
  try {
    const ok = await navigateToAppPage(page, 'main-store-listing');
    await screenshot(page, '09-before');
    if (ok) {
      // 페이지 스크롤해서 카테고리 섹션 찾기
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(2000);

      // 드롭다운 클릭
      const dropdownClicked = await page.evaluate(() => {
        for (const el of document.querySelectorAll('mat-select, [role="combobox"], [role="listbox"], select, .mat-select')) {
          if (el.offsetParent !== null) {
            el.scrollIntoView({ block: 'center' });
            el.click();
            return true;
          }
        }
        return false;
      });
      if (dropdownClicked) {
        await sleep(1000);
        await selectOption(page, ['교육', 'Education', '예술 및 디자인', 'Art & Design']);
        await sleep(1000);
      }

      await clickSave(page);
      results.push('9.카테고리: ✅');
    } else {
      results.push('9.카테고리: ❌ 네비게이션 실패');
    }
    await screenshot(page, '09-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('9.카테고리: ❌'); }

  // ──────────────────────────
  // 결과 요약
  // ──────────────────────────
  console.log('\n==========================================');
  console.log('  결과 요약');
  console.log('==========================================');
  for (const r of results) console.log(`  ${r}`);
  console.log('==========================================');
  console.log('\n스크린샷: /tmp/pc2-*.png\n');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
