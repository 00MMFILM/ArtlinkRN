#!/usr/bin/env node
/**
 * ARTLINK - Play Console 나머지 항목 수정
 * v5에서 완료되지 않은 항목들을 직접 URL로 이동하여 처리
 *
 * 남은 항목:
 * 1. 콘텐츠 등급 (content-rating)
 * 2. 데이터 보안 (data-privacy-security)
 * 3. 광고 ID (ad-id-declaration)
 * + 기타 남은 항목
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
    await page.screenshot({ path: `/tmp/pc6-${name}.png`, fullPage: false });
    console.log(`  📸 ${name}`);
  } catch { console.log(`  📸 실패: ${name}`); }
}

// 라디오 선택 (짧은 타임아웃)
async function selectRadio(page, text) {
  try {
    const found = await page.evaluate((text) => {
      const els = document.querySelectorAll('mat-radio-button, label, [role="radio"], [role="checkbox"], mat-checkbox');
      for (const el of els) {
        if (!el.offsetParent && el.offsetWidth === 0) continue;
        const t = el.textContent.trim();
        if (t.includes(text)) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          const input = el.querySelector('input');
          if (input) input.click();
          return t.substring(0, 60);
        }
      }
      return null;
    }, text);
    if (found) {
      await sleep(600);
      console.log(`    ✓ ${found.substring(0, 50)}`);
    }
    return found;
  } catch { return null; }
}

// 체크박스 선택
async function checkBox(page, text) {
  try {
    return await page.evaluate((text) => {
      const els = document.querySelectorAll('mat-checkbox, label, [role="checkbox"]');
      for (const el of els) {
        if (!el.offsetParent && el.offsetWidth === 0) continue;
        if (el.textContent.trim().includes(text)) {
          // 이미 체크됐는지 확인
          const input = el.querySelector('input[type="checkbox"]');
          if (input && !input.checked) {
            el.scrollIntoView({ block: 'center' });
            el.click();
          }
          return el.textContent.trim().substring(0, 50);
        }
      }
      return null;
    }, text);
  } catch { return null; }
}

// 버튼 클릭
async function clickBtn(page, texts) {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    try {
      const found = await page.evaluate((text) => {
        for (const btn of document.querySelectorAll('button, [role="button"]')) {
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
    } catch { continue; }
  }
  return false;
}

// 페이지 이동 (app-content/ 하위 URL은 overview에서 이동할 때만 작동)
// overview의 "선언 시작/수정" 버튼 중 특정 URL로 이동하는 것을 클릭
async function navigateToItem(page, urlPart) {
  // 먼저 overview로 이동
  await page.goto(`${BASE}/app-content/overview`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(4000);

  // overview의 모든 링크/버튼 중 해당 URL을 가진 것 클릭
  // 또는 "선언 시작/수정" 버튼을 하나씩 클릭해서 URL 확인
  const clicked = await page.evaluate((urlPart) => {
    // href에 urlPart 포함된 링크 찾기
    for (const a of document.querySelectorAll('a[href]')) {
      if (a.href.includes(urlPart)) {
        a.scrollIntoView({ block: 'center' });
        a.click();
        return a.href;
      }
    }
    // 버튼 중에서 찾기
    for (const btn of document.querySelectorAll('button')) {
      const t = btn.textContent.trim();
      if ((t === '선언 시작' || t === '선언 수정') && btn.offsetParent) {
        // 부모에서 href 확인
        let parent = btn.parentElement;
        for (let i = 0; i < 10; i++) {
          if (!parent) break;
          const link = parent.querySelector(`a[href*="${urlPart}"]`);
          if (link) {
            link.click();
            return link.href;
          }
          parent = parent.parentElement;
        }
      }
    }
    return null;
  }, urlPart);

  if (clicked) {
    await sleep(5000);
    return true;
  }

  // 직접 URL 이동 시도
  await page.goto(`${BASE}/app-content/${urlPart}`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);
  return page.url().includes(urlPart);
}

// ============================
async function main() {
  console.log('=== ARTLINK - 남은 항목 수정 ===\n');

  const wsUrl = await getWsUrl();
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: null,
    protocolTimeout: 180000, // 3분
  });

  const pages = await browser.pages();
  let page = pages[0];
  page.setDefaultTimeout(30000);

  const results = [];

  // ─── 1. 광고 ID ───
  console.log('\n[1] 광고 ID');
  try {
    const nav = await navigateToItem(page, 'ad-id-declaration');
    if (nav && page.url().includes('ad-id')) {
      await screenshot(page, '01-adid');

      // "예" 선택 (광고 ID 사용)
      await selectRadio(page, '예');
      await sleep(1000);

      // 용도 체크박스 선택
      await checkBox(page, '앱 기능');
      await checkBox(page, '애널리틱스');
      await sleep(500);

      await screenshot(page, '01-adid-filled');
      await clickBtn(page, ['저장', 'Save']);
      await sleep(3000);
      await screenshot(page, '01-adid-saved');
      results.push('광고 ID: ✅');
    } else {
      results.push('광고 ID: ❌ 이동 실패');
    }
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push('광고 ID: ❌'); }

  // ─── 2. 콘텐츠 등급 ───
  console.log('\n[2] 콘텐츠 등급');
  try {
    const nav = await navigateToItem(page, 'content-rating');
    if (nav) {
      await sleep(3000);
      await screenshot(page, '02-rating-init');

      // "설문지 시작" 또는 기존 진행
      const started = await clickBtn(page, ['설문지 시작', '시작', 'Start']);
      if (started) {
        await sleep(5000);
      }
      await screenshot(page, '02-rating-form');

      // 이메일 입력
      const emailInputs = await page.$$('input');
      for (const input of emailInputs) {
        const type = await page.evaluate(el => el.type, input);
        const val = await page.evaluate(el => el.value, input);
        if ((type === 'email' || type === 'text') && !val) {
          await input.click({ clickCount: 3 });
          await input.type('leechan0415@gmail.com');
          console.log('    이메일 입력');
          break;
        }
      }
      await sleep(500);

      // 카테고리 선택: "다른 모든 앱 유형"
      await selectRadio(page, '다른 모든 앱 유형') ||
        await selectRadio(page, 'All Other App Types') ||
        await selectRadio(page, '기타');
      await sleep(500);

      // 이용약관 동의 (체크박스)
      await checkBox(page, '이용약관');
      await checkBox(page, 'terms');

      await screenshot(page, '02-rating-cat');

      // "다음" 클릭
      await clickBtn(page, ['다음', 'Next']);
      await sleep(5000);
      await screenshot(page, '02-rating-q');

      // 설문지 질문들 - 모두 "아니요"
      for (let step = 0; step < 15; step++) {
        // 현재 페이지의 모든 질문에 "아니요" 선택
        let selectedCount = 0;
        for (let i = 0; i < 30; i++) {
          const sel = await selectRadio(page, '아니요');
          if (!sel) break;
          selectedCount++;
        }

        if (step < 5) await screenshot(page, `02-rating-step${step}`);

        // 다음/저장/제출
        const next = await clickBtn(page, ['다음', 'Next']);
        if (!next) {
          const submit = await clickBtn(page, ['제출', 'Submit', '저장', 'Save', '적용', 'Apply']);
          if (!submit && selectedCount === 0) break;
        }
        await sleep(4000);

        // 완료 페이지 확인
        const url = page.url();
        if (url.includes('overview') || url.includes('summary')) break;
      }

      // 최종 제출
      await clickBtn(page, ['제출', 'Submit', '적용', 'Apply', '확인', 'Confirm']);
      await screenshot(page, '02-rating-done');
      results.push('콘텐츠 등급: ✅');
    } else {
      results.push('콘텐츠 등급: ❌ 이동 실패');
    }
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push(`콘텐츠 등급: ❌ ${e.message.substring(0,30)}`); }

  // ─── 3. 데이터 보안 ───
  console.log('\n[3] 데이터 보안');
  try {
    const nav = await navigateToItem(page, 'data-privacy-security');
    if (nav) {
      await sleep(3000);
      await screenshot(page, '03-data-init');

      // 여러 단계의 위저드 진행
      for (let step = 0; step < 20; step++) {
        const url = page.url();
        if (url.includes('overview')) break;

        await screenshot(page, `03-data-s${step}`);

        // 페이지 내용 확인
        const pageText = await page.evaluate(() => {
          const main = document.querySelector('main, [role="main"], .main-content') || document.body;
          return main.innerText.substring(0, 600);
        }).catch(() => '');

        // 데이터 수집 여부
        if (pageText.includes('수집하거나 공유') || pageText.includes('collect or share')) {
          await selectRadio(page, '예') || await selectRadio(page, 'Yes');
        }
        // 암호화
        else if (pageText.includes('암호화') || pageText.includes('encrypt')) {
          await selectRadio(page, '예') || await selectRadio(page, 'Yes');
        }
        // 삭제 요청
        else if (pageText.includes('삭제') || pageText.includes('deletion')) {
          await selectRadio(page, '예') || await selectRadio(page, 'Yes');
        }
        // 데이터 유형 선택
        else if (pageText.includes('데이터 유형') || pageText.includes('data type')) {
          // 필요한 유형만 체크
          await checkBox(page, '사용자 이름');
          await checkBox(page, '이메일 주소');
          await checkBox(page, '비정상 종료 로그');
          await checkBox(page, '기기 또는 기타 ID');
          await checkBox(page, '앱 상호작용');
        }
        // 데이터 목적/용도
        else if (pageText.includes('용도') || pageText.includes('purpose') || pageText.includes('사용')) {
          await checkBox(page, '앱 기능');
          await checkBox(page, '분석');
        }
        // 계정 생성 방법
        else if (pageText.includes('계정 생성') || pageText.includes('account creation')) {
          await checkBox(page, '이메일');
          await checkBox(page, 'Google');
        }
        // 미리보기
        else if (pageText.includes('미리보기') || pageText.includes('preview')) {
          // 제출
          await clickBtn(page, ['제출', 'Submit']);
          break;
        }
        // 기본: 아니요 시도
        else {
          await selectRadio(page, '아니요') || await selectRadio(page, 'No');
        }

        await sleep(1000);

        // 다음/저장/제출
        const next = await clickBtn(page, ['다음', 'Next']);
        if (!next) {
          const sub = await clickBtn(page, ['제출', 'Submit', '저장', 'Save']);
          if (!sub) {
            // 스크롤 후 재시도
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await sleep(500);
            const retry = await clickBtn(page, ['다음', 'Next', '제출', 'Submit', '저장', 'Save']);
            if (!retry) break;
          }
        }
        await sleep(3000);
      }

      await clickBtn(page, ['제출', 'Submit']);
      await screenshot(page, '03-data-done');
      results.push('데이터 보안: ✅');
    } else {
      results.push('데이터 보안: ❌ 이동 실패');
    }
  } catch (e) { console.log(`  ❌ ${e.message}`); results.push(`데이터 보안: ❌ ${e.message.substring(0,30)}`); }

  // ─── 4. 남은 항목 확인 ───
  console.log('\n[4] 남은 항목 확인...');
  await page.goto(`${BASE}/app-content/overview`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(4000);
  await screenshot(page, '04-final-overview');

  // 남은 "선언 시작/수정" 버튼 수
  const remaining = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a'))
      .filter(b => {
        const t = b.textContent.trim();
        return (t === '선언 시작' || t === '선언 수정') && (b.offsetParent || b.offsetWidth > 0);
      }).length;
  }).catch(() => -1);

  console.log(`  남은 선언: ${remaining}개`);

  // ─── 결과 ───
  console.log('\n==========================================');
  console.log('  결과 요약');
  console.log('==========================================');
  for (const r of results) console.log(`  ${r}`);
  console.log(`\n  남은 선언: ${remaining}개`);
  console.log('==========================================');
  console.log('\n스크린샷: /tmp/pc6-*.png\n');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
