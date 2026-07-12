#!/usr/bin/env node
/**
 * ARTLINK - 앱 콘텐츠 자동화 스크립트
 *
 * API로 가능한 항목은 자동 처리하고,
 * 수동 항목은 정확한 URL + 입력값 가이드를 생성합니다.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PACKAGE_NAME = 'com.mm00.artlink';
const SA_KEY_PATH = resolve('/Users/leechangyeop/Projects/ArtlinkRN/play-service-account.json');
const DEVELOPER_ID = '8820412626693118100';
const APP_ID = '4975271741081347187';

// Artlink 앱의 데이터 안전 정보 (CSV 형식)
// 실제 Play Console CSV 포맷에 맞춤
const DATA_SAFETY_CSV = `Question ID (human-readable),Question ID (machine-readable),Sub-question ID (machine-readable),Answer ID (machine-readable),Response ID,Answer requirement,Response value
Does your app collect or share any of the required user data types?,PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA,,,,REQUIRED,TRUE
Is all of the user data collected by your app encrypted in transit?,PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT,,,,REQUIRED,TRUE
Do you provide a way for users to request that their data is deleted?,PSL_DATA_COLLECTION_USER_REQUEST_DELETE,,,,REQUIRED,TRUE
Email address,PSL_DATA_TYPE_EMAIL_ADDRESS,,,,MULTIPLE_CHOICE,TRUE
Email address: Collection,PSL_DATA_TYPE_EMAIL_ADDRESS,PSL_DATA_USAGE_COLLECTION,,,REQUIRED,TRUE
Email address: Sharing,PSL_DATA_TYPE_EMAIL_ADDRESS,PSL_DATA_USAGE_SHARING,,,REQUIRED,FALSE
Email address: Ephemeral,PSL_DATA_TYPE_EMAIL_ADDRESS,PSL_DATA_USAGE_COLLECTION,DATA_COLLECTION_EPHEMERAL,,OPTIONAL,FALSE
Email address: Required,PSL_DATA_TYPE_EMAIL_ADDRESS,PSL_DATA_USAGE_COLLECTION,DATA_COLLECTION_REQUIRED,,OPTIONAL,TRUE
Email address: Purpose - App functionality,PSL_DATA_TYPE_EMAIL_ADDRESS,PSL_DATA_USAGE_COLLECTION,COLLECTION_PURPOSE,PURPOSE_APP_FUNCTIONALITY,MULTIPLE_CHOICE,TRUE
Email address: Purpose - Account management,PSL_DATA_TYPE_EMAIL_ADDRESS,PSL_DATA_USAGE_COLLECTION,COLLECTION_PURPOSE,PURPOSE_ACCOUNT_MANAGEMENT,MULTIPLE_CHOICE,TRUE
Name,PSL_DATA_TYPE_NAME,,,,MULTIPLE_CHOICE,TRUE
Name: Collection,PSL_DATA_TYPE_NAME,PSL_DATA_USAGE_COLLECTION,,,REQUIRED,TRUE
Name: Sharing,PSL_DATA_TYPE_NAME,PSL_DATA_USAGE_SHARING,,,REQUIRED,FALSE
Name: Ephemeral,PSL_DATA_TYPE_NAME,PSL_DATA_USAGE_COLLECTION,DATA_COLLECTION_EPHEMERAL,,OPTIONAL,FALSE
Name: Required,PSL_DATA_TYPE_NAME,PSL_DATA_USAGE_COLLECTION,DATA_COLLECTION_REQUIRED,,OPTIONAL,FALSE
Name: Purpose - App functionality,PSL_DATA_TYPE_NAME,PSL_DATA_USAGE_COLLECTION,COLLECTION_PURPOSE,PURPOSE_APP_FUNCTIONALITY,MULTIPLE_CHOICE,TRUE
Photos,PSL_DATA_TYPE_PHOTOS,,,,MULTIPLE_CHOICE,TRUE
Photos: Collection,PSL_DATA_TYPE_PHOTOS,PSL_DATA_USAGE_COLLECTION,,,REQUIRED,TRUE
Photos: Sharing,PSL_DATA_TYPE_PHOTOS,PSL_DATA_USAGE_SHARING,,,REQUIRED,FALSE
Photos: Ephemeral,PSL_DATA_TYPE_PHOTOS,PSL_DATA_USAGE_COLLECTION,DATA_COLLECTION_EPHEMERAL,,OPTIONAL,FALSE
Photos: Required,PSL_DATA_TYPE_PHOTOS,PSL_DATA_USAGE_COLLECTION,DATA_COLLECTION_REQUIRED,,OPTIONAL,FALSE
Photos: Purpose - App functionality,PSL_DATA_TYPE_PHOTOS,PSL_DATA_USAGE_COLLECTION,COLLECTION_PURPOSE,PURPOSE_APP_FUNCTIONALITY,MULTIPLE_CHOICE,TRUE
Videos,PSL_DATA_TYPE_VIDEOS,,,,MULTIPLE_CHOICE,TRUE
Videos: Collection,PSL_DATA_TYPE_VIDEOS,PSL_DATA_USAGE_COLLECTION,,,REQUIRED,TRUE
Videos: Sharing,PSL_DATA_TYPE_VIDEOS,PSL_DATA_USAGE_SHARING,,,REQUIRED,FALSE
Videos: Ephemeral,PSL_DATA_TYPE_VIDEOS,PSL_DATA_USAGE_COLLECTION,DATA_COLLECTION_EPHEMERAL,,OPTIONAL,FALSE
Videos: Required,PSL_DATA_TYPE_VIDEOS,PSL_DATA_USAGE_COLLECTION,DATA_COLLECTION_REQUIRED,,OPTIONAL,FALSE
Videos: Purpose - App functionality,PSL_DATA_TYPE_VIDEOS,PSL_DATA_USAGE_COLLECTION,COLLECTION_PURPOSE,PURPOSE_APP_FUNCTIONALITY,MULTIPLE_CHOICE,TRUE
Crash logs,PSL_DATA_TYPE_CRASH_LOGS,,,,MULTIPLE_CHOICE,TRUE
Crash logs: Collection,PSL_DATA_TYPE_CRASH_LOGS,PSL_DATA_USAGE_COLLECTION,,,REQUIRED,TRUE
Crash logs: Sharing,PSL_DATA_TYPE_CRASH_LOGS,PSL_DATA_USAGE_SHARING,,,REQUIRED,FALSE
Crash logs: Ephemeral,PSL_DATA_TYPE_CRASH_LOGS,PSL_DATA_USAGE_COLLECTION,DATA_COLLECTION_EPHEMERAL,,OPTIONAL,TRUE
Crash logs: Required,PSL_DATA_TYPE_CRASH_LOGS,PSL_DATA_USAGE_COLLECTION,DATA_COLLECTION_REQUIRED,,OPTIONAL,TRUE
Crash logs: Purpose - Analytics,PSL_DATA_TYPE_CRASH_LOGS,PSL_DATA_USAGE_COLLECTION,COLLECTION_PURPOSE,PURPOSE_ANALYTICS,MULTIPLE_CHOICE,TRUE
Device or other IDs,PSL_DATA_TYPE_DEVICE_ID,,,,MULTIPLE_CHOICE,TRUE
Device or other IDs: Collection,PSL_DATA_TYPE_DEVICE_ID,PSL_DATA_USAGE_COLLECTION,,,REQUIRED,TRUE
Device or other IDs: Sharing,PSL_DATA_TYPE_DEVICE_ID,PSL_DATA_USAGE_SHARING,,,REQUIRED,TRUE
Device or other IDs: Ephemeral,PSL_DATA_TYPE_DEVICE_ID,PSL_DATA_USAGE_COLLECTION,DATA_COLLECTION_EPHEMERAL,,OPTIONAL,FALSE
Device or other IDs: Required,PSL_DATA_TYPE_DEVICE_ID,PSL_DATA_USAGE_COLLECTION,DATA_COLLECTION_REQUIRED,,OPTIONAL,TRUE
Device or other IDs: Purpose - Advertising,PSL_DATA_TYPE_DEVICE_ID,PSL_DATA_USAGE_COLLECTION,COLLECTION_PURPOSE,PURPOSE_ADVERTISING,MULTIPLE_CHOICE,TRUE
Device or other IDs: Sharing Purpose - Advertising,PSL_DATA_TYPE_DEVICE_ID,PSL_DATA_USAGE_SHARING,SHARING_PURPOSE,PURPOSE_ADVERTISING,MULTIPLE_CHOICE,TRUE`;

async function getToken() {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    keyFile: SA_KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

async function main() {
  console.log('=== ARTLINK 앱 콘텐츠 자동화 ===\n');

  const token = await getToken();
  console.log('✅ 인증 완료\n');

  // 1. 데이터 안전 (Data Safety) - API 지원됨
  console.log('[1/2] 데이터 안전 설정...');
  try {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/dataSafety`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        safetyLabels: DATA_SAFETY_CSV,
      }),
    });

    if (resp.ok) {
      console.log('  ✅ 데이터 안전 설정 완료!');
    } else {
      const text = await resp.text();
      console.log(`  ⚠️ 데이터 안전 API 응답: ${resp.status}`);
      console.log(`  ${text.substring(0, 200)}`);
      console.log('  → Play Console에서 수동으로 설정 필요');
    }
  } catch (err) {
    console.log(`  ❌ 에러: ${err.message}`);
  }

  // 2. Play Console 직접 URL 가이드 생성
  console.log('\n[2/2] Play Console 수동 설정 가이드 생성...\n');

  const BASE = `https://play.google.com/console/u/0/developers/${DEVELOPER_ID}/app/${APP_ID}`;

  const manualTasks = [
    {
      name: '앱 액세스 권한',
      url: `${BASE}/app-content/app-access`,
      action: '"모든 기능을 제한 없이 이용 가능" 선택 (로그인은 선택사항이므로)',
      note: '로그인 없이도 기본 기능 사용 가능',
    },
    {
      name: '광고',
      url: `${BASE}/app-content/ads`,
      action: '"예, 앱에 광고가 포함되어 있습니다" 선택',
      note: 'AdMob 배너/전면/보상형 광고 사용',
    },
    {
      name: '콘텐츠 등급',
      url: `${BASE}/app-content/content-rating`,
      action: 'IARC 설문 시작 → 카테고리: "유틸리티, 생산성, 커뮤니케이션 등" → 모든 질문 "아니오"',
      note: '폭력/성적/도박 콘텐츠 없음. 예상 등급: 전체이용가(PEGI 3)',
    },
    {
      name: '타겟층',
      url: `${BASE}/app-content/target-audience`,
      action: '"만 13세 이상" 또는 "만 16세~17세" 체크, 아동 제외',
      note: '아동 대상 앱 아님',
    },
    {
      name: '데이터 보안',
      url: `${BASE}/app-content/data-safety`,
      action: '위에서 API 설정 시도. 실패 시 수동으로:\n      - 데이터 수집: 예\n      - 암호화 전송: 예\n      - 삭제 요청: 예\n      - 수집 데이터: 이메일, 이름, 사진, 동영상, 크래시 로그, 기기 ID(광고)\n      - 공유 데이터: 기기 ID(광고용, AdMob)',
      note: '',
    },
    {
      name: '정부 앱',
      url: `${BASE}/app-content/government-apps`,
      action: '"아니오" 선택',
      note: '',
    },
    {
      name: '금융 기능',
      url: `${BASE}/app-content/financial-features`,
      action: '"아니오" 선택 (해당사항 없음)',
      note: '',
    },
    {
      name: '건강 앱',
      url: `${BASE}/app-content/health`,
      action: '"아니오" 선택 (건강 관련 앱 아님)',
      note: '',
    },
    {
      name: '앱 카테고리',
      url: `${BASE}/main-store-listing`,
      action: '카테고리: "교육" 또는 "예술 및 디자인"',
      note: 'main store listing 페이지 하단에 카테고리 선택',
    },
  ];

  console.log('============================================');
  console.log('  PLAY CONSOLE 수동 설정 체크리스트');
  console.log('============================================\n');

  for (let i = 0; i < manualTasks.length; i++) {
    const t = manualTasks[i];
    console.log(`${i + 1}. ${t.name}`);
    console.log(`   URL: ${t.url}`);
    console.log(`   할 일: ${t.action}`);
    if (t.note) console.log(`   참고: ${t.note}`);
    console.log('');
  }

  console.log('============================================');
  console.log('  모든 항목 완료 후 → 비공개 테스트 시작');
  console.log('============================================');
}

main().catch(console.error);
