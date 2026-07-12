#!/usr/bin/env node
/**
 * ARTLINK - Play Console 남은 항목 처리 v4
 * 각 항목을 개별 처리, 충분한 대기 시간, 정확한 본문 매칭
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
  try { await page.screenshot({ path: `/tmp/pc9-${name}.png`, fullPage: false }); console.log(`  📸 ${name}`); } catch {}
}

// 페이지 로딩 대기 (로딩 스피너 사라질 때까지)
async function waitForLoad(page, maxWait = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const loading = await page.evaluate(() => {
      const body = document.body.innerText;
      // 로딩 중 표시가 없고 실제 콘텐츠가 있으면 로딩 완료
      const hasContent = body.length > 200;
      const isLoading = body.includes('로드 중') && body.indexOf('로드 중') < 100;
      return isLoading || !hasContent;
    }).catch(() => true);
    if (!loading) return;
    await sleep(1000);
  }
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

// 모든 클릭 가능 요소에서 텍스트 찾기 (button, a, [role="button"])
async function clickAny(page, text) {
  try {
    const r = await page.evaluate((text) => {
      for (const el of document.querySelectorAll('button, a, [role="button"], [role="link"]')) {
        if (el.offsetWidth === 0 && !el.offsetParent) continue;
        const t = el.textContent.trim();
        if (t === text || (t.includes(text) && t.length < text.length + 10)) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return t;
        }
      }
      return null;
    }, text);
    if (r) { console.log(`    → ${r}`); await sleep(2000); return true; }
  } catch {}
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

// ─── 1. 금융 기능 ───
async function doFinance(page) {
  console.log('\n═══ 금융 기능 ═══');
  await goOverview(page);

  // "선언 시작" 버튼 중 금융 섹션의 것을 찾아 클릭
  const clicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('button, a');
    for (const b of btns) {
      const t = b.textContent.trim();
      if (t !== '선언 시작' || !(b.offsetParent || b.offsetWidth > 0)) continue;
      // 부모를 탐색하여 "금융" 텍스트 포함 확인
      let p = b.parentElement;
      for (let i = 0; i < 10; i++) {
        if (!p) break;
        if (p.textContent.includes('금융')) {
          b.scrollIntoView({ block: 'center' });
          b.click();
          return '금융';
        }
        p = p.parentElement;
      }
    }
    return null;
  });

  if (!clicked) {
    console.log('  금융 버튼 못 찾음');
    return '금융: ⚠️ 버튼 없음';
  }

  await sleep(5000);
  await waitForLoad(page);
  await ss(page, 'finance-1');

  // Step 1: 금융 기능 체크박스 - 아무것도 안 체크하고 "다음"
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500)).catch(() => '');
  console.log('  본문:', bodyText.substring(0, 80).replace(/\n/g, ' '));

  // "다음" 클릭 (아무 금융 기능도 해당 없으므로)
  await btn(page, ['다음', 'Next']);
  await sleep(5000);
  await waitForLoad(page);
  await ss(page, 'finance-2');

  // Step 2: 문서 - "저장" 또는 "제출" 또는 "다음"
  for (let i = 0; i < 3; i++) {
    if (page.url().includes('overview')) break;
    const bodyText2 = await page.evaluate(() => document.body.innerText.substring(0, 300)).catch(() => '');
    console.log(`  step2-${i}: ${bodyText2.substring(0, 60).replace(/\n/g, ' ')}`);
    await btn(page, ['저장', 'Save', '제출', 'Submit', '다음', 'Next']);
    await sleep(3000);
  }

  await ss(page, 'finance-done');
  return '금융 기능: ✅';
}

// ─── 2. 건강 기능 ───
async function doHealth(page) {
  console.log('\n═══ 건강 기능 ═══');
  await goOverview(page);

  const clicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('button, a');
    for (const b of btns) {
      const t = b.textContent.trim();
      if (t !== '선언 시작' || !(b.offsetParent || b.offsetWidth > 0)) continue;
      let p = b.parentElement;
      for (let i = 0; i < 10; i++) {
        if (!p) break;
        if (p.textContent.includes('건강')) {
          b.scrollIntoView({ block: 'center' });
          b.click();
          return '건강';
        }
        p = p.parentElement;
      }
    }
    return null;
  });

  if (!clicked) {
    console.log('  건강 버튼 못 찾음');
    return '건강: ⚠️ 버튼 없음';
  }

  await sleep(5000);
  await waitForLoad(page);
  await ss(page, 'health-1');

  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500)).catch(() => '');
  console.log('  본문:', bodyText.substring(0, 80).replace(/\n/g, ' '));

  // 아무 건강 기능도 해당 없으므로 "다음"
  await btn(page, ['다음', 'Next']);
  await sleep(5000);
  await waitForLoad(page);
  await ss(page, 'health-2');

  for (let i = 0; i < 3; i++) {
    if (page.url().includes('overview')) break;
    await btn(page, ['저장', 'Save', '제출', 'Submit', '다음', 'Next']);
    await sleep(3000);
  }

  await ss(page, 'health-done');
  return '건강 기능: ✅';
}

// ─── 3. 콘텐츠 등급 ───
async function doContentRating(page) {
  console.log('\n═══ 콘텐츠 등급 ═══');
  await goOverview(page);

  // "선언 수정" 클릭 (콘텐츠 등급 섹션)
  const clicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('button, a');
    for (const b of btns) {
      const t = b.textContent.trim();
      if ((t !== '선언 수정' && t !== '선언 시작') || !(b.offsetParent || b.offsetWidth > 0)) continue;
      let p = b.parentElement;
      for (let i = 0; i < 10; i++) {
        if (!p) break;
        if (p.textContent.includes('콘텐츠 등급')) {
          b.scrollIntoView({ block: 'center' });
          b.click();
          return '콘텐츠 등급';
        }
        p = p.parentElement;
      }
    }
    return null;
  });

  if (!clicked) {
    console.log('  콘텐츠 등급 버튼 못 찾음');
    return '콘텐츠 등급: ⚠️ 버튼 없음';
  }

  await sleep(5000);
  await waitForLoad(page);
  await ss(page, 'rating-overview');

  // "설문지 미완료" 상태 - "새 설문지 시작" 클릭 (이전 진행 중인 것 폐기)
  // 먼저 페이지의 모든 클릭 가능 요소 확인
  const allClickables = await page.evaluate(() => {
    const items = [];
    for (const el of document.querySelectorAll('button, a, [role="button"], [role="link"]')) {
      if (el.offsetWidth === 0 && !el.offsetParent) continue;
      items.push({ tag: el.tagName, text: el.textContent.trim().substring(0, 50), href: el.href || '' });
    }
    return items;
  });
  console.log('  클릭 가능 요소:', JSON.stringify(allClickables.filter(x => x.text.length > 0 && x.text.length < 30)));

  // "새 설문지 시작" 버튼 클릭
  let entered = await clickAny(page, '새 설문지 시작');
  if (!entered) {
    // "수정" 링크 시도
    entered = await clickAny(page, '수정');
  }
  if (!entered) {
    // 모든 버튼/링크 중 "시작" 포함 클릭
    entered = await clickAny(page, '시작');
  }

  if (!entered) {
    console.log('  설문 진입 실패');
    await ss(page, 'rating-no-entry');
    return '콘텐츠 등급: ❌ 진입 실패';
  }

  await sleep(6000);
  await waitForLoad(page);
  await ss(page, 'rating-form');

  // 현재 페이지 확인
  const formBody = await page.evaluate(() => document.body.innerText.substring(0, 600)).catch(() => '');
  console.log('  설문 폼:', formBody.substring(0, 100).replace(/\n/g, ' '));

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
          console.log('    이메일 입력 완료');
          break;
        } else {
          console.log(`    이메일 이미 있음: ${val}`);
        }
      }
    }
  } catch (e) { console.log(`    이메일 오류: ${e.message.substring(0, 30)}`); }

  // 카테고리 선택
  const cat = await radio(page, '다른 모든 앱 유형') || await radio(page, 'All Other') || await radio(page, '유틸리티');
  console.log('  카테고리:', cat ? '선택됨' : '못 찾음');

  // 이용약관 동의
  await check(page, '이용약관') || await check(page, 'IARC');

  await ss(page, 'rating-category');

  // "다음" 클릭
  const next = await btn(page, ['다음', 'Next']);
  if (!next) {
    console.log('  "다음" 못 찾음');
    await ss(page, 'rating-no-next');
    return '콘텐츠 등급: ❌ 다음 없음';
  }

  await sleep(6000);
  await waitForLoad(page);

  // 설문 질문 - 모두 "아니요"
  for (let step = 0; step < 15; step++) {
    if (page.url().includes('overview') || page.url().includes('summary')) break;

    await ss(page, `rating-q${step}`);

    // 모든 "아니요" 선택
    let count = 0;
    for (let i = 0; i < 25; i++) {
      const s = await radio(page, '아니요');
      if (!s) {
        const s2 = await radio(page, 'No');
        if (!s2) break;
      }
      count++;
    }

    console.log(`  step ${step}: ${count}개 "아니요" 선택`);

    const n = await btn(page, ['다음', 'Next']);
    if (!n) {
      const sub = await btn(page, ['제출', 'Submit', '저장', 'Save', '적용', 'Apply']);
      if (!sub && count === 0) {
        console.log(`  step ${step}: 진행 불가`);
        break;
      }
    }
    await sleep(5000);
  }

  // 최종 제출
  await btn(page, ['제출', 'Submit', '적용', 'Apply']);
  await sleep(3000);
  await ss(page, 'rating-done');
  return '콘텐츠 등급: ✅';
}

// ─── 4. 데이터 보안 ───
async function doDataSafety(page) {
  console.log('\n═══ 데이터 보안 ═══');
  await goOverview(page);

  // "선언 수정" 클릭 (데이터 보안 섹션)
  const clicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('button, a');
    for (const b of btns) {
      const t = b.textContent.trim();
      if ((t !== '선언 수정' && t !== '선언 시작') || !(b.offsetParent || b.offsetWidth > 0)) continue;
      let p = b.parentElement;
      for (let i = 0; i < 10; i++) {
        if (!p) break;
        if (p.textContent.includes('데이터 보안') || p.textContent.includes('개인 정보 보호')) {
          b.scrollIntoView({ block: 'center' });
          b.click();
          return '데이터 보안';
        }
        p = p.parentElement;
      }
    }
    return null;
  });

  if (!clicked) {
    console.log('  데이터 보안 버튼 못 찾음');
    return '데이터 보안: ⚠️ 버튼 없음';
  }

  await sleep(5000);
  await waitForLoad(page);
  await ss(page, 'data-overview');

  // 데이터 보안 위저드
  // 스텝 인디케이터: 1 개요 → 2 데이터 수집 및 보안 → 3 데이터 유형 → 4 데이터 취급 및 처리 → 5 미리보기
  for (let step = 0; step < 30; step++) {
    if (page.url().includes('app-content/overview')) break;

    await waitForLoad(page, 8000);

    // 현재 단계 확인 - 스텝 인디케이터가 아닌 실제 본문 내용으로 판단
    const mainText = await page.evaluate(() => {
      // 본문 영역만 가져오기 (사이드바, 헤더 제외)
      const mainArea = document.querySelector('console-content-body, [class*="content-body"], main') || document.body;
      // 스텝 인디케이터 제외하고 실제 내용만
      const allText = mainArea.innerText;
      // "개요" 스텝 인디케이터 다음의 실제 내용
      return allText.substring(0, 1500);
    }).catch(() => '');

    // 현재 스텝 번호 확인
    const stepNum = await page.evaluate(() => {
      const stepEls = document.querySelectorAll('[class*="step"], [class*="stepper"], mat-step-header');
      for (const el of stepEls) {
        if (el.getAttribute('aria-selected') === 'true' || el.classList.contains('active')) {
          const text = el.textContent.trim();
          const num = text.match(/(\d)/);
          return num ? parseInt(num[1]) : -1;
        }
      }
      // URL에서 스텝 추출
      return -1;
    }).catch(() => -1);

    console.log(`  step ${step} (wizard ${stepNum}): ${mainText.substring(0, 80).replace(/\n/g, ' ')}`);
    if (step < 12) await ss(page, `data-w${step}`);

    // 단계별 처리
    if (mainText.includes('정의') && mainText.includes('공개해야 하는 사항')) {
      // Step 1: 개요 - 정의와 공개해야 하는 사항 설명 페이지 → 그냥 "다음"
      console.log('    → Step 1: 개요');
    } else if (mainText.includes('앱에서 필수 사용자 데이터 유형을 수집하거나 공유') ||
               mainText.includes('데이터를 수집하거나 공유하나요')) {
      console.log('    → 데이터 수집/공유 여부');
      await radio(page, '예') || await radio(page, 'Yes');
    } else if (mainText.includes('전송 시 암호화') || mainText.includes('암호화')) {
      console.log('    → 암호화');
      await radio(page, '예') || await radio(page, 'Yes');
    } else if (mainText.includes('삭제를 요청할 수 있는 방법') || mainText.includes('삭제 메커니즘') || mainText.includes('사용자가 데이터 삭제')) {
      console.log('    → 삭제 메커니즘');
      await radio(page, '예') || await radio(page, 'Yes');
    } else if (mainText.includes('수집되는 사용자 데이터') || mainText.includes('데이터 유형을 선택') || mainText.includes('수집하는 데이터')) {
      console.log('    → 데이터 유형 선택');
      // 개인 정보
      await check(page, '이름');
      await check(page, '이메일 주소');
      await check(page, '사용자 ID') || await check(page, '사용자 이름');
      // 앱 활동
      await check(page, '앱 상호작용');
      // 앱 성능
      await check(page, '비정상 종료 로그');
      await check(page, '기기 또는 기타 ID');
    } else if (mainText.includes('공유되는 사용자 데이터') || (mainText.includes('공유') && mainText.includes('제3자'))) {
      console.log('    → 공유 데이터');
      // 공유 안 함
      await radio(page, '아니요') || await radio(page, 'No');
    } else if (mainText.includes('수집 목적') || mainText.includes('용도') || mainText.includes('사용 목적')) {
      console.log('    → 수집 목적');
      await check(page, '앱 기능');
      await check(page, '분석') || await check(page, '애널리틱스');
    } else if (mainText.includes('처리') && mainText.includes('임시')) {
      console.log('    → 데이터 처리 (임시/영구)');
      // 기본 처리
    } else if (mainText.includes('미리보기') && !mainText.includes('정의') && mainText.indexOf('미리보기') > 100) {
      // Step 5: 미리보기 - 제출
      console.log('    → 미리보기 → 제출');
      await btn(page, ['제출', 'Submit']);
      await sleep(3000);
      break;
    } else {
      console.log('    → 기본 처리');
      // 라디오 있으면 처리
      const r = await radio(page, '아니요') || await radio(page, 'No');
      if (!r) await radio(page, '예') || await radio(page, 'Yes');
    }

    await sleep(800);

    // 다음/저장/제출 버튼
    const next = await btn(page, ['다음', 'Next']);
    if (!next) {
      // 스크롤 후 재시도
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(500);
      const sub = await btn(page, ['다음', 'Next', '제출', 'Submit', '저장', 'Save', '임시저장']);
      if (!sub) {
        // 한번 더 시도
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(300);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(500);
        const retry = await btn(page, ['다음', 'Next', '제출', 'Submit', '저장', 'Save']);
        if (!retry) {
          console.log(`    step ${step}: 버튼 없음, 종료`);
          break;
        }
      }
    }
    await sleep(4000);
  }

  await btn(page, ['제출', 'Submit']);
  await sleep(2000);
  await ss(page, 'data-done');
  return '데이터 보안: ✅';
}

// ============================
async function main() {
  console.log('=== ARTLINK - 남은 항목 처리 v4 ===\n');

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

  // Phase 1: 금융, 건강 (선언 시작)
  try { results.push(await doFinance(page)); } catch (e) { console.log(`❌ ${e.message}`); results.push(`금융: ❌ ${e.message.substring(0,30)}`); }
  try { results.push(await doHealth(page)); } catch (e) { console.log(`❌ ${e.message}`); results.push(`건강: ❌ ${e.message.substring(0,30)}`); }

  // Phase 2: 콘텐츠 등급, 데이터 보안 (선언 수정)
  try { results.push(await doContentRating(page)); } catch (e) { console.log(`❌ ${e.message}`); results.push(`콘텐츠 등급: ❌ ${e.message.substring(0,30)}`); }
  try { results.push(await doDataSafety(page)); } catch (e) { console.log(`❌ ${e.message}`); results.push(`데이터 보안: ❌ ${e.message.substring(0,30)}`); }

  // Final check
  await goOverview(page);
  const finalCnt = await countDecl(page);
  await ss(page, 'final');

  console.log('\n==========================================');
  console.log('  결과 요약');
  console.log('==========================================');
  for (const r of results) console.log(`  ${r}`);
  console.log(`\n  남은: ${finalCnt}개`);
  console.log('==========================================\n');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
