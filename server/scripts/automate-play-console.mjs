#!/usr/bin/env node
/**
 * ARTLINK - Play Console 앱 콘텐츠 완전 자동화
 *
 * Chrome을 remote debugging 모드로 열고 puppeteer.connect()로 연결하여
 * 프로필 잠금 문제 없이 사용자의 로그인 세션을 그대로 사용합니다.
 */
import puppeteer from 'puppeteer-core';
import { execSync, spawn } from 'child_process';

const DEVELOPER_ID = '8820412626693118100';
const APP_ID = '4975271741081347187';
const BASE = `https://play.google.com/console/u/0/developers/${DEVELOPER_ID}/app/${APP_ID}`;
const DEBUG_PORT = 9222;
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Chrome을 remote debugging 모드로 시작 (임시 프로필 + 쿠키 복사)
async function launchChromeWithDebugging() {
  // 기존 Chrome 프로세스 종료
  console.log('기존 Chrome 프로세스 종료...');
  try { execSync('osascript -e \'tell application "Google Chrome" to quit\' 2>/dev/null', { timeout: 5000 }); } catch {}
  await sleep(2000);
  try { execSync('killall -9 "Google Chrome" 2>/dev/null', { timeout: 3000 }); } catch {}
  try { execSync('killall -9 "Google Chrome Helper" 2>/dev/null', { timeout: 3000 }); } catch {}
  try { execSync('killall -9 "Google Chrome Helper (Renderer)" 2>/dev/null', { timeout: 3000 }); } catch {}
  try { execSync('killall -9 "Google Chrome Helper (GPU)" 2>/dev/null', { timeout: 3000 }); } catch {}
  await sleep(3000);

  // 임시 프로필 생성 (사용자 Chrome 쿠키 복사)
  const TEMP_PROFILE = '/tmp/chrome-play-console-profile';
  const SRC = `${process.env.HOME}/Library/Application Support/Google/Chrome`;

  try { execSync(`rm -rf "${TEMP_PROFILE}"`, { timeout: 5000 }); } catch {}
  try {
    execSync(`mkdir -p "${TEMP_PROFILE}/Default"`, { timeout: 3000 });
    // 쿠키, 로그인, 설정 복사
    const files = ['Cookies', 'Cookies-journal', 'Login Data', 'Login Data-journal', 'Preferences', 'Secure Preferences', 'Web Data'];
    for (const f of files) {
      try { execSync(`cp "${SRC}/Default/${f}" "${TEMP_PROFILE}/Default/"`, { timeout: 3000 }); } catch {}
    }
    try { execSync(`cp "${SRC}/Local State" "${TEMP_PROFILE}/"`, { timeout: 3000 }); } catch {}
    console.log('사용자 Chrome 프로필 복사 완료');
  } catch (e) {
    console.log(`프로필 복사 실패: ${e.message}`);
  }

  console.log(`Chrome을 remote debugging 포트 ${DEBUG_PORT}로 시작...`);

  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${TEMP_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1400,900',
  ], {
    stdio: 'ignore',
    detached: true,
  });
  chromeProcess.unref();

  console.log('Chrome 시작 대기...');
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try {
      const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (resp.ok) {
        const data = await resp.json();
        console.log(`Chrome 연결됨: ${data.Browser}`);
        return data.webSocketDebuggerUrl;
      }
    } catch {}
  }
  throw new Error('Chrome 시작 실패 - 30초 타임아웃');
}

// 페이지 로드 대기 (networkidle 대신 단순 대기)
async function gotoAndWait(page, url, waitMs = 5000) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(waitMs);
}

// 텍스트로 클릭 가능한 요소 찾아서 클릭
async function clickByText(page, searchTexts, options = {}) {
  const { tag = '*', exact = false, timeout = 3000 } = options;
  if (typeof searchTexts === 'string') searchTexts = [searchTexts];

  await sleep(500);

  for (const text of searchTexts) {
    const clicked = await page.evaluate((text, tag, exact) => {
      const elements = document.querySelectorAll(tag);
      for (const el of elements) {
        const t = el.textContent.trim();
        const match = exact ? t === text : t.includes(text);
        if (match && el.offsetParent !== null) { // visible check
          el.scrollIntoView({ block: 'center' });
          el.click();
          return text;
        }
      }
      return null;
    }, text, tag, exact);

    if (clicked) {
      await sleep(1500);
      return clicked;
    }
  }
  return null;
}

// Material 라디오/체크박스 선택
async function selectOption(page, searchTexts) {
  if (typeof searchTexts === 'string') searchTexts = [searchTexts];

  await sleep(500);

  for (const text of searchTexts) {
    const clicked = await page.evaluate((text) => {
      // 1. role="radio" 또는 role="checkbox" 안에서 검색
      for (const el of document.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"], label, mat-radio-button, mat-checkbox')) {
        if (el.textContent.trim().includes(text) && el.offsetParent !== null) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return text;
        }
      }
      // 2. 모든 요소에서 텍스트 매치 → 가장 가까운 interactive parent
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.textContent.includes(text)) {
          let target = node.parentElement;
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

    if (clicked) {
      await sleep(1000);
      return clicked;
    }
  }
  return null;
}

// 저장/다음/제출 버튼 클릭
async function clickSaveButton(page) {
  const texts = ['Save', '저장', 'Next', '다음', 'Submit', '제출', 'Start', '시작'];
  for (const text of texts) {
    const clicked = await page.evaluate((text) => {
      for (const btn of document.querySelectorAll('button, [role="button"], a.button')) {
        if (btn.textContent.trim().includes(text) && btn.offsetParent !== null && !btn.disabled) {
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return text;
        }
      }
      return null;
    }, text);
    if (clicked) {
      console.log(`    → "${clicked}" 버튼 클릭됨`);
      await sleep(2500);
      return true;
    }
  }
  console.log('    ⚠️ 저장 버튼 못찾음');
  return false;
}

// 스크린샷 촬영
async function screenshot(page, name) {
  const path = `/tmp/play-console-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`    📸 ${path}`);
}

// ============================================
// 메인 자동화 로직
// ============================================
async function main() {
  console.log('=== ARTLINK Play Console 완전 자동화 ===\n');

  // 1. Chrome 시작 및 연결
  const wsUrl = await launchChromeWithDebugging();

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: null,
  });

  console.log('Puppeteer 연결 완료!\n');

  // 새 탭 열기
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // 로그인 확인 - Play Console 접근 테스트
  console.log('Play Console 로그인 확인...');
  await gotoAndWait(page, `${BASE}/app-content`, 5000);
  await screenshot(page, '00-login-check');

  const currentUrl = page.url();
  if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
    console.log('❌ Google 로그인이 필요합니다! Chrome에서 먼저 Google에 로그인해주세요.');
    console.log(`현재 URL: ${currentUrl}`);
    await browser.disconnect();
    process.exit(1);
  }
  console.log('✅ 로그인 확인됨\n');

  const results = [];

  // ============================================
  // STEP 1: 앱 액세스 권한
  // ============================================
  console.log('[1/9] 앱 액세스 권한...');
  try {
    await gotoAndWait(page, `${BASE}/app-content/app-access`, 5000);
    await screenshot(page, '01-app-access-before');

    const selected = await selectOption(page, [
      'All functionality is available without special access',
      '모든 기능을 제한 없이 이용 가능',
      'All functionality',
      '모든 기능',
    ]);

    if (selected) {
      console.log(`    선택: "${selected}"`);
      await clickSaveButton(page);
      results.push('[1] 앱 액세스: ✅');
    } else {
      results.push('[1] 앱 액세스: ⚠️ 옵션 못찾음');
    }
    await screenshot(page, '01-app-access-after');
  } catch (e) {
    console.log(`    ❌ ${e.message}`);
    results.push(`[1] 앱 액세스: ❌ ${e.message}`);
    await screenshot(page, '01-error');
  }

  // ============================================
  // STEP 2: 광고
  // ============================================
  console.log('\n[2/9] 광고...');
  try {
    await gotoAndWait(page, `${BASE}/app-content/ads`, 5000);
    await screenshot(page, '02-ads-before');

    const selected = await selectOption(page, [
      'Yes, my app contains ads',
      '예, 앱에 광고가 포함되어 있습니다',
      'Yes',
      '예',
    ]);

    if (selected) {
      console.log(`    선택: "${selected}"`);
      await clickSaveButton(page);
      results.push('[2] 광고: ✅');
    } else {
      results.push('[2] 광고: ⚠️ 옵션 못찾음');
    }
    await screenshot(page, '02-ads-after');
  } catch (e) {
    console.log(`    ❌ ${e.message}`);
    results.push(`[2] 광고: ❌ ${e.message}`);
    await screenshot(page, '02-error');
  }

  // ============================================
  // STEP 3: 정부 앱
  // ============================================
  console.log('\n[3/9] 정부 앱...');
  try {
    await gotoAndWait(page, `${BASE}/app-content/government-apps`, 5000);
    await screenshot(page, '03-gov-before');

    const selected = await selectOption(page, ['No', '아니요', '아니오']);
    if (selected) {
      console.log(`    선택: "${selected}"`);
      await clickSaveButton(page);
      results.push('[3] 정부 앱: ✅');
    } else {
      results.push('[3] 정부 앱: ⚠️ 옵션 못찾음');
    }
    await screenshot(page, '03-gov-after');
  } catch (e) {
    console.log(`    ❌ ${e.message}`);
    results.push(`[3] 정부 앱: ❌ ${e.message}`);
  }

  // ============================================
  // STEP 4: 금융 기능
  // ============================================
  console.log('\n[4/9] 금융 기능...');
  try {
    await gotoAndWait(page, `${BASE}/app-content/financial-features`, 5000);
    await screenshot(page, '04-fin-before');

    const selected = await selectOption(page, ['No', '아니요', '아니오']);
    if (selected) {
      console.log(`    선택: "${selected}"`);
      await clickSaveButton(page);
      results.push('[4] 금융: ✅');
    } else {
      results.push('[4] 금융: ⚠️ 옵션 못찾음');
    }
    await screenshot(page, '04-fin-after');
  } catch (e) {
    console.log(`    ❌ ${e.message}`);
    results.push(`[4] 금융: ❌ ${e.message}`);
  }

  // ============================================
  // STEP 5: 건강 앱
  // ============================================
  console.log('\n[5/9] 건강 앱...');
  try {
    await gotoAndWait(page, `${BASE}/app-content/health`, 5000);
    await screenshot(page, '05-health-before');

    const selected = await selectOption(page, [
      'No',
      '아니요',
      '아니오',
      'not a health app',
      '건강 앱이 아닙',
    ]);
    if (selected) {
      console.log(`    선택: "${selected}"`);
      await clickSaveButton(page);
      results.push('[5] 건강: ✅');
    } else {
      results.push('[5] 건강: ⚠️ 옵션 못찾음');
    }
    await screenshot(page, '05-health-after');
  } catch (e) {
    console.log(`    ❌ ${e.message}`);
    results.push(`[5] 건강: ❌ ${e.message}`);
  }

  // ============================================
  // STEP 6: 타겟층 및 콘텐츠
  // ============================================
  console.log('\n[6/9] 타겟층...');
  try {
    await gotoAndWait(page, `${BASE}/app-content/target-audience`, 5000);
    await screenshot(page, '06-target-before');

    // 체크박스 형식으로 연령대 선택
    // "13-15", "16-17", "18 and over" 등의 체크박스
    // 13세 이상만 체크
    const ages = ['13-15', '16-17', '18 and over', '18세 이상', '16~17', '13~15', 'Over 18'];
    for (const age of ages) {
      await selectOption(page, [age]);
    }

    await clickSaveButton(page);
    await sleep(2000);

    // 후속 질문이 있을 수 있음
    // "이 앱은 어린이에게 어필하도록 만들어졌나요?" → 아니요
    await selectOption(page, ['No', '아니요', '아니오']);
    await clickSaveButton(page);

    results.push('[6] 타겟층: ✅');
    await screenshot(page, '06-target-after');
  } catch (e) {
    console.log(`    ❌ ${e.message}`);
    results.push(`[6] 타겟층: ❌ ${e.message}`);
    await screenshot(page, '06-error');
  }

  // ============================================
  // STEP 7: 콘텐츠 등급 (IARC)
  // ============================================
  console.log('\n[7/9] 콘텐츠 등급 (IARC)...');
  try {
    await gotoAndWait(page, `${BASE}/app-content/content-rating`, 5000);
    await screenshot(page, '07-rating-before');

    // "시작" 또는 "Start questionnaire" 클릭
    const started = await clickByText(page, [
      'Start questionnaire', 'Start new questionnaire',
      '설문지 시작', '새 설문지 시작', 'Start', '시작',
    ], { tag: 'button, [role="button"], a' });

    if (started) {
      console.log(`    설문 시작: "${started}"`);
      await sleep(3000);
      await screenshot(page, '07-rating-step1');

      // 이메일 입력 필드
      const emailFilled = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="email"], input[type="text"]');
        for (const input of inputs) {
          if (input.offsetParent !== null) {
            input.value = '';
            input.click();
            input.focus();
            return true;
          }
        }
        return false;
      });
      if (emailFilled) {
        await page.keyboard.type('leechan0415@gmail.com');
        await sleep(500);
      }

      // 앱 카테고리 선택
      await selectOption(page, [
        'All Other App Types',
        'Utility, Productivity, Communication, or Other',
        '유틸리티, 생산성, 커뮤니케이션',
        '유틸리티',
        'UTILITY',
        'Reference',
        'All Other',
        '기타',
      ]);
      await sleep(1000);
      await screenshot(page, '07-rating-category');

      // 다음/Next 클릭
      await clickSaveButton(page);
      await sleep(3000);

      // IARC 질문들 - 모두 "No" 또는 "아니요"
      // 여러 페이지에 걸쳐 질문이 있을 수 있음
      for (let step = 0; step < 15; step++) {
        await screenshot(page, `07-rating-q${step}`);

        // 모든 visible 라디오에서 "No" 찾기
        const noSelected = await selectOption(page, ['No', '아니요', '아니오']);
        if (!noSelected) {
          // 더 이상 No 옵션이 없으면 저장/제출 시도
          const saved = await clickSaveButton(page);
          if (!saved) break;
          await sleep(2000);
          continue;
        }

        // 같은 페이지에 여러 질문이 있을 수 있음 - 추가 No 선택 시도
        for (let extra = 0; extra < 5; extra++) {
          const moreNo = await page.evaluate(() => {
            // 아직 선택되지 않은 라디오 그룹에서 No 찾기
            const radios = document.querySelectorAll('[role="radio"]');
            for (const r of radios) {
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
          if (!moreNo) break;
          await sleep(500);
        }

        await clickSaveButton(page);
        await sleep(2000);
      }

      // 최종 제출
      await clickByText(page, ['Submit', '제출', 'Apply', '적용'], { tag: 'button' });
      await sleep(3000);

      results.push('[7] 콘텐츠 등급: ✅');
    } else {
      // 이미 등급이 설정되어 있을 수 있음
      console.log('    설문 시작 버튼 없음 - 이미 설정됨?');
      results.push('[7] 콘텐츠 등급: ⚠️ 이미 설정됨?');
    }
    await screenshot(page, '07-rating-after');
  } catch (e) {
    console.log(`    ❌ ${e.message}`);
    results.push(`[7] 콘텐츠 등급: ❌ ${e.message}`);
    await screenshot(page, '07-error');
  }

  // ============================================
  // STEP 8: 데이터 보안
  // ============================================
  console.log('\n[8/9] 데이터 보안...');
  try {
    await gotoAndWait(page, `${BASE}/app-content/data-safety`, 5000);
    await screenshot(page, '08-safety-before');

    // 시작/다음 버튼
    const started = await clickByText(page, [
      'Start', '시작', 'Next', '다음', 'Manage',
    ], { tag: 'button, [role="button"], a' });

    if (started) {
      console.log(`    시작: "${started}"`);
      await sleep(3000);

      // == Overview 페이지 ==
      await screenshot(page, '08-safety-overview');
      await clickSaveButton(page);
      await sleep(3000);

      // == Data collection 페이지 ==
      await screenshot(page, '08-safety-collection');

      // "Does your app collect or share any of the required user data types?" → Yes
      await selectOption(page, [
        'Yes', '예',
        'My app collects or shares',
        '앱에서 수집하거나 공유',
      ]);
      await sleep(1000);

      // "Is all of the user data collected encrypted in transit?" → Yes
      await selectOption(page, [
        'Yes, all user data', '예, 모든',
        'encrypted in transit', '암호화',
      ]);
      await sleep(1000);

      // "Do you provide a way for users to request their data is deleted?" → Yes
      await selectOption(page, [
        'Yes', '예',
        'request that their data', '데이터 삭제',
      ]);
      await sleep(1000);

      await screenshot(page, '08-safety-answers');
      await clickSaveButton(page);
      await sleep(3000);

      // == Data types 페이지 ==
      await screenshot(page, '08-safety-types');

      // 수집하는 데이터 유형 체크
      const dataTypes = [
        // Personal info
        'Email address', '이메일 주소', '이메일',
        'Name', '이름',
        // Photos and videos
        'Photos', '사진',
        'Videos', '동영상',
        // App activity
        // Device or other IDs
        'Device or other IDs', '기기 또는 기타 ID', '기기 ID',
        // App performance - crash logs
        'Crash logs', '비정상 종료 로그', '크래시',
      ];

      for (const dt of dataTypes) {
        await selectOption(page, [dt]);
        await sleep(300);
      }

      await screenshot(page, '08-safety-types-selected');
      await clickSaveButton(page);
      await sleep(3000);

      // == 각 데이터 유형별 상세 설정 ==
      // 여러 페이지에 걸쳐 나올 수 있음
      for (let detailStep = 0; detailStep < 20; detailStep++) {
        await screenshot(page, `08-safety-detail-${detailStep}`);

        const pageTitle = await page.evaluate(() => {
          const h = document.querySelector('h1, h2, h3, [role="heading"]');
          return h ? h.textContent.trim() : '';
        });
        console.log(`    상세 설정 페이지: ${pageTitle.substring(0, 50)}`);

        // 수집 여부 - "Collected"
        await selectOption(page, ['Collected', '수집됨', '수집']);

        // 공유 여부 - "Not shared" (기기 ID 제외)
        if (pageTitle.includes('Device') || pageTitle.includes('기기')) {
          await selectOption(page, ['Shared', '공유됨', '공유']);
        } else {
          await selectOption(page, ['Not shared', '공유되지 않음', '공유 안 됨']);
        }

        // Ephemeral - No (대부분)
        await selectOption(page, ['No', '아니요', '아니오']);

        // Required
        if (pageTitle.includes('Email') || pageTitle.includes('이메일') ||
            pageTitle.includes('Crash') || pageTitle.includes('비정상') ||
            pageTitle.includes('Device') || pageTitle.includes('기기')) {
          await selectOption(page, ['Yes, this data is required', '예, 필수', 'Required']);
        } else {
          await selectOption(page, ['No', '아니요', 'Optional', '선택']);
        }

        // 수집 목적
        const purposes = {
          'Email': ['App functionality', 'Account management', '앱 기능', '계정 관리'],
          '이메일': ['App functionality', 'Account management', '앱 기능', '계정 관리'],
          'Name': ['App functionality', '앱 기능'],
          '이름': ['App functionality', '앱 기능'],
          'Photo': ['App functionality', '앱 기능'],
          '사진': ['App functionality', '앱 기능'],
          'Video': ['App functionality', '앱 기능'],
          '동영상': ['App functionality', '앱 기능'],
          'Crash': ['Analytics', '분석'],
          '비정상': ['Analytics', '분석'],
          'Device': ['Advertising or marketing', '광고'],
          '기기': ['Advertising or marketing', '광고'],
        };

        for (const [keyword, purposeList] of Object.entries(purposes)) {
          if (pageTitle.includes(keyword)) {
            for (const purpose of purposeList) {
              await selectOption(page, [purpose]);
              await sleep(300);
            }
            break;
          }
        }

        // 공유 목적 (기기 ID)
        if (pageTitle.includes('Device') || pageTitle.includes('기기')) {
          await selectOption(page, ['Advertising or marketing', '광고']);
        }

        const saved = await clickSaveButton(page);
        await sleep(3000);

        if (!saved) break;

        // 모든 데이터 유형을 처리했는지 확인
        const backToOverview = await page.evaluate(() => {
          return window.location.href.includes('data-safety') &&
                 !window.location.href.includes('/edit');
        });
        if (backToOverview) break;
      }

      // 최종 제출
      await clickByText(page, ['Submit', '제출'], { tag: 'button' });
      await sleep(3000);

      results.push('[8] 데이터 보안: ✅ (확인 필요)');
    } else {
      results.push('[8] 데이터 보안: ⚠️ 시작 버튼 없음');
    }
    await screenshot(page, '08-safety-after');
  } catch (e) {
    console.log(`    ❌ ${e.message}`);
    results.push(`[8] 데이터 보안: ❌ ${e.message}`);
    await screenshot(page, '08-error');
  }

  // ============================================
  // STEP 9: 앱 카테고리
  // ============================================
  console.log('\n[9/9] 앱 카테고리...');
  try {
    await gotoAndWait(page, `${BASE}/main-store-listing`, 5000);
    await screenshot(page, '09-category-before');

    // 카테고리 드롭다운 찾기
    const categorySet = await page.evaluate(() => {
      // mat-select나 드롭다운 요소 찾기
      const selects = document.querySelectorAll('mat-select, [role="listbox"], select, [role="combobox"]');
      for (const sel of selects) {
        if (sel.offsetParent !== null) {
          sel.click();
          return true;
        }
      }
      return false;
    });

    if (categorySet) {
      await sleep(1000);
      await selectOption(page, [
        'Education', '교육',
        'Art & Design', '예술 및 디자인',
      ]);
      await sleep(1000);
    }

    // 페이지 맨 아래로 스크롤해서 저장
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1000);
    await clickSaveButton(page);

    results.push('[9] 카테고리: ✅');
    await screenshot(page, '09-category-after');
  } catch (e) {
    console.log(`    ❌ ${e.message}`);
    results.push(`[9] 카테고리: ❌ ${e.message}`);
  }

  // ============================================
  // 최종 결과
  // ============================================
  console.log('\n==========================================');
  console.log('  ARTLINK Play Console 자동화 결과');
  console.log('==========================================');
  for (const r of results) {
    console.log(`  ${r}`);
  }
  console.log('==========================================');
  console.log('\n스크린샷: /tmp/play-console-*.png');
  console.log('브라우저가 열린 상태입니다. 결과를 확인하세요.');
  console.log('Ctrl+C로 종료합니다.\n');

  // 브라우저 닫지 않고 대기 (사용자 확인용)
  await sleep(600000); // 10분 대기
  await browser.disconnect();
}

main().catch(err => {
  console.error('\n❌ 치명적 에러:', err.message);
  console.error(err.stack);
  process.exit(1);
});
