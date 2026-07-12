#!/usr/bin/env node
/**
 * 데이터 보안 페이지 진단 - 각 스텝의 DOM 구조 파악
 */
import puppeteer from 'puppeteer';

const DEVELOPER_ID = '8820412626693118100';
const APP_ID = '4975271741081347187';
const BASE = `https://play.google.com/console/u/0/developers/${DEVELOPER_ID}/app/${APP_ID}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getWsUrl() {
  const resp = await fetch(`http://127.0.0.1:9222/json/version`);
  return (await resp.json()).webSocketDebuggerUrl;
}

async function ss(page, name) {
  try { await page.screenshot({ path: `/tmp/diag-${name}.png`, fullPage: false }); console.log(`  📸 ${name}`); } catch {}
}

async function diagnoseStep(page, stepName) {
  console.log(`\n─── ${stepName} ───`);
  console.log(`  URL: ${page.url()}`);

  const info = await page.evaluate(() => {
    const result = {};

    // Stepper 상태 확인
    const stepperItems = document.querySelectorAll('material-stepper-step, .mat-stepper-step, [class*="stepper"]');
    result.stepperCount = stepperItems.length;

    // 현재 활성 스텝
    const activeStep = document.querySelector('[class*="active"], [class*="selected"], .mat-step-active');
    result.activeStep = activeStep?.textContent?.trim()?.substring(0, 80) || 'none';

    // 라디오 그룹
    const radioGroups = document.querySelectorAll('[role="radiogroup"]');
    result.radioGroups = [];
    for (const g of radioGroups) {
      const radios = g.querySelectorAll('input[role="radio"], input[type="radio"]');
      const labels = [];
      for (const r of radios) {
        let ff = r.closest('.mdc-form-field, material-radio-button') || r.parentElement;
        labels.push(ff?.textContent?.trim()?.substring(0, 30) || '?');
      }
      const anyChecked = Array.from(radios).some(r => r.checked);
      result.radioGroups.push({ count: radios.length, labels, anyChecked });
    }

    // 체크박스 (모든 종류)
    const checkboxes = document.querySelectorAll('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
    result.checkboxes = [];
    for (const cb of checkboxes) {
      // 라벨 찾기: 형제, 부모
      let label = '';
      const ff = cb.closest('.mdc-form-field, material-checkbox') || cb.parentElement;
      if (ff) label = ff.textContent?.trim()?.substring(0, 60) || '';
      // 부모에서 더 멀리 찾기
      if (!label || label.length < 3) {
        let p = cb.parentElement;
        for (let i = 0; i < 5 && p; i++) {
          const txt = p.textContent?.trim();
          if (txt && txt.length > 3 && txt.length < 200) { label = txt.substring(0, 60); break; }
          p = p.parentElement;
        }
      }
      result.checkboxes.push({
        checked: cb.checked,
        label,
        visible: cb.offsetWidth > 0 || !!cb.offsetParent,
        classes: cb.className.substring(0, 40),
        id: cb.id?.substring(0, 30) || '',
      });
    }

    // 버튼 (debug-id 포함)
    const buttons = document.querySelectorAll('button, [role="button"]');
    result.buttons = [];
    for (const b of buttons) {
      const vis = b.offsetWidth > 0 || !!b.offsetParent;
      if (!vis) continue;
      const debugId = b.getAttribute('debug-id') || '';
      const text = b.textContent?.trim()?.substring(0, 40) || '';
      if (debugId || text.length > 1) {
        result.buttons.push({ debugId, text, disabled: b.disabled });
      }
    }

    // multiple-choice-question 요소 (데이터 유형 선택에 사용될 수 있음)
    const mcqs = document.querySelectorAll('multiple-choice-question, [class*="multiple-choice"]');
    result.mcqCount = mcqs.length;
    result.mcqTexts = [];
    for (const m of mcqs) {
      result.mcqTexts.push(m.textContent?.trim()?.substring(0, 80));
    }

    // accordion/expandable 섹션
    const accordions = document.querySelectorAll('[class*="accordion"], [class*="expandable"], material-expansionpanel, mat-expansion-panel');
    result.accordionCount = accordions.length;
    result.accordionTexts = [];
    for (const a of accordions) {
      const header = a.querySelector('[class*="header"], [role="button"]');
      result.accordionTexts.push(header?.textContent?.trim()?.substring(0, 60) || a.textContent?.trim()?.substring(0, 60));
    }

    // 페이지 본문 텍스트 (처음 1000자)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const texts = []; let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.trim();
      if (t.length > 3) texts.push(t);
    }
    result.pageText = texts.join(' | ').substring(0, 1500);

    return result;
  }).catch(e => ({ error: e.message }));

  console.log(`  Radio Groups: ${info.radioGroups?.length || 0}`);
  for (const g of info.radioGroups || []) {
    console.log(`    ${g.anyChecked ? '✓' : '○'} ${g.count}개: ${JSON.stringify(g.labels)}`);
  }

  console.log(`  Checkboxes: ${info.checkboxes?.length || 0}`);
  for (const cb of info.checkboxes || []) {
    console.log(`    ${cb.checked ? '☑' : '☐'} vis=${cb.visible} "${cb.label}" [${cb.classes}]`);
  }

  console.log(`  Buttons:`);
  for (const b of info.buttons || []) {
    console.log(`    ${b.disabled ? '🔒' : '🔵'} [${b.debugId || '-'}] "${b.text}"`);
  }

  console.log(`  MCQ: ${info.mcqCount || 0}`);
  for (const t of info.mcqTexts || []) {
    console.log(`    → ${t}`);
  }

  console.log(`  Accordions: ${info.accordionCount || 0}`);
  for (const t of info.accordionTexts || []) {
    console.log(`    → ${t}`);
  }

  console.log(`  Text (first 500): ${info.pageText?.substring(0, 500)}`);

  return info;
}

async function main() {
  console.log('=== 데이터 보안 진단 ===\n');

  const wsUrl = await getWsUrl();
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: null,
    protocolTimeout: 180000,
  });

  const pages = await browser.pages();
  let page = pages[0];
  page.setDefaultTimeout(30000);

  // 데이터 보안 페이지 이동
  console.log('데이터 보안 페이지로 이동...');
  await page.goto(`${BASE}/app-content/data-privacy-security`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);

  // Step 0 진단
  await ss(page, 'step0');
  const step0 = await diagnoseStep(page, 'Step 0: 개요');

  // Step 0 → Step 1
  const nextBtn = step0.buttons?.find(b => b.debugId === 'button-next');
  if (nextBtn && !nextBtn.disabled) {
    console.log('\n>> Step 0 → 1 이동 (button-next 클릭)');
    await page.evaluate(() => {
      document.querySelector('[debug-id="button-next"]').click();
    });
    await sleep(5000);
  }

  // Step 1 진단
  await ss(page, 'step1');
  const step1 = await diagnoseStep(page, 'Step 1: 데이터 수집 및 보안');

  // Step 1 → Step 2: 라디오 그룹에 답변 후 이동
  // 미답변 그룹에 첫번째 라디오(예) 선택
  console.log('\n>> Step 1 라디오 답변...');
  await page.evaluate(() => {
    const groups = document.querySelectorAll('[role="radiogroup"]');
    for (const g of groups) {
      const radios = g.querySelectorAll('input[role="radio"], input[type="radio"]');
      const anyChecked = Array.from(radios).some(r => r.checked);
      if (!anyChecked && radios.length >= 1) {
        radios[0].click();
        radios[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }).catch(() => {});
  await sleep(2000);

  // button-next 클릭
  console.log('>> Step 1 → 2 이동');
  await page.evaluate(() => {
    const btn = document.querySelector('[debug-id="button-next"]');
    if (btn && !btn.disabled) btn.click();
  }).catch(() => {});
  await sleep(5000);

  // Step 2 진단
  await ss(page, 'step2');
  const step2 = await diagnoseStep(page, 'Step 2: 데이터 유형');

  // Step 2에서 체크박스 1개 클릭 시도 후 Step 3 이동 시도
  if (step2.checkboxes?.length > 0) {
    console.log('\n>> Step 2 체크박스 1개 테스트 클릭...');
    const clickResult = await page.evaluate(() => {
      const cbs = document.querySelectorAll('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
      for (const cb of cbs) {
        if (!cb.checked && (cb.offsetWidth > 0 || cb.offsetParent)) {
          cb.scrollIntoView({ block: 'center' });
          cb.click();
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          let label = cb.closest('.mdc-form-field, material-checkbox')?.textContent?.trim()?.substring(0, 40) || '';
          return `clicked: ${label}`;
        }
      }
      return 'no unchecked visible checkbox';
    });
    console.log(`  결과: ${clickResult}`);
    await sleep(2000);

    // 다음 버튼 상태 확인
    const nextState = await page.evaluate(() => {
      const btn = document.querySelector('[debug-id="button-next"]');
      if (!btn) return 'not found';
      return btn.disabled ? 'disabled' : 'enabled';
    });
    console.log(`  button-next: ${nextState}`);
  }

  // "이름", "이메일 주소" 등 텍스트 근처 체크박스 클릭 테스트
  console.log('\n>> XPath 체크박스 테스트...');
  for (const text of ['이름', '이메일 주소', '위치']) {
    const result = await page.evaluate((text) => {
      const xpath = document.evaluate(
        `//*[contains(text(), '${text}')]`,
        document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
      );
      const found = [];
      for (let i = 0; i < xpath.snapshotLength; i++) {
        const el = xpath.snapshotItem(i);
        const vis = el.offsetWidth > 0 || !!el.offsetParent;
        const tag = el.tagName;
        const txt = el.textContent.trim().substring(0, 40);

        // 부모 5단계까지 체크박스 찾기
        let cbFound = false;
        let parent = el.parentElement;
        for (let j = 0; j < 8 && parent; j++) {
          const cb = parent.querySelector('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
          if (cb) { cbFound = true; break; }
          parent = parent.parentElement;
        }
        found.push({ tag, txt, vis, cbFound });
      }
      return found;
    }, text);
    console.log(`  "${text}": ${result.length}건`);
    for (const f of result) {
      console.log(`    <${f.tag}> vis=${f.vis} cb=${f.cbFound} "${f.txt}"`);
    }
  }

  await ss(page, 'step2-diag');

  console.log('\n=== 진단 완료 ===');
  console.log('스크린샷: /tmp/diag-*.png');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
