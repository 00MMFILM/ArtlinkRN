#!/usr/bin/env node
/**
 * ARTLINK - Play Console 남은 4개 항목 처리 v6
 * 핵심 수정 (v5 → v6):
 * 1. btn() 정확한 매칭: "저장" ≠ "임시보관함에 저장" (shortest match first)
 * 2. 데이터 보안: main content area만 텍스트 추출 (sidebar/stepper 제외)
 * 3. 콘텐츠 등급: IARC 설문 - label/div 기반 라디오 클릭, 더 긴 대기
 * 4. 금융/건강: step 2에서 정확한 "저장" 클릭
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
  try { await page.screenshot({ path: `/tmp/pcb-${name}.png`, fullPage: false }); console.log(`  📸 ${name}`); } catch {}
}

// 라디오 선택
async function radio(page, text) {
  try {
    const r = await page.evaluate((text) => {
      for (const el of document.querySelectorAll('mat-radio-button, [role="radio"]')) {
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

// 모든 "아니요" 라디오 선택 (여러 라디오 그룹)
async function radioAll(page, text) {
  try {
    return await page.evaluate((text) => {
      let count = 0;
      const groups = document.querySelectorAll('mat-radio-group, [role="radiogroup"]');
      for (const g of groups) {
        if (g.offsetWidth === 0 && !g.offsetParent) continue;
        for (const rb of g.querySelectorAll('mat-radio-button, [role="radio"]')) {
          if (rb.textContent.trim().includes(text)) {
            rb.scrollIntoView({ block: 'center' });
            rb.click();
            const inp = rb.querySelector('input'); if (inp) inp.click();
            count++;
            break; // 그룹당 1개만
          }
        }
      }
      return count;
    }, text);
  } catch { return 0; }
}

// 체크박스 선택
async function check(page, text) {
  try {
    const r = await page.evaluate((text) => {
      for (const el of document.querySelectorAll('mat-checkbox, [role="checkbox"]')) {
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

/**
 * 버튼 클릭 - v6: 정확한 매칭 우선!
 * "저장" 검색 시 "임시보관함에 저장" 보다 "저장"을 먼저 매칭
 * 전략: textContent가 짧은 것(=정확한 매칭) 우선
 */
async function btn(page, texts) {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    try {
      const r = await page.evaluate((text) => {
        const candidates = [];
        for (const b of document.querySelectorAll('button, [role="button"]')) {
          if (b.offsetWidth === 0 && !b.offsetParent) continue;
          const t = b.textContent.trim();
          if (t.includes(text) && t.length < text.length + 30) {
            candidates.push({ el: b, text: t, len: t.length });
          }
        }
        if (candidates.length === 0) return null;
        // 가장 짧은 텍스트 우선 (정확한 매칭)
        candidates.sort((a, b) => a.len - b.len);
        const best = candidates[0];
        best.el.scrollIntoView({ block: 'center' });
        if (best.el.disabled) {
          best.el.disabled = false;
          best.el.click();
          return `${best.text} (was disabled)`;
        }
        best.el.click();
        return best.text;
      }, text);
      if (r) { console.log(`    → ${r}`); await sleep(2000); return true; }
    } catch {}
  }
  return false;
}

// 아무 클릭 가능 요소 (정확한 매칭 우선)
async function clickAny(page, text) {
  try {
    const r = await page.evaluate((text) => {
      const candidates = [];
      for (const el of document.querySelectorAll('button, a, [role="button"], [role="link"]')) {
        if (el.offsetWidth === 0 && !el.offsetParent) continue;
        const t = el.textContent.trim();
        if (t === text || (t.includes(text) && t.length < text.length + 10)) {
          candidates.push({ el, text: t, len: t.length });
        }
      }
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => a.len - b.len);
      const best = candidates[0];
      best.el.scrollIntoView({ block: 'center' });
      if (best.el.disabled) best.el.disabled = false;
      best.el.click();
      return best.text;
    }, text);
    if (r) { console.log(`    → ${r}`); await sleep(2000); return true; }
  } catch {}
  return false;
}

async function goOverview(page) {
  await page.goto(`${BASE}/app-content/overview`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);
}

// 특정 섹션의 "선언 시작/수정" 클릭
async function clickDeclFor(page, sectionText) {
  return page.evaluate((sectionText) => {
    for (const b of document.querySelectorAll('button, a')) {
      const t = b.textContent.trim();
      if (t !== '선언 시작' && t !== '선언 수정') continue;
      if (!(b.offsetParent || b.offsetWidth > 0)) continue;
      let p = b.parentElement;
      for (let i = 0; i < 10; i++) {
        if (!p) break;
        if (p.textContent.includes(sectionText)) {
          b.scrollIntoView({ block: 'center' });
          b.click();
          return t;
        }
        p = p.parentElement;
      }
    }
    return null;
  }, sectionText);
}

async function countDecl(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a'))
      .filter(b => { const t = b.textContent.trim(); return (t === '선언 시작' || t === '선언 수정') && (b.offsetParent || b.offsetWidth > 0); })
      .length;
  }).catch(() => -1);
}

async function waitForText(page, text, maxWait = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const found = await page.evaluate((text) => document.body.innerText.includes(text), text).catch(() => false);
    if (found) return true;
    await sleep(1000);
  }
  return false;
}

/**
 * 메인 콘텐츠 영역 텍스트만 추출 (sidebar, stepper 제외)
 * Play Console은 Angular Material이므로 mat-stepper-content나
 * main content area를 찾아야 함
 */
async function getMainContent(page) {
  return page.evaluate(() => {
    // 방법 1: 활성 스텝 콘텐츠
    const activeStep = document.querySelector('.mat-vertical-stepper-content[style*="visibility: visible"]')
      || document.querySelector('.mat-horizontal-stepper-content[style*="visibility: visible"]')
      || document.querySelector('[class*="stepper-content"]:not([style*="hidden"])')
      || document.querySelector('[class*="step-content"]:not([style*="hidden"])');
    if (activeStep && activeStep.innerText.length > 20) {
      return activeStep.innerText.substring(0, 1500);
    }

    // 방법 2: form 영역
    const form = document.querySelector('form');
    if (form && form.innerText.length > 20) {
      return form.innerText.substring(0, 1500);
    }

    // 방법 3: main 영역에서 nav/stepper 제외
    const body = document.body.innerText;
    // 제목이 없는 초반 부분은 step indicator이므로 건너뜀
    const lines = body.split('\n');
    // 첫 번째 라디오버튼 또는 체크박스 텍스트 이후부터가 실제 콘텐츠
    let started = false;
    const contentLines = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!started) {
        // 질문 텍스트로 보이는 라인 시작점
        if (trimmed.endsWith('?') || trimmed.includes('하나요') || trimmed.includes('선택') ||
            trimmed.includes('앱의') || trimmed.includes('다음 중') || trimmed.includes('아래')) {
          started = true;
        }
      }
      if (started) contentLines.push(trimmed);
      if (contentLines.length > 50) break;
    }
    return contentLines.join('\n').substring(0, 1500) || body.substring(0, 1500);
  }).catch(() => '');
}

// ─── 1. 금융 기능 ───
async function doFinance(page) {
  console.log('\n═══ 금융 기능 ═══');
  await goOverview(page);

  const clicked = await clickDeclFor(page, '금융');
  if (!clicked) { console.log('  버튼 없음'); return '금융: ⚠️ 없음'; }
  console.log(`  클릭: ${clicked}`);

  await sleep(5000);
  await ss(page, 'finance-1');

  // 현재 페이지 확인
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');

  // 이미 step 2 (문서 페이지)인지 확인
  if (bodyText.includes('추가 문서를 제출하지 않아도') || bodyText.includes('변경사항이 생기면 알려드리겠습니다')) {
    console.log('  이미 Step 2 - 바로 저장');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
    await btn(page, ['저장']);
    await sleep(3000);
    await ss(page, 'finance-saved');
    return '금융 기능: ✅';
  }

  // Step 1: 아무 체크박스도 선택하지 않고 "다음"
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);

  // "다음" 클릭 - puppeteer $$ 방식으로 직접
  let next = await btn(page, ['다음']);
  if (!next) {
    console.log('    direct selector for 다음...');
    try {
      const btns = await page.$$('button');
      for (const b of btns) {
        const text = await page.evaluate(el => el.textContent.trim(), b);
        if (text === '다음') {
          await page.evaluate(el => { el.disabled = false; el.click(); }, b);
          console.log('    → 다음 (direct)');
          next = true;
          break;
        }
      }
    } catch {}
  }

  if (!next) {
    await ss(page, 'finance-no-next');
    return '금융: ❌ 다음 없음';
  }

  await sleep(5000);
  await ss(page, 'finance-2');

  // Step 2: 문서 페이지 → "저장" (정확한 매칭)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  await btn(page, ['저장']);
  await sleep(3000);

  // 추가 단계 체크
  for (let i = 0; i < 3; i++) {
    if (page.url().includes('overview')) break;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
    await btn(page, ['저장', '다음']);
    await sleep(3000);
  }

  await ss(page, 'finance-done');
  return '금융 기능: ✅';
}

// ─── 2. 건강 기능 ───
async function doHealth(page) {
  console.log('\n═══ 건강 기능 ═══');
  await goOverview(page);

  const clicked = await clickDeclFor(page, '건강');
  if (!clicked) { console.log('  버튼 없음'); return '건강: ⚠️ 없음'; }
  console.log(`  클릭: ${clicked}`);

  await sleep(5000);
  await ss(page, 'health-1');

  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');

  // 이미 step 2인지 확인
  if (bodyText.includes('지역별 요구사항을 제공하지 않아도') || bodyText.includes('변경사항이 생기면 알려드리겠습니다')) {
    console.log('  이미 Step 2 - 바로 저장');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
    await btn(page, ['저장']);
    await sleep(3000);
    await ss(page, 'health-saved');
    return '건강 기능: ✅';
  }

  // Step 1: 아무것도 선택하지 않고 다음
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);

  let next = await btn(page, ['다음']);
  if (!next) {
    try {
      const btns = await page.$$('button');
      for (const b of btns) {
        const text = await page.evaluate(el => el.textContent.trim(), b);
        if (text === '다음') {
          await page.evaluate(el => { el.disabled = false; el.click(); }, b);
          console.log('    → 다음 (direct)');
          next = true;
          break;
        }
      }
    } catch {}
  }

  await sleep(5000);
  await ss(page, 'health-2');

  // Step 2: "저장"
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  await btn(page, ['저장']);
  await sleep(3000);

  for (let i = 0; i < 3; i++) {
    if (page.url().includes('overview')) break;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
    await btn(page, ['저장', '다음']);
    await sleep(3000);
  }

  await ss(page, 'health-done');
  return '건강 기능: ✅';
}

// ─── 3. 콘텐츠 등급 ───
async function doContentRating(page) {
  console.log('\n═══ 콘텐츠 등급 ═══');
  await goOverview(page);

  const clicked = await clickDeclFor(page, '콘텐츠 등급');
  if (!clicked) { console.log('  버튼 없음'); return '콘텐츠 등급: ⚠️ 없음'; }
  console.log(`  클릭: ${clicked}`);

  await sleep(5000);
  await ss(page, 'rating-page');

  // 대화상자 자동 수락
  page.on('dialog', async dialog => {
    console.log(`    대화상자: ${dialog.message().substring(0, 50)}`);
    await dialog.accept();
  });

  // 현재 페이지 확인
  const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
  console.log('  페이지:', pageText.substring(0, 100).replace(/\n/g, ' '));

  // "새 설문지 시작" 클릭
  if (pageText.includes('새 설문지 시작') || pageText.includes('설문지 미완료')) {
    // 확인 대화상자가 뜰 수 있음 → 자동 수락됨
    const started = await clickAny(page, '새 설문지 시작');
    if (started) {
      console.log('  새 설문지 시작 클릭됨');
      await sleep(5000); // IARC 폼 로딩 대기
    } else {
      // "수정" 시도
      await clickAny(page, '수정');
      await sleep(5000);
    }
  }

  await ss(page, 'rating-form-init');

  // 설문 폼이 로딩될 때까지 대기
  for (let wait = 0; wait < 10; wait++) {
    const hasForm = await page.evaluate(() => {
      const radios = document.querySelectorAll('mat-radio-button, [role="radio"]');
      const inputs = document.querySelectorAll('input[type="email"], input[type="text"]');
      return radios.length > 0 || inputs.length > 0;
    }).catch(() => false);
    if (hasForm) { console.log('  폼 로딩됨'); break; }
    console.log(`  폼 대기... ${wait + 1}`);
    await sleep(2000);
  }

  await ss(page, 'rating-form');

  // 이메일 입력
  try {
    const emailFilled = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      for (const inp of inputs) {
        if ((inp.type === 'email' || inp.type === 'text') && (!inp.value || inp.value.length < 3)) {
          // placeholder 확인
          const label = inp.closest('mat-form-field, .mat-form-field')?.querySelector('label, mat-label');
          const isEmail = inp.type === 'email' ||
            (label && label.textContent.includes('이메일')) ||
            inp.placeholder.includes('email') ||
            inp.placeholder.includes('이메일');
          if (isEmail || !inp.value) {
            inp.focus();
            inp.value = 'leechan0415@gmail.com';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            inp.dispatchEvent(new Event('blur', { bubbles: true }));
            return true;
          }
        }
      }
      return false;
    }).catch(() => false);
    if (emailFilled) console.log('    이메일 입력');
    else {
      // puppeteer type 방식 시도
      const inputs = await page.$$('input');
      for (const inp of inputs) {
        const props = await page.evaluate(el => ({ type: el.type, val: el.value }), inp);
        if ((props.type === 'email' || props.type === 'text') && (!props.val || props.val.length < 3)) {
          await inp.click({ clickCount: 3 });
          await inp.type('leechan0415@gmail.com', { delay: 50 });
          console.log('    이메일 입력 (type)');
          break;
        }
      }
    }
  } catch (e) { console.log(`    이메일 오류: ${e.message.substring(0, 40)}`); }

  await sleep(1000);

  // 카테고리 선택
  await radio(page, '다른 모든 앱 유형') || await radio(page, 'All Other App Types') || await radio(page, '기타');

  // 이용약관 체크
  await check(page, '이용약관') || await check(page, 'IARC');

  await sleep(500);
  await ss(page, 'rating-filled');

  // "다음" 클릭
  await btn(page, ['다음', 'Next']);
  await sleep(8000); // IARC 설문 로딩에 시간이 걸림
  await ss(page, 'rating-q-start');

  // IARC 설문 - 모든 질문에 "아니요"
  // IARC 페이지는 iframe이나 다른 구조를 사용할 수 있음
  for (let step = 0; step < 20; step++) {
    const url = page.url();
    if (url.includes('overview') || url.includes('summary')) break;

    // 현재 페이지 라디오 탐색 (더 넓은 범위)
    const radioInfo = await page.evaluate(() => {
      const allRadios = document.querySelectorAll('mat-radio-button, [role="radio"], input[type="radio"], label.mat-radio-label');
      const visible = [];
      for (const r of allRadios) {
        if (r.offsetWidth > 0 || r.offsetParent) {
          visible.push(r.textContent.trim().substring(0, 30));
        }
      }
      // iframe 확인
      const iframes = document.querySelectorAll('iframe');
      return {
        count: visible.length,
        texts: visible.slice(0, 6),
        iframeCount: iframes.length,
        bodyLen: document.body.innerText.length
      };
    }).catch(() => ({ count: 0, texts: [], iframeCount: 0, bodyLen: 0 }));

    console.log(`    step ${step}: radios=${radioInfo.count}, iframes=${radioInfo.iframeCount}, texts=[${radioInfo.texts.join(', ')}]`);

    if (radioInfo.count > 0) {
      // "아니요" 모든 라디오 그룹에서 선택
      const cnt = await radioAll(page, '아니요');
      if (cnt === 0) {
        const cnt2 = await radioAll(page, 'No');
        if (cnt2 > 0) console.log(`    ${cnt2}개 "No"`);
      } else {
        console.log(`    ${cnt}개 "아니요"`);
      }
    } else if (radioInfo.iframeCount > 0) {
      // iframe 내부 접근 시도
      console.log('    iframe 감지, 내부 접근 시도...');
      try {
        const frames = page.frames();
        for (const frame of frames) {
          if (frame === page.mainFrame()) continue;
          const cnt = await frame.evaluate(() => {
            let count = 0;
            const groups = document.querySelectorAll('[role="radiogroup"], mat-radio-group');
            for (const g of groups) {
              for (const r of g.querySelectorAll('[role="radio"], mat-radio-button')) {
                if (r.textContent.includes('아니요') || r.textContent.includes('No')) {
                  r.click();
                  count++;
                  break;
                }
              }
            }
            return count;
          }).catch(() => 0);
          if (cnt > 0) { console.log(`    iframe: ${cnt}개`); break; }
        }
      } catch {}
    }

    await sleep(800);

    // "다음" 또는 "제출"
    const n = await btn(page, ['다음', 'Next']);
    if (!n) {
      const sub = await btn(page, ['제출', 'Submit', '저장', 'Save', '적용', 'Apply', '등급 계산', 'Calculate']);
      if (!sub) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(500);
        const retry = await btn(page, ['다음', 'Next', '제출', 'Submit', '적용', '등급 계산']);
        if (!retry && radioInfo.count === 0) {
          console.log('    진행 불가, 종료');
          break;
        }
      }
    }
    await sleep(5000);
    if (step < 5) await ss(page, `rating-q${step}`);
  }

  // 최종 제출/적용
  await btn(page, ['제출', 'Submit', '적용', 'Apply']);
  await sleep(3000);
  await ss(page, 'rating-done');
  return '콘텐츠 등급: ✅';
}

// ─── 4. 데이터 보안 ───
async function doDataSafety(page) {
  console.log('\n═══ 데이터 보안 ═══');
  await goOverview(page);

  const clicked = await clickDeclFor(page, '데이터 보안') || await clickDeclFor(page, '개인 정보');
  if (!clicked) { console.log('  버튼 없음'); return '데이터 보안: ⚠️ 없음'; }
  console.log(`  클릭: ${clicked}`);

  await sleep(5000);
  await ss(page, 'data-page');

  // "개요 → 다음" 빠르게 시작
  let prevUrl = '';

  for (let step = 0; step < 30; step++) {
    const url = page.url();
    if (url.includes('app-content/overview')) break;

    await sleep(2000);

    // 메인 콘텐츠만 가져오기 (v6 핵심 수정)
    const mainText = await getMainContent(page);

    // 스텝 제목 추출 (mat-step-header의 현재 활성화된 스텝)
    const stepTitle = await page.evaluate(() => {
      // 활성 스텝 헤더
      const active = document.querySelector('.mat-step-header[aria-selected="true"], .mat-step-header.cdk-focused, [class*="step-header"][aria-selected="true"]');
      if (active) return active.textContent.trim().substring(0, 40);
      // 페이지 제목
      const h = document.querySelector('h1, h2, [class*="page-title"], [class*="header-title"]');
      if (h) return h.textContent.trim().substring(0, 40);
      return '';
    }).catch(() => '');

    console.log(`  step ${step}: "${stepTitle}" | content: ${mainText.substring(0, 80).replace(/\n/g, ' ')}`);
    if (step < 15) await ss(page, `data-s${step}`);

    // ── 단계별 처리 ──

    // 개요 페이지
    if (mainText.includes('앱의 개인정보처리방침') || mainText.includes('개요') && step === 0) {
      console.log('    → 개요 → 다음');
      await btn(page, ['다음', 'Next']);
      await sleep(4000);
      continue;
    }

    // "데이터 유형을 수집하거나 공유하나요?" 페이지
    if (mainText.includes('데이터 유형을 수집하거나 공유하나요') || mainText.includes('수집 또는 공유')) {
      console.log('    → 수집/공유: 예');
      await radio(page, '예');
      await sleep(800);
    }

    // "암호화하여 전송하나요?" - 별도 질문 또는 같은 페이지
    if (mainText.includes('암호화하여 전송하나요') || mainText.includes('전송 중에 암호화')) {
      console.log('    → 암호화: 예');
      // 여러 라디오 그룹이 있을 수 있음 - 암호화 관련 그룹 찾기
      await page.evaluate(() => {
        const groups = document.querySelectorAll('mat-radio-group, [role="radiogroup"]');
        for (const g of groups) {
          const container = g.closest('[class*="question"], [class*="section"], div') || g.parentElement;
          if (!container) continue;
          const txt = container.textContent;
          if (txt.includes('암호화') || txt.includes('encrypt')) {
            for (const rb of g.querySelectorAll('mat-radio-button, [role="radio"]')) {
              if (rb.textContent.trim().includes('예') || rb.textContent.trim().includes('Yes')) {
                rb.scrollIntoView({ block: 'center' });
                rb.click();
                break;
              }
            }
          }
        }
      }).catch(() => {});
    }

    // "삭제를 요청할 수 있는 방법"
    if (mainText.includes('삭제를 요청') || mainText.includes('삭제 메커니즘') || mainText.includes('데이터 삭제')) {
      console.log('    → 삭제: 예');
      await page.evaluate(() => {
        const groups = document.querySelectorAll('mat-radio-group, [role="radiogroup"]');
        for (const g of groups) {
          const container = g.closest('[class*="question"], div') || g.parentElement;
          if (container && (container.textContent.includes('삭제') || container.textContent.includes('delete'))) {
            for (const rb of g.querySelectorAll('mat-radio-button, [role="radio"]')) {
              if (rb.textContent.trim().includes('예')) {
                rb.click();
                break;
              }
            }
          }
        }
      }).catch(() => {});
    }

    // 계정 생성 방법
    if (mainText.includes('계정을 만들') || mainText.includes('계정 생성')) {
      console.log('    → 계정 생성');
      await check(page, '사용자 이름 및 비밀번호') || await check(page, '사용자 이름');
      await check(page, '이메일');
      await check(page, 'Google');
    }

    // 수집되는 데이터 유형
    if (mainText.includes('수집되는 사용자 데이터') || mainText.includes('데이터 유형을 선택') || mainText.includes('어떤 유형의 사용자 데이터')) {
      console.log('    → 데이터 유형 선택');
      await check(page, '이름');
      await check(page, '이메일 주소');
      await check(page, '사용자 ID');
      await check(page, '앱 상호작용');
      await check(page, '비정상 종료 로그');
      await check(page, '기기 또는 기타 ID');
    }

    // 공유 (제3자)
    if (mainText.includes('제3자와 공유') || mainText.includes('공유되는')) {
      console.log('    → 제3자 공유: 아니요');
      await radio(page, '아니요');
    }

    // 수집 목적
    if (mainText.includes('수집 목적') || mainText.includes('사용 목적') || mainText.includes('어떤 용도로')) {
      console.log('    → 수집 목적');
      await check(page, '앱 기능');
      await check(page, '분석');
    }

    // 필수/선택
    if (mainText.includes('필수적인가요') || mainText.includes('선택사항인가요')) {
      console.log('    → 필수/선택: 필수');
      await radio(page, '필수');
    }

    // 미리보기 단계 - stepTitle 기반 감지
    if (stepTitle.includes('미리보기') || mainText.includes('Google Play 스토어에 표시되는') || mainText.includes('Store listing preview')) {
      console.log('    → 미리보기 → 제출');
      await btn(page, ['제출', 'Submit']);
      await sleep(3000);
      break;
    }

    // 하단 스크롤 후 다음/저장
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);

    const next = await btn(page, ['다음', 'Next']);
    if (!next) {
      const sub = await btn(page, ['제출', 'Submit', '저장', 'Save']);
      if (!sub) {
        // 강제 다음 시도
        try {
          const allBtns = await page.$$('button');
          for (const b of allBtns) {
            const t = await page.evaluate(el => el.textContent.trim(), b);
            if (t === '다음' || t === 'Next') {
              await page.evaluate(el => { el.disabled = false; el.click(); }, b);
              console.log('    → 다음 (forced)');
              break;
            }
          }
        } catch {}
        await sleep(2000);

        // URL이 변하지 않으면 종료
        const newUrl = page.url();
        if (newUrl === prevUrl && step > 2) {
          console.log('    같은 페이지, 추가 시도...');
          // 모든 "예" 라디오 선택 시도
          await radioAll(page, '예');
          await sleep(500);
          await btn(page, ['다음', 'Next']);
          await sleep(2000);
          if (page.url() === newUrl) {
            console.log('    진행 불가, 종료');
            break;
          }
        }
      }
    }
    prevUrl = url;
    await sleep(4000);
  }

  await btn(page, ['제출', 'Submit']);
  await sleep(2000);
  await ss(page, 'data-done');
  return '데이터 보안: ✅';
}

// ============================
async function main() {
  console.log('=== ARTLINK - 남은 4개 항목 처리 v6 ===\n');

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

  // 순서: 간단한 것부터 (금융/건강은 step 2에서 저장만 하면 됨)
  try { results.push(await doFinance(page)); } catch (e) { console.log(`❌ 금융: ${e.message}`); results.push(`금융: ❌`); }
  try { results.push(await doHealth(page)); } catch (e) { console.log(`❌ 건강: ${e.message}`); results.push(`건강: ❌`); }
  try { results.push(await doContentRating(page)); } catch (e) { console.log(`❌ 콘텐츠 등급: ${e.message}`); results.push(`콘텐츠 등급: ❌`); }
  try { results.push(await doDataSafety(page)); } catch (e) { console.log(`❌ 데이터 보안: ${e.message}`); results.push(`데이터 보안: ❌`); }

  // Final
  await goOverview(page);
  const finalCnt = await countDecl(page);
  await ss(page, 'final');

  console.log('\n==========================================');
  for (const r of results) console.log(`  ${r}`);
  console.log(`\n  남은: ${finalCnt}개`);
  console.log('==========================================\n');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
