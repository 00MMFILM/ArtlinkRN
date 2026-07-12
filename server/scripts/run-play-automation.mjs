#!/usr/bin/env node
/**
 * ARTLINK - Play Console 9개 항목 자동화
 * 이미 실행 중인 Chrome remote debugging에 연결하여 자동화
 */
import puppeteer from 'puppeteer-core';

const DEVELOPER_ID = '8820412626693118100';
const APP_ID = '4975271741081347187';
const BASE = `https://play.google.com/console/u/0/developers/${DEVELOPER_ID}/app/${APP_ID}`;
const WS_URL = process.argv[2] || 'ws://127.0.0.1:9222/devtools/browser/8f8ba4b2-58fb-48d6-8f42-eda288d8181d';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function screenshot(page, name) {
  await page.screenshot({ path: `/tmp/pc-${name}.png`, fullPage: true });
  console.log(`  📸 /tmp/pc-${name}.png`);
}

// 텍스트 포함하는 visible 요소 클릭
async function clickText(page, texts, tag = '*') {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    const found = await page.evaluate((text, tag) => {
      for (const el of document.querySelectorAll(tag)) {
        if (el.textContent.trim().includes(text) && el.offsetParent !== null) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return text;
        }
      }
      return null;
    }, text, tag);
    if (found) { await sleep(1500); return found; }
  }
  return null;
}

// role="radio" 또는 label 등 interactive 요소에서 텍스트로 선택
async function selectOption(page, texts) {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    const found = await page.evaluate((text) => {
      // 1차: role="radio", role="checkbox", label
      const selectors = '[role="radio"], [role="checkbox"], label, mat-radio-button, mat-checkbox, [role="option"]';
      for (const el of document.querySelectorAll(selectors)) {
        if (el.textContent.trim().includes(text) && el.offsetParent !== null) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return text;
        }
      }
      // 2차: TreeWalker로 텍스트 노드 기반 검색
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

// 저장/다음/제출 버튼 클릭
async function saveButton(page) {
  const buttonTexts = ['Save', '저장', 'Next', '다음', 'Submit', '제출', 'Start', '시작', 'Continue', '계속'];
  for (const text of buttonTexts) {
    const found = await page.evaluate((text) => {
      for (const btn of document.querySelectorAll('button, [role="button"]')) {
        const t = btn.textContent.trim();
        if (t.includes(text) && btn.offsetParent !== null && !btn.disabled) {
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

async function navigateTo(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);
}

// ============================
// MAIN
// ============================
async function main() {
  console.log('=== ARTLINK Play Console 자동화 ===\n');
  console.log(`WS: ${WS_URL}\n`);

  const browser = await puppeteer.connect({ browserWSEndpoint: WS_URL, defaultViewport: null });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  const results = [];

  // ──────────────────────────
  // 1. 앱 액세스 권한
  // ──────────────────────────
  console.log('[1/9] 앱 액세스 권한');
  try {
    await navigateTo(page, `${BASE}/app-content/app-access`);
    await screenshot(page, '01-before');
    const sel = await selectOption(page, [
      'All functionality is available without special access',
      '모든 기능을 제한 없이 이용 가능',
      'All functionality is available',
      '모든 기능',
    ]);
    if (sel) { console.log(`  선택: ${sel}`); await saveButton(page); results.push('1.앱 액세스: ✅'); }
    else results.push('1.앱 액세스: ⚠️ 못찾음');
    await screenshot(page, '01-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push(`1.앱 액세스: ❌`); }

  // ──────────────────────────
  // 2. 광고
  // ──────────────────────────
  console.log('\n[2/9] 광고');
  try {
    await navigateTo(page, `${BASE}/app-content/ads`);
    await screenshot(page, '02-before');
    const sel = await selectOption(page, [
      'Yes, my app contains ads',
      '예, 앱에 광고가 포함되어 있습니다',
      'Yes',
      '예',
    ]);
    if (sel) { console.log(`  선택: ${sel}`); await saveButton(page); results.push('2.광고: ✅'); }
    else results.push('2.광고: ⚠️');
    await screenshot(page, '02-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push(`2.광고: ❌`); }

  // ──────────────────────────
  // 3. 정부 앱
  // ──────────────────────────
  console.log('\n[3/9] 정부 앱');
  try {
    await navigateTo(page, `${BASE}/app-content/government-apps`);
    await screenshot(page, '03-before');
    const sel = await selectOption(page, ['No', '아니요', '아니오']);
    if (sel) { console.log(`  선택: ${sel}`); await saveButton(page); results.push('3.정부 앱: ✅'); }
    else results.push('3.정부 앱: ⚠️');
    await screenshot(page, '03-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push(`3.정부: ❌`); }

  // ──────────────────────────
  // 4. 금융 기능
  // ──────────────────────────
  console.log('\n[4/9] 금융 기능');
  try {
    await navigateTo(page, `${BASE}/app-content/financial-features`);
    await screenshot(page, '04-before');
    const sel = await selectOption(page, ['No', '아니요', '아니오']);
    if (sel) { console.log(`  선택: ${sel}`); await saveButton(page); results.push('4.금융: ✅'); }
    else results.push('4.금융: ⚠️');
    await screenshot(page, '04-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push(`4.금융: ❌`); }

  // ──────────────────────────
  // 5. 건강 앱
  // ──────────────────────────
  console.log('\n[5/9] 건강 앱');
  try {
    await navigateTo(page, `${BASE}/app-content/health`);
    await screenshot(page, '05-before');
    const sel = await selectOption(page, ['No', '아니요', '아니오', 'not a health', '건강 앱이 아닙']);
    if (sel) { console.log(`  선택: ${sel}`); await saveButton(page); results.push('5.건강: ✅'); }
    else results.push('5.건강: ⚠️');
    await screenshot(page, '05-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push(`5.건강: ❌`); }

  // ──────────────────────────
  // 6. 타겟층
  // ──────────────────────────
  console.log('\n[6/9] 타겟층');
  try {
    await navigateTo(page, `${BASE}/app-content/target-audience`);
    await screenshot(page, '06-before');

    // 연령대 체크박스 (13+, 16+, 18+ 전부 또는 개별)
    for (const age of ['13', '16', '18', 'Over 18', '18 and over']) {
      await selectOption(page, [age]);
    }
    await saveButton(page);
    await sleep(3000);

    // 후속: "이 앱이 어린이에게 어필?" → No
    await selectOption(page, ['No', '아니요', '아니오']);
    await saveButton(page);

    results.push('6.타겟층: ✅');
    await screenshot(page, '06-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push(`6.타겟층: ❌`); }

  // ──────────────────────────
  // 7. 콘텐츠 등급 (IARC)
  // ──────────────────────────
  console.log('\n[7/9] 콘텐츠 등급');
  try {
    await navigateTo(page, `${BASE}/app-content/content-rating`);
    await screenshot(page, '07-before');

    // 시작 버튼
    const started = await clickText(page, [
      'Start questionnaire', 'Start new questionnaire',
      '설문지 시작', '새 설문지 시작', 'Start', '시작',
    ], 'button, [role="button"], a');

    if (started) {
      console.log(`  설문 시작: ${started}`);
      await sleep(3000);

      // 이메일 입력
      const emailInput = await page.$('input[type="email"], input[type="text"]');
      if (emailInput) {
        await emailInput.click({ clickCount: 3 });
        await emailInput.type('leechan0415@gmail.com');
      }

      // 카테고리 선택
      await selectOption(page, [
        'All Other App Types',
        'Utility, Productivity, Communication, or Other',
        '유틸리티',
        'All Other',
        '기타',
        'Reference',
      ]);
      await sleep(1000);
      await saveButton(page);
      await sleep(3000);

      // IARC 질문들 - 모두 No
      for (let step = 0; step < 15; step++) {
        const noSel = await selectOption(page, ['No', '아니요', '아니오']);
        if (!noSel) {
          await saveButton(page);
          await sleep(2000);
          const noSel2 = await selectOption(page, ['No', '아니요', '아니오']);
          if (!noSel2) break;
        }
        // 같은 페이지에 여러 No가 있을 수 있음
        for (let extra = 0; extra < 5; extra++) {
          const more = await page.evaluate(() => {
            for (const r of document.querySelectorAll('[role="radio"]')) {
              if (r.getAttribute('aria-checked') !== 'true' &&
                  (r.textContent.includes('No') || r.textContent.includes('아니')) &&
                  r.offsetParent !== null) {
                r.scrollIntoView({ block: 'center' });
                r.click();
                return true;
              }
            }
            return false;
          });
          if (!more) break;
          await sleep(500);
        }
        await saveButton(page);
        await sleep(2000);
      }

      // 최종 제출/적용
      await clickText(page, ['Submit', '제출', 'Apply', '적용'], 'button');
      await sleep(3000);
      results.push('7.콘텐츠 등급: ✅');
    } else {
      console.log('  이미 설정됨?');
      results.push('7.콘텐츠 등급: ⚠️ 이미 설정?');
    }
    await screenshot(page, '07-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push(`7.콘텐츠 등급: ❌`); }

  // ──────────────────────────
  // 8. 데이터 보안
  // ──────────────────────────
  console.log('\n[8/9] 데이터 보안');
  try {
    await navigateTo(page, `${BASE}/app-content/data-safety`);
    await screenshot(page, '08-before');

    const started = await clickText(page, [
      'Start', '시작', 'Next', '다음', 'Manage', '관리',
    ], 'button, [role="button"], a');

    if (started) {
      console.log(`  시작: ${started}`);
      await sleep(3000);

      // Overview → Next
      await saveButton(page);
      await sleep(3000);

      // 데이터 수집 여부 → Yes
      await selectOption(page, ['Yes', '예']);
      await sleep(1000);

      // 암호화 → Yes
      await selectOption(page, ['Yes, all user data', '예, 모든', 'encrypted', '암호화']);
      await sleep(1000);

      // 삭제 요청 → Yes
      await selectOption(page, ['provide a way', '삭제 요청', 'delete']);
      await sleep(1000);

      await saveButton(page);
      await sleep(3000);

      // 데이터 유형 선택
      const types = ['Email', '이메일', 'Name', '이름', 'Photos', '사진', 'Videos', '동영상',
                     'Device or other IDs', '기기', 'Crash logs', '비정상 종료'];
      for (const t of types) { await selectOption(page, [t]); await sleep(300); }

      await saveButton(page);
      await sleep(3000);

      // 상세 설정 - 여러 페이지 처리
      for (let i = 0; i < 20; i++) {
        const heading = await page.evaluate(() => {
          const h = document.querySelector('h1, h2, h3, [role="heading"]');
          return h ? h.textContent.trim().substring(0, 60) : '';
        });
        if (!heading) break;
        console.log(`  상세: ${heading}`);

        // 수집됨
        await selectOption(page, ['Collected', '수집됨', '수집']);
        // 공유 여부
        if (heading.includes('Device') || heading.includes('기기')) {
          await selectOption(page, ['Shared', '공유됨', '공유']);
        } else {
          await selectOption(page, ['Not shared', '공유되지 않음']);
        }
        // Ephemeral → No
        await selectOption(page, ['No, this data is not processed ephemerally', '아니요', 'No']);
        // Required
        if (heading.match(/Email|이메일|Crash|비정상|Device|기기/)) {
          await selectOption(page, ['Required', '필수', 'Yes, this data']);
        } else {
          await selectOption(page, ['Optional', '선택', 'No']);
        }
        // 목적
        if (heading.match(/Email|이메일/)) {
          await selectOption(page, ['App functionality', '앱 기능']);
          await selectOption(page, ['Account management', '계정 관리']);
        } else if (heading.match(/Name|이름|Photo|사진|Video|동영상/)) {
          await selectOption(page, ['App functionality', '앱 기능']);
        } else if (heading.match(/Crash|비정상/)) {
          await selectOption(page, ['Analytics', '분석']);
        } else if (heading.match(/Device|기기/)) {
          await selectOption(page, ['Advertising or marketing', '광고']);
        }

        const saved = await saveButton(page);
        await sleep(3000);
        if (!saved) break;
      }

      await clickText(page, ['Submit', '제출', 'Save', '저장'], 'button');
      await sleep(3000);
      results.push('8.데이터 보안: ✅');
    } else {
      results.push('8.데이터 보안: ⚠️ 시작 버튼 없음');
    }
    await screenshot(page, '08-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push(`8.데이터 보안: ❌`); }

  // ──────────────────────────
  // 9. 앱 카테고리
  // ──────────────────────────
  console.log('\n[9/9] 앱 카테고리');
  try {
    await navigateTo(page, `${BASE}/main-store-listing`);
    await screenshot(page, '09-before');

    // 카테고리 드롭다운 클릭
    const opened = await page.evaluate(() => {
      for (const el of document.querySelectorAll('mat-select, [role="listbox"], select, [role="combobox"]')) {
        if (el.offsetParent !== null) { el.click(); return true; }
      }
      return false;
    });
    if (opened) {
      await sleep(1000);
      await selectOption(page, ['Education', '교육', 'Art & Design', '예술 및 디자인']);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1000);
    await saveButton(page);
    results.push('9.카테고리: ✅');
    await screenshot(page, '09-after');
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push(`9.카테고리: ❌`); }

  // ──────────────────────────
  // 결과 요약
  // ──────────────────────────
  console.log('\n==========================================');
  console.log('  결과 요약');
  console.log('==========================================');
  for (const r of results) console.log(`  ${r}`);
  console.log('==========================================');
  console.log('스크린샷: /tmp/pc-*.png');

  await browser.disconnect();
}

main().catch(e => { console.error('❌ 에러:', e.message); process.exit(1); });
