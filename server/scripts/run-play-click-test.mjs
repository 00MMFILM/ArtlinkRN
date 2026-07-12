#!/usr/bin/env node
/**
 * MDC Web 클릭 방법 테스트
 * - evaluate click vs Puppeteer click vs mouse click
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
  try { await page.screenshot({ path: `/tmp/click-${name}.png`, fullPage: false }); console.log(`  📸 ${name}`); } catch {}
}

async function main() {
  console.log('=== MDC 클릭 테스트 ===\n');

  const wsUrl = await getWsUrl();
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: null,
    protocolTimeout: 180000,
  });

  const pages = await browser.pages();
  let page = pages[0];
  page.setDefaultTimeout(30000);

  // Step 1으로 이동
  console.log('데이터 보안 페이지 이동...');
  await page.goto(`${BASE}/app-content/data-privacy-security`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(5000);

  // Step 0 → 1
  const nextBtn = await page.$('[debug-id="button-next"]');
  if (nextBtn) {
    await nextBtn.click();
    console.log('Step 0 → 1 이동');
    await sleep(5000);
  }

  await ss(page, 'step1-before');

  // 현재 라디오 상태 확인
  const beforeState = await page.evaluate(() => {
    const groups = document.querySelectorAll('[role="radiogroup"]');
    const result = [];
    for (const g of groups) {
      const radios = Array.from(g.querySelectorAll('input[role="radio"], input[type="radio"]'));
      const labels = radios.map(r => {
        const ff = r.closest('.mdc-form-field, material-radio-button') || r.parentElement;
        return (ff?.textContent?.trim()?.substring(0, 40) || '?');
      });
      const checkedIdx = radios.findIndex(r => r.checked);
      result.push({ labels, checkedIdx, count: radios.length });
    }
    return result;
  });

  console.log('\n=== 라디오 그룹 (클릭 전) ===');
  for (let i = 0; i < beforeState.length; i++) {
    console.log(`  Group ${i}: checked=${beforeState[i].checkedIdx}, ${JSON.stringify(beforeState[i].labels)}`);
  }

  // 방법 1: Puppeteer ElementHandle.click() 테스트
  // 2번째 라디오 그룹의 첫번째 라디오를 클릭
  console.log('\n=== 방법 1: Puppeteer ElementHandle.click() ===');

  // 미답변 라디오 그룹 찾기 (radiogroup 안에서 unchecked인 그룹의 첫 라디오)
  const uncheckedRadios = await page.$$eval('[role="radiogroup"]', groups => {
    return groups.map((g, i) => {
      const radios = g.querySelectorAll('input[role="radio"], input[type="radio"]');
      const anyChecked = Array.from(radios).some(r => r.checked);
      if (anyChecked) return null;
      // 첫번째 라디오의 부모 (mdc-radio 또는 material-radio-button)
      const firstRadio = radios[0];
      if (!firstRadio) return null;
      const container = firstRadio.closest('material-radio-button, .mdc-radio, .mdc-form-field');
      const rect = (container || firstRadio).getBoundingClientRect();
      return {
        groupIdx: i,
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        visible: rect.width > 0 && rect.height > 0,
        label: (container || firstRadio.parentElement)?.textContent?.trim()?.substring(0, 40),
      };
    }).filter(Boolean);
  });

  console.log(`  미답변 그룹 ${uncheckedRadios.length}개:`);
  for (const r of uncheckedRadios) {
    console.log(`    Group ${r.groupIdx}: (${r.x.toFixed(0)},${r.y.toFixed(0)}) vis=${r.visible} "${r.label}"`);
  }

  // 각 미답변 그룹에 Puppeteer mouse.click() 사용
  for (const r of uncheckedRadios) {
    if (!r.visible || r.y < 0) {
      // 스크롤 필요
      console.log(`    → 스크롤 (y=${r.y.toFixed(0)})`);
      await page.evaluate((idx) => {
        const groups = document.querySelectorAll('[role="radiogroup"]');
        if (groups[idx]) {
          const firstRadio = groups[idx].querySelector('input[role="radio"]');
          const container = firstRadio?.closest('material-radio-button, .mdc-radio, .mdc-form-field') || firstRadio;
          container?.scrollIntoView({ block: 'center' });
        }
      }, r.groupIdx);
      await sleep(500);

      // 좌표 재계산
      const newCoords = await page.evaluate((idx) => {
        const groups = document.querySelectorAll('[role="radiogroup"]');
        const radios = groups[idx]?.querySelectorAll('input[role="radio"]');
        if (!radios?.length) return null;
        const container = radios[0].closest('material-radio-button, .mdc-radio, .mdc-form-field') || radios[0];
        const rect = container.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }, r.groupIdx);

      if (newCoords) {
        r.x = newCoords.x;
        r.y = newCoords.y;
      }
    }

    console.log(`    → mouse.click(${r.x.toFixed(0)}, ${r.y.toFixed(0)}) for group ${r.groupIdx}`);
    await page.mouse.click(r.x, r.y);
    await sleep(1000);
  }

  await sleep(1000);

  // 클릭 후 라디오 상태 확인
  const afterRadio = await page.evaluate(() => {
    const groups = document.querySelectorAll('[role="radiogroup"]');
    const result = [];
    for (const g of groups) {
      const radios = Array.from(g.querySelectorAll('input[role="radio"], input[type="radio"]'));
      const checkedIdx = radios.findIndex(r => r.checked);
      result.push(checkedIdx);
    }
    return result;
  });
  console.log(`  클릭 후 체크 상태: ${JSON.stringify(afterRadio)}`);

  // 체크박스 테스트 - 첫번째 보이는 체크박스 클릭
  console.log('\n=== 체크박스 Puppeteer click 테스트 ===');

  const cbInfo = await page.evaluate(() => {
    const cbs = document.querySelectorAll('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
    const result = [];
    for (const cb of cbs) {
      if (cb.checked) continue;
      const container = cb.closest('material-checkbox, .mdc-checkbox, .mdc-form-field') || cb.parentElement;
      if (!container) continue;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const label = container.textContent?.trim()?.substring(0, 50) || '';
      result.push({
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        label,
        visible: rect.y > 0 && rect.y < window.innerHeight,
      });
    }
    return result;
  });

  console.log(`  미체크 체크박스 ${cbInfo.length}개:`);
  for (const cb of cbInfo.slice(0, 5)) {
    console.log(`    (${cb.x.toFixed(0)},${cb.y.toFixed(0)}) vis=${cb.visible} "${cb.label}"`);
  }

  // "계정을 만들도록 허용하지 않음" 찾아서 클릭
  const targetCb = cbInfo.find(cb => cb.label.includes('허용하지 않음'));
  if (targetCb) {
    // 스크롤
    await page.evaluate((label) => {
      const cbs = document.querySelectorAll('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
      for (const cb of cbs) {
        const container = cb.closest('material-checkbox, .mdc-checkbox, .mdc-form-field') || cb.parentElement;
        if (container?.textContent?.includes(label.substring(0, 20))) {
          container.scrollIntoView({ block: 'center' });
          return;
        }
      }
    }, targetCb.label);
    await sleep(500);

    // 좌표 재계산 후 클릭
    const newCoords = await page.evaluate((label) => {
      const cbs = document.querySelectorAll('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
      for (const cb of cbs) {
        const container = cb.closest('material-checkbox, .mdc-checkbox, .mdc-form-field') || cb.parentElement;
        if (container?.textContent?.includes(label.substring(0, 20))) {
          const rect = container.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
      }
      return null;
    }, targetCb.label);

    if (newCoords) {
      console.log(`  → mouse.click(${newCoords.x.toFixed(0)}, ${newCoords.y.toFixed(0)}) "${targetCb.label}"`);
      await page.mouse.click(newCoords.x, newCoords.y);
      await sleep(1000);
    }
  } else {
    console.log('  "허용하지 않음" 체크박스 못 찾음. 첫번째 체크박스 시도...');
    if (cbInfo.length > 0) {
      const first = cbInfo[0];
      // 스크롤
      await page.evaluate(() => {
        const cb = document.querySelector('input[role="checkbox"]:not(:checked), input.mdc-checkbox__native-control:not(:checked)');
        if (cb) {
          const container = cb.closest('material-checkbox, .mdc-checkbox, .mdc-form-field') || cb;
          container.scrollIntoView({ block: 'center' });
        }
      });
      await sleep(500);

      const newCoords = await page.evaluate(() => {
        const cb = document.querySelector('input[role="checkbox"]:not(:checked), input.mdc-checkbox__native-control:not(:checked)');
        if (!cb) return null;
        const container = cb.closest('material-checkbox, .mdc-checkbox, .mdc-form-field') || cb;
        const rect = container.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });

      if (newCoords) {
        console.log(`  → mouse.click(${newCoords.x.toFixed(0)}, ${newCoords.y.toFixed(0)}) 첫번째 CB`);
        await page.mouse.click(newCoords.x, newCoords.y);
        await sleep(1000);
      }
    }
  }

  // 체크 결과 확인
  const cbAfter = await page.evaluate(() => {
    const cbs = document.querySelectorAll('input[role="checkbox"], input[type="checkbox"], input.mdc-checkbox__native-control');
    let checked = 0;
    for (const cb of cbs) if (cb.checked) checked++;
    return { total: cbs.length, checked };
  });
  console.log(`  체크 후: ${cbAfter.checked}/${cbAfter.total} checked`);

  // button-next 상태 확인
  const nextState = await page.evaluate(() => {
    const btn = document.querySelector('[debug-id="button-next"]');
    return btn ? (btn.disabled ? 'disabled' : 'enabled') : 'not found';
  });
  console.log(`\n  button-next: ${nextState}`);

  await ss(page, 'step1-after');
  console.log('\n=== 테스트 완료 ===');

  await browser.disconnect();
}

main().catch(e => { console.error('❌:', e.message); process.exit(1); });
