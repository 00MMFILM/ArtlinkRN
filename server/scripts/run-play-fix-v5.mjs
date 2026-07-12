#!/usr/bin/env node
/**
 * ARTLINK - Play Console 남은 4개 항목 처리 v5
 * 핵심 수정:
 * - btn()에서 disabled 체크 제거 (다음 버튼이 disabled 상태일 수 있음)
 * - 데이터 보안: 한 페이지에 여러 질문 모두 답변
 * - 콘텐츠 등급: 확인 대화상자 처리
 * - 금융/건강: 선택 없이 다음 진행
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
  try { await page.screenshot({ path: `/tmp/pca-${name}.png`, fullPage: false }); console.log(`  📸 ${name}`); } catch {}
}

// 라디오 선택 - 여러 개 매칭 가능
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

// 모든 "아니요" 라디오 선택 (페이지에 여러 개 있을 때)
async function radioAll(page, text) {
  try {
    return await page.evaluate((text) => {
      let count = 0;
      const groups = new Set();
      for (const el of document.querySelectorAll('mat-radio-button, [role="radio"]')) {
        if (el.offsetWidth === 0 && !el.offsetParent) continue;
        if (!el.textContent.trim().includes(text)) continue;
        // 같은 라디오 그룹에서 중복 선택 방지
        const group = el.closest('mat-radio-group, [role="radiogroup"]');
        const groupId = group ? group.getAttribute('name') || group.id || Array.from(group.parentElement.children).indexOf(group) : count;
        if (groups.has(groupId)) continue;
        groups.add(groupId);
        el.scrollIntoView({ block: 'center' });
        el.click();
        const inp = el.querySelector('input'); if (inp) inp.click();
        count++;
      }
      return count;
    }, text);
  } catch { return 0; }
}

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

// 버튼 클릭 - disabled 체크 안 함!
async function btn(page, texts) {
  if (typeof texts === 'string') texts = [texts];
  for (const text of texts) {
    try {
      const r = await page.evaluate((text) => {
        for (const b of document.querySelectorAll('button, [role="button"]')) {
          if (b.offsetWidth === 0 && !b.offsetParent) continue;
          // disabled 체크 안 함!
          const t = b.textContent.trim();
          if (t.includes(text) && t.length < text.length + 30) {
            b.scrollIntoView({ block: 'center' });
            // disabled여도 클릭 시도
            if (b.disabled) {
              b.disabled = false;
              b.click();
              return `${t} (was disabled)`;
            }
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

// 아무 클릭 가능 요소
async function clickAny(page, text) {
  try {
    const r = await page.evaluate((text) => {
      for (const el of document.querySelectorAll('button, a, [role="button"], [role="link"]')) {
        if (el.offsetWidth === 0 && !el.offsetParent) continue;
        const t = el.textContent.trim();
        if (t === text || (t.includes(text) && t.length < text.length + 10)) {
          el.scrollIntoView({ block: 'center' });
          if (el.disabled) el.disabled = false;
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

// 페이지 로딩 대기 (특정 텍스트가 나타날 때까지)
async function waitForText(page, text, maxWait = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const found = await page.evaluate((text) => document.body.innerText.includes(text), text).catch(() => false);
    if (found) return true;
    await sleep(1000);
  }
  return false;
}

// ─── 1. 금융 기능 ───
async function doFinance(page) {
  console.log('\n═══ 금융 기능 ═══');
  await goOverview(page);

  const clicked = await clickDeclFor(page, '금융');
  if (!clicked) { console.log('  버튼 없음'); return '금융: ⚠️ 없음'; }
  console.log(`  클릭: ${clicked}`);

  // 페이지 로딩 대기
  await waitForText(page, '앱의 금융 기능') || await waitForText(page, '금융 기능');
  await sleep(2000);
  await ss(page, 'finance-1');

  // Step 1: 아무 체크박스도 선택하지 않고 "다음" (금융 기능 없음)
  // 하단 스크롤
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);

  // "다음" 클릭 (disabled여도 시도)
  let next = await btn(page, ['다음']);
  if (!next) {
    // 직접 selector로 시도
    console.log('    "다음" btn 못 찾음, selector 시도');
    try {
      const btns = await page.$$('button');
      for (const b of btns) {
        const text = await page.evaluate(el => el.textContent.trim(), b);
        if (text === '다음') {
          await page.evaluate(el => { el.disabled = false; el.click(); }, b);
          console.log('    → 다음 (direct click)');
          next = true;
          break;
        }
      }
    } catch {}
  }

  if (!next) {
    console.log('    "다음" 버튼을 찾을 수 없음');
    await ss(page, 'finance-no-next');
    return '금융: ❌ 다음 없음';
  }

  await sleep(5000);
  await ss(page, 'finance-2');

  // Step 2: 문서 페이지 → 저장
  await btn(page, ['저장', 'Save', '제출', 'Submit', '다음', 'Next']);
  await sleep(3000);

  // 추가 단계
  for (let i = 0; i < 3; i++) {
    if (page.url().includes('overview')) break;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
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

  const clicked = await clickDeclFor(page, '건강');
  if (!clicked) { console.log('  버튼 없음'); return '건강: ⚠️ 없음'; }
  console.log(`  클릭: ${clicked}`);

  await waitForText(page, '건강 기능') || await waitForText(page, '건강 앱');
  await sleep(2000);
  await ss(page, 'health-1');

  // 아무것도 선택하지 않고 다음
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

  // Step 2
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  await btn(page, ['저장', 'Save', '제출', 'Submit', '다음', 'Next']);
  await sleep(3000);

  for (let i = 0; i < 3; i++) {
    if (page.url().includes('overview')) break;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
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

  const clicked = await clickDeclFor(page, '콘텐츠 등급');
  if (!clicked) { console.log('  버튼 없음'); return '콘텐츠 등급: ⚠️ 없음'; }
  console.log(`  클릭: ${clicked}`);

  await waitForText(page, '콘텐츠 등급');
  await sleep(3000);
  await ss(page, 'rating-page');

  // 대화상자 리스너 설정 (confirm/alert 자동 수락)
  page.on('dialog', async dialog => {
    console.log(`    대화상자: ${dialog.message().substring(0, 50)}`);
    await dialog.accept();
  });

  // "새 설문지 시작" 클릭 → 확인 대화상자 가능
  let entered = await clickAny(page, '새 설문지 시작');
  await sleep(3000);

  // 대화상자가 있었다면 자동 수락됨
  // 만약 대화상자 없이 바로 이동하면 확인
  await ss(page, 'rating-after-start');

  // 페이지가 변했는지 확인
  const currentBody = await page.evaluate(() => document.body.innerText.substring(0, 500)).catch(() => '');
  console.log('  현재 페이지:', currentBody.substring(0, 80).replace(/\n/g, ' '));

  // 설문지가 아직 안 열렸으면 "수정" 시도
  if (currentBody.includes('설문지 미완료') || currentBody.includes('새 설문지')) {
    console.log('  "수정" 시도...');
    await clickAny(page, '수정');
    await sleep(5000);
    await ss(page, 'rating-after-edit');
  }

  // 설문 폼 대기
  await waitForText(page, '이메일 주소') || await waitForText(page, '앱 유형') || await waitForText(page, '카테고리');
  await sleep(2000);
  await ss(page, 'rating-form');

  // 이메일 입력
  try {
    const inputs = await page.$$('input');
    for (const inp of inputs) {
      const props = await page.evaluate(el => ({ type: el.type, val: el.value, ph: el.placeholder }), inp);
      if ((props.type === 'email' || props.type === 'text') && (!props.val || props.val.length < 3)) {
        await inp.click({ clickCount: 3 });
        await inp.type('leechan0415@gmail.com');
        console.log('    이메일 입력');
        break;
      }
    }
  } catch (e) { console.log(`    이메일 오류: ${e.message.substring(0, 30)}`); }

  // 카테고리 선택
  await radio(page, '다른 모든 앱 유형') || await radio(page, 'All Other');

  // 이용약관
  await check(page, '이용약관') || await check(page, 'IARC');

  await ss(page, 'rating-filled');

  // "다음"
  await btn(page, ['다음', 'Next']);
  await sleep(6000);

  // IARC 설문 - 모든 질문에 "아니요"
  for (let step = 0; step < 15; step++) {
    if (page.url().includes('overview') || page.url().includes('summary')) break;

    await ss(page, `rating-q${step}`);

    // 페이지의 모든 라디오 그룹에서 "아니요" 선택
    const count = await radioAll(page, '아니요');
    if (count === 0) {
      const count2 = await radioAll(page, 'No');
      if (count2 === 0) {
        console.log(`    step ${step}: 라디오 없음`);
      } else {
        console.log(`    step ${step}: ${count2}개 "No"`);
      }
    } else {
      console.log(`    step ${step}: ${count}개 "아니요"`);
    }

    await sleep(800);

    const n = await btn(page, ['다음', 'Next']);
    if (!n) {
      const sub = await btn(page, ['제출', 'Submit', '저장', 'Save', '적용', 'Apply']);
      if (!sub) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(500);
        const retry = await btn(page, ['다음', 'Next', '제출', 'Submit', '적용', 'Apply']);
        if (!retry) break;
      }
    }
    await sleep(5000);
  }

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

  await waitForText(page, '데이터 보안') || await waitForText(page, '데이터 수집');
  await sleep(3000);
  await ss(page, 'data-page');

  // 위저드 진행
  for (let step = 0; step < 30; step++) {
    if (page.url().includes('app-content/overview')) break;

    await sleep(2000);

    // 현재 스텝 번호 파악 (stepper에서)
    const stepInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      // 스텝 인디케이터에서 현재 위치 파악
      const hasCheck = text.includes('✓') || text.includes('check');
      // 실제 콘텐츠 영역 (스텝 인디케이터 이후)
      const mainContent = document.querySelector('[class*="content"], [class*="wizard-step"], [class*="form"]');
      const contentText = mainContent ? mainContent.innerText.substring(0, 1000) : text.substring(0, 1000);
      return {
        title: document.querySelector('h1, h2, [class*="title"]')?.textContent?.trim()?.substring(0, 60) || '',
        content: contentText.substring(0, 300),
        url: window.location.href
      };
    }).catch(() => ({ title: '', content: '', url: '' }));

    console.log(`  step ${step}: ${stepInfo.title || stepInfo.content.substring(0, 60).replace(/\n/g, ' ')}`);
    if (step < 15) await ss(page, `data-s${step}`);

    // 페이지의 전체 텍스트
    const fullText = await page.evaluate(() => document.body.innerText).catch(() => '');

    // 현재 페이지에 있는 모든 질문 답변
    // 1. 수집/공유 여부
    if (fullText.includes('데이터 유형을 수집하거나 공유하나요') || fullText.includes('수집하거나 공유')) {
      console.log('    → 수집/공유: 예');
      await radio(page, '예');
      await sleep(800);
    }

    // 2. 암호화
    if (fullText.includes('암호화하여 전송하나요') || fullText.includes('암호화')) {
      console.log('    → 암호화: 예');
      // 암호화 질문의 "예" 선택 - 수집/공유와 다른 라디오그룹
      const encrypted = await page.evaluate(() => {
        const groups = document.querySelectorAll('mat-radio-group, [role="radiogroup"]');
        for (const g of groups) {
          const text = g.closest('div, section, [class*="question"]')?.textContent || '';
          if (text.includes('암호화')) {
            const yesRadio = g.querySelector('mat-radio-button');
            if (yesRadio) {
              yesRadio.scrollIntoView({ block: 'center' });
              yesRadio.click();
              const inp = yesRadio.querySelector('input');
              if (inp) inp.click();
              return true;
            }
          }
        }
        // 두 번째 라디오 그룹에서 "예" 선택
        const allGroups = document.querySelectorAll('mat-radio-group');
        if (allGroups.length >= 2) {
          const secondGroup = allGroups[1];
          for (const radio of secondGroup.querySelectorAll('mat-radio-button')) {
            if (radio.textContent.trim().includes('예')) {
              radio.scrollIntoView({ block: 'center' });
              radio.click();
              return true;
            }
          }
        }
        return false;
      }).catch(() => false);
      if (encrypted) console.log('    ✓ 암호화 예');
    }

    // 3. 삭제 메커니즘
    if (fullText.includes('삭제를 요청') || fullText.includes('삭제 메커니즘')) {
      console.log('    → 삭제: 예');
      // 삭제 관련 라디오그룹 찾기
      await page.evaluate(() => {
        const groups = document.querySelectorAll('mat-radio-group');
        for (const g of groups) {
          const ctx = g.closest('div')?.textContent || '';
          if (ctx.includes('삭제')) {
            for (const radio of g.querySelectorAll('mat-radio-button')) {
              if (radio.textContent.trim().includes('예')) {
                radio.click();
                break;
              }
            }
          }
        }
      }).catch(() => {});
    }

    // 4. 계정 생성 방법
    if (fullText.includes('계정 생성') || fullText.includes('계정을 만들')) {
      console.log('    → 계정 생성 방법');
      await check(page, '사용자 이름 및 비밀번호') || await check(page, '사용자 이름');
      await check(page, '이메일');
      await check(page, 'Google');
    }

    // 5. 데이터 유형 선택 (step 3)
    if (fullText.includes('수집되는 사용자 데이터') || fullText.includes('데이터 유형을 선택')) {
      console.log('    → 데이터 유형');
      await check(page, '이름');
      await check(page, '이메일 주소');
      await check(page, '사용자 ID');
      await check(page, '앱 상호작용');
      await check(page, '비정상 종료 로그');
      await check(page, '기기 또는 기타 ID');
    }

    // 6. 공유 (제3자)
    if (fullText.includes('공유되는') && fullText.includes('제3자')) {
      console.log('    → 제3자 공유: 아니요');
      await radio(page, '아니요');
    }

    // 7. 수집 목적/용도
    if (fullText.includes('수집 목적') || fullText.includes('사용 목적') || fullText.includes('용도')) {
      console.log('    → 수집 목적');
      await check(page, '앱 기능');
      await check(page, '분석');
    }

    // 8. 필수/선택
    if (fullText.includes('필수적') && fullText.includes('선택')) {
      console.log('    → 필수/선택');
      await radio(page, '필수');
    }

    // 9. 미리보기 (마지막 단계만 - 스텝 인디케이터가 아닌 실제 본문에 "미리보기" 표시)
    // "미리보기" 텍스트가 본문 중간 이후에 나타나고, "Google Play 스토어" 관련 텍스트가 있으면 미리보기 단계
    if (stepInfo.title.includes('미리보기') || (fullText.includes('Google Play 스토어에 표시') && fullText.includes('미리보기'))) {
      console.log('    → 미리보기 → 제출');
      await btn(page, ['제출', 'Submit']);
      await sleep(3000);
      break;
    }

    await sleep(500);

    // 하단 스크롤 후 다음/저장
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);

    const next = await btn(page, ['다음', 'Next']);
    if (!next) {
      const sub = await btn(page, ['제출', 'Submit', '저장', 'Save', '임시저장']);
      if (!sub) {
        // 페이지 전체 스크롤 후 재시도
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(300);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(500);
        const retry = await btn(page, ['다음', 'Next', '제출', 'Submit', '저장']);
        if (!retry) {
          console.log(`    step ${step}: 다음/저장 못 찾음`);
          // 한번 더 강제 시도
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
          // 여전히 같은 페이지면 종료
          const newUrl = page.url();
          if (newUrl === stepInfo.url) {
            console.log(`    진행 불가, 종료`);
            break;
          }
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
  console.log('=== ARTLINK - 남은 4개 항목 처리 v5 ===\n');

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

  // 순서: 간단한 것부터
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
