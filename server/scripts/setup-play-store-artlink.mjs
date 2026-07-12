#!/usr/bin/env node
/**
 * ARTLINK Google Play 전체 자동화 스크립트
 * - 스토어 등록정보 10개 언어
 * - 앱 카테고리 + 연락처
 * - 스크린샷 업로드
 * - 앱 아이콘 + 피처 그래픽
 */
import { readFileSync, readdirSync, createReadStream } from 'fs';
import { resolve, join } from 'path';

const PACKAGE_NAME = 'com.mm00.artlink';
const SA_KEY_PATH = resolve('/Users/leechangyeop/Projects/ArtlinkRN/play-service-account.json');
const PRIVACY_URL = 'https://artlink-server.vercel.app/privacy';
const CONTACT_EMAIL = 'leechan0415@gmail.com';
const SCREENSHOTS_DIR = '/Users/leechangyeop/Desktop/아트링크/Artlink_Screenshots_EN';
const ICON_PATH = '/Users/leechangyeop/Desktop/아트링크/google_play_icon_512.png';
const FEATURE_PATH = '/Users/leechangyeop/Desktop/아트링크/google_play_feature_graphic.png';

// 10개 언어 스토어 등록정보
const ALL_LISTINGS = [
  {
    language: 'en-US',
    title: 'Artlink - AI Coach for Artists',
    shortDescription: 'AI coaching for acting, music, dance, art, writing, film, and more.',
    fullDescription: `Artlink is your AI-powered practice coach for every kind of artist — actors, musicians, dancers, visual artists, writers, filmmakers, and more.

SMART PRACTICE NOTES
Record your practice sessions with structured notes. Tag by field (acting, music, dance, etc.), attach photos or videos for AI analysis, and track your progress over time.

AI COACHING & FEEDBACK
Get instant, personalized feedback on your practice. Upload a monologue video, a musical performance, a dance clip, or artwork — Artlink's AI analyzes it and gives you specific, actionable coaching tips.

GROWTH TRACKING
See how you've improved over time. Artlink tracks your practice streaks, analyzes patterns, and shows your growth trajectory so you can stay motivated.

COMMUNITY
Connect with fellow artists. Share your work, get feedback from the community, and discover new techniques and inspiration.

KEY FEATURES
• AI-powered practice analysis and coaching
• Structured practice notes with media attachments
• Growth tracking and streak monitoring
• Community feed for sharing and feedback
• Support for 10+ artistic fields
• Available in 10 languages

FREE TO USE
All core features are free. Start improving your art today.`,
  },
  {
    language: 'ko-KR',
    title: '아트링크 - AI 아티스트 코치',
    shortDescription: '연기, 음악, 무용, 미술, 글쓰기, 영화 등 모든 예술 분야의 AI 코칭',
    fullDescription: `아트링크는 모든 예술가를 위한 AI 연습 코치입니다 — 배우, 음악가, 무용수, 미술가, 작가, 영화인 등 모든 분야를 지원합니다.

스마트 연습 노트
체계적인 노트로 연습을 기록하세요. 분야별 태그(연기, 음악, 무용 등), 사진/영상 첨부 AI 분석, 시간에 따른 성장 추적이 가능합니다.

AI 코칭 & 피드백
연습에 대한 즉각적이고 맞춤화된 피드백을 받으세요. 독백 영상, 음악 연주, 댄스 영상, 작품 사진을 업로드하면 AI가 분석하고 구체적인 코칭 팁을 제공합니다.

성장 추적
시간에 따른 성장을 확인하세요. 연습 스트릭, 패턴 분석, 성장 궤적을 보여줘서 동기부여를 유지할 수 있습니다.

커뮤니티
동료 예술가들과 소통하세요. 작업물을 공유하고, 커뮤니티 피드백을 받고, 새로운 기법과 영감을 발견하세요.

주요 기능
• AI 기반 연습 분석 및 코칭
• 미디어 첨부 가능한 체계적 연습 노트
• 성장 추적 및 스트릭 모니터링
• 공유와 피드백을 위한 커뮤니티 피드
• 10개 이상 예술 분야 지원
• 10개 언어 지원

무료 사용
모든 핵심 기능은 무료입니다. 지금 바로 시작하세요.`,
  },
  {
    language: 'ja-JP',
    title: 'Artlink - AIアーティストコーチ',
    shortDescription: '演技、音楽、ダンス、美術、執筆、映画など、あらゆる芸術分野のAIコーチング',
    fullDescription: `Artlinkは、すべてのアーティストのためのAI練習コーチです。俳優、ミュージシャン、ダンサー、ビジュアルアーティスト、ライター、映画制作者など、あらゆる分野をサポートします。

スマート練習ノート
構造化されたノートで練習を記録。分野別タグ（演技、音楽、ダンスなど）、写真・動画添付によるAI分析、時間経過に伴う成長追跡が可能です。

AIコーチング＆フィードバック
練習に対する即座のパーソナライズされたフィードバックを受け取れます。モノローグ動画、音楽演奏、ダンスクリップ、アート作品をアップロードすると、AIが分析して具体的なコーチングを提供します。

成長トラッキング
時間の経過とともにどれだけ上達したかを確認。練習ストリーク、パターン分析、成長軌跡を表示してモチベーションを維持できます。

コミュニティ
仲間のアーティストとつながりましょう。作品を共有し、コミュニティからフィードバックをもらい、新しいテクニックやインスピレーションを発見しましょう。

主な機能
• AI搭載の練習分析とコーチング
• メディア添付可能な構造化された練習ノート
• 成長トラッキングとストリーク管理
• 共有とフィードバックのためのコミュニティフィード
• 10以上の芸術分野をサポート
• 10言語対応

無料で利用可能
すべてのコア機能は無料です。今日からアートの向上を始めましょう。`,
  },
  {
    language: 'zh-CN',
    title: 'Artlink - AI艺术家教练',
    shortDescription: '表演、音乐、舞蹈、美术、写作、电影等所有艺术领域的AI辅导',
    fullDescription: `Artlink是面向所有艺术家的AI练习教练——演员、音乐家、舞者、视觉艺术家、作家、电影人等，支持所有领域。

智能练习笔记
用结构化笔记记录你的练习。按领域标签（表演、音乐、舞蹈等）分类，附加照片或视频进行AI分析，跟踪你的成长轨迹。

AI辅导与反馈
获得即时、个性化的练习反馈。上传独白视频、音乐演奏、舞蹈片段或艺术作品，Artlink的AI会分析并提供具体的辅导建议。

成长追踪
查看你随时间的进步。Artlink追踪你的练习连续天数、分析模式，展示你的成长轨迹，帮助你保持动力。

社区
与其他艺术家交流。分享你的作品，获得社区反馈，发现新技巧和灵感。

核心功能
• AI驱动的练习分析和辅导
• 支持媒体附件的结构化练习笔记
• 成长追踪和连续练习监控
• 用于分享和反馈的社区动态
• 支持10+艺术领域
• 提供10种语言

免费使用
所有核心功能免费。今天就开始提升你的艺术吧。`,
  },
  {
    language: 'zh-TW',
    title: 'Artlink - AI藝術家教練',
    shortDescription: '表演、音樂、舞蹈、美術、寫作、電影等所有藝術領域的AI指導',
    fullDescription: `Artlink是為所有藝術家打造的AI練習教練——演員、音樂家、舞者、視覺藝術家、作家、電影人等，支援所有領域。

智慧練習筆記
用結構化筆記記錄你的練習。依領域標籤（表演、音樂、舞蹈等）分類，附加照片或影片進行AI分析，追蹤你的成長軌跡。

AI指導與回饋
獲得即時、個人化的練習回饋。上傳獨白影片、音樂演奏、舞蹈片段或藝術作品，Artlink的AI會分析並提供具體的指導建議。

成長追蹤
查看你隨時間的進步。Artlink追蹤你的練習連續天數、分析模式，展示你的成長軌跡，幫助你保持動力。

社群
與其他藝術家交流。分享你的作品，獲得社群回饋，發現新技巧和靈感。

核心功能
• AI驅動的練習分析和指導
• 支援媒體附件的結構化練習筆記
• 成長追蹤和連續練習監控
• 用於分享和回饋的社群動態
• 支援10+藝術領域
• 提供10種語言

免費使用
所有核心功能免費。今天就開始提升你的藝術吧。`,
  },
  {
    language: 'es-419',
    title: 'Artlink - Coach IA Artistas',
    shortDescription: 'Coaching IA para actuación, música, danza, arte, escritura, cine y más.',
    fullDescription: `Artlink es tu coach de práctica con IA para todo tipo de artistas: actores, músicos, bailarines, artistas visuales, escritores, cineastas y más.

NOTAS DE PRÁCTICA INTELIGENTES
Registra tus sesiones de práctica con notas estructuradas. Etiqueta por campo (actuación, música, danza, etc.), adjunta fotos o videos para análisis con IA y sigue tu progreso a lo largo del tiempo.

COACHING Y FEEDBACK CON IA
Obtén feedback instantáneo y personalizado sobre tu práctica. Sube un video de monólogo, una actuación musical, un clip de baile o una obra de arte: la IA de Artlink lo analiza y te da consejos específicos.

SEGUIMIENTO DEL CRECIMIENTO
Observa cómo has mejorado con el tiempo. Artlink rastrea tus rachas de práctica, analiza patrones y muestra tu trayectoria de crecimiento para mantenerte motivado.

COMUNIDAD
Conecta con otros artistas. Comparte tu trabajo, recibe feedback de la comunidad y descubre nuevas técnicas e inspiración.

CARACTERÍSTICAS PRINCIPALES
• Análisis de práctica y coaching con IA
• Notas de práctica estructuradas con archivos multimedia
• Seguimiento del crecimiento y rachas
• Feed comunitario para compartir y feedback
• Soporte para más de 10 campos artísticos
• Disponible en 10 idiomas

GRATIS
Todas las funciones principales son gratuitas. Empieza a mejorar tu arte hoy.`,
  },
  {
    language: 'ar',
    title: 'Artlink - مدرب ذكاء اصطناعي',
    shortDescription: 'تدريب بالذكاء الاصطناعي للتمثيل والموسيقى والرقص والفن والكتابة والسينما',
    fullDescription: `Artlink هو مدربك الشخصي بالذكاء الاصطناعي لكل نوع من الفنانين — ممثلين، موسيقيين، راقصين، فنانين تشكيليين، كتّاب، صانعي أفلام والمزيد.

ملاحظات تمرين ذكية
سجّل جلسات تمرينك بملاحظات منظمة. صنّف حسب المجال (تمثيل، موسيقى، رقص، إلخ)، أرفق صوراً أو فيديوهات لتحليل الذكاء الاصطناعي، وتابع تقدمك عبر الزمن.

تدريب وتقييم بالذكاء الاصطناعي
احصل على تقييم فوري ومخصص لتمرينك. ارفع فيديو مونولوج، أداء موسيقي، مقطع رقص، أو عمل فني — يحلله الذكاء الاصطناعي ويقدم نصائح تدريبية محددة.

تتبع النمو
شاهد تحسنك عبر الزمن. يتتبع Artlink سلاسل تمرينك، ويحلل الأنماط، ويعرض مسار نموك للحفاظ على حماسك.

المجتمع
تواصل مع فنانين آخرين. شارك أعمالك، واحصل على تقييمات من المجتمع، واكتشف تقنيات وإلهام جديد.

الميزات الرئيسية
• تحليل التمرين والتدريب بالذكاء الاصطناعي
• ملاحظات تمرين منظمة مع مرفقات وسائط
• تتبع النمو ومراقبة السلاسل
• موجز مجتمعي للمشاركة والتقييم
• دعم أكثر من 10 مجالات فنية
• متوفر بـ 10 لغات

مجاني
جميع الميزات الأساسية مجانية. ابدأ بتحسين فنك اليوم.`,
  },
  {
    language: 'vi',
    title: 'Artlink - Huấn luyện AI',
    shortDescription: 'Huấn luyện AI cho diễn xuất, âm nhạc, múa, mỹ thuật, viết lách, điện ảnh.',
    fullDescription: `Artlink là huấn luyện viên luyện tập AI dành cho mọi loại nghệ sĩ — diễn viên, nhạc sĩ, vũ công, nghệ sĩ thị giác, nhà văn, nhà làm phim và nhiều hơn nữa.

GHI CHÚ LUYỆN TẬP THÔNG MINH
Ghi lại các buổi luyện tập với ghi chú có cấu trúc. Gắn thẻ theo lĩnh vực (diễn xuất, âm nhạc, múa, v.v.), đính kèm ảnh hoặc video để AI phân tích, và theo dõi tiến bộ theo thời gian.

HUẤN LUYỆN & PHẢN HỒI AI
Nhận phản hồi tức thì, được cá nhân hóa về buổi luyện tập. Tải lên video độc thoại, biểu diễn âm nhạc, clip múa, hoặc tác phẩm nghệ thuật — AI của Artlink phân tích và đưa ra lời khuyên cụ thể.

THEO DÕI PHÁT TRIỂN
Xem bạn đã tiến bộ như thế nào theo thời gian. Artlink theo dõi chuỗi luyện tập, phân tích mẫu hình, và hiển thị quỹ đạo phát triển để bạn luôn có động lực.

CỘNG ĐỒNG
Kết nối với các nghệ sĩ khác. Chia sẻ tác phẩm, nhận phản hồi từ cộng đồng, và khám phá kỹ thuật và cảm hứng mới.

TÍNH NĂNG CHÍNH
• Phân tích luyện tập và huấn luyện bằng AI
• Ghi chú luyện tập có cấu trúc với đính kèm phương tiện
• Theo dõi phát triển và chuỗi luyện tập
• Bảng tin cộng đồng để chia sẻ và phản hồi
• Hỗ trợ hơn 10 lĩnh vực nghệ thuật
• Có sẵn bằng 10 ngôn ngữ

MIỄN PHÍ
Tất cả tính năng cốt lõi đều miễn phí. Bắt đầu nâng cao nghệ thuật của bạn ngay hôm nay.`,
  },
  {
    language: 'th',
    title: 'Artlink - โค้ช AI สำหรับศิลปิน',
    shortDescription: 'โค้ช AI สำหรับการแสดง ดนตรี เต้น ศิลปะ การเขียน ภาพยนตร์ และอื่นๆ',
    fullDescription: `Artlink คือโค้ชฝึกซ้อม AI สำหรับศิลปินทุกประเภท — นักแสดง นักดนตรี นักเต้น ศิลปินทัศนศิลป์ นักเขียน ผู้สร้างภาพยนตร์ และอื่นๆ

บันทึกการฝึกซ้อมอัจฉริยะ
บันทึกการฝึกซ้อมด้วยโน้ตที่มีโครงสร้าง แท็กตามสาขา (การแสดง ดนตรี เต้น ฯลฯ) แนบรูปภาพหรือวิดีโอเพื่อวิเคราะห์ด้วย AI และติดตามความก้าวหน้าตลอดเวลา

การโค้ชและข้อเสนอแนะจาก AI
รับข้อเสนอแนะทันทีและเฉพาะบุคคลเกี่ยวกับการฝึกซ้อม อัปโหลดวิดีโอโมโนล็อก การแสดงดนตรี คลิปเต้น หรือผลงานศิลปะ — AI ของ Artlink วิเคราะห์และให้คำแนะนำเฉพาะเจาะจง

การติดตามการเติบโต
ดูว่าคุณพัฒนาขึ้นอย่างไรตลอดเวลา Artlink ติดตามสถิติการฝึกซ้อม วิเคราะห์รูปแบบ และแสดงเส้นทางการเติบโตเพื่อให้คุณมีแรงจูงใจ

ชุมชน
เชื่อมต่อกับศิลปินคนอื่นๆ แบ่งปันผลงาน รับข้อเสนอแนะจากชุมชน และค้นพบเทคนิคและแรงบันดาลใจใหม่ๆ

คุณสมบัติหลัก
• การวิเคราะห์การฝึกซ้อมและโค้ชด้วย AI
• บันทึกการฝึกซ้อมแบบมีโครงสร้างพร้อมไฟล์แนบ
• การติดตามการเติบโตและสถิติ
• ฟีดชุมชนสำหรับการแบ่งปันและข้อเสนอแนะ
• รองรับมากกว่า 10 สาขาศิลปะ
• มีให้บริการใน 10 ภาษา

ฟรี
คุณสมบัติหลักทั้งหมดฟรี เริ่มพัฒนาศิลปะของคุณวันนี้`,
  },
  {
    language: 'id',
    title: 'Artlink - Pelatih AI Seniman',
    shortDescription: 'Pelatihan AI untuk akting, musik, tari, seni, menulis, film, dan lainnya.',
    fullDescription: `Artlink adalah pelatih latihan AI untuk semua jenis seniman — aktor, musisi, penari, seniman visual, penulis, pembuat film, dan lainnya.

CATATAN LATIHAN CERDAS
Catat sesi latihan Anda dengan catatan terstruktur. Tandai berdasarkan bidang (akting, musik, tari, dll.), lampirkan foto atau video untuk analisis AI, dan lacak kemajuan Anda dari waktu ke waktu.

PELATIHAN & UMPAN BALIK AI
Dapatkan umpan balik instan dan personal tentang latihan Anda. Unggah video monolog, pertunjukan musik, klip tari, atau karya seni — AI Artlink menganalisisnya dan memberikan tips pelatihan yang spesifik.

PELACAKAN PERTUMBUHAN
Lihat bagaimana Anda berkembang dari waktu ke waktu. Artlink melacak streak latihan Anda, menganalisis pola, dan menampilkan lintasan pertumbuhan Anda agar Anda tetap termotivasi.

KOMUNITAS
Terhubung dengan sesama seniman. Bagikan karya Anda, dapatkan umpan balik dari komunitas, dan temukan teknik serta inspirasi baru.

FITUR UTAMA
• Analisis latihan dan pelatihan berbasis AI
• Catatan latihan terstruktur dengan lampiran media
• Pelacakan pertumbuhan dan monitoring streak
• Feed komunitas untuk berbagi dan umpan balik
• Mendukung 10+ bidang seni
• Tersedia dalam 10 bahasa

GRATIS
Semua fitur inti gratis. Mulai tingkatkan seni Anda hari ini.`,
  },
];

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

async function apiCall(token, method, path, body = null) {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}${path}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(url, opts);
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${resp.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function uploadImage(token, editId, lang, imageType, filePath) {
  const url = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE_NAME}/edits/${editId}/listings/${lang}/${imageType}`;
  const fileData = readFileSync(filePath);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'image/png',
    },
    body: fileData,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Upload ${imageType} ${lang}: ${resp.status} ${text}`);
  }
  return resp.json();
}

async function main() {
  console.log('=== ARTLINK Google Play 전체 자동화 ===\n');

  const token = await getToken();
  console.log('✅ 인증 완료\n');

  // 1. Edit 생성
  console.log('[1/5] Edit 생성...');
  const edit = await apiCall(token, 'POST', '/edits', {});
  const editId = edit.id;
  console.log(`  Edit ID: ${editId}\n`);

  // 2. 앱 상세정보 설정
  console.log('[2/5] 앱 상세정보 설정...');
  await apiCall(token, 'PUT', `/edits/${editId}/details`, {
    defaultLanguage: 'en-US',
    contactEmail: CONTACT_EMAIL,
    contactWebsite: PRIVACY_URL,
  });
  console.log('  ✅ 연락처 + 웹사이트 설정\n');

  // 3. 10개 언어 스토어 등록정보
  console.log('[3/5] 스토어 등록정보 10개 언어...');
  for (const listing of ALL_LISTINGS) {
    try {
      await apiCall(token, 'PUT', `/edits/${editId}/listings/${listing.language}`, {
        language: listing.language,
        title: listing.title,
        shortDescription: listing.shortDescription,
        fullDescription: listing.fullDescription,
      });
      console.log(`  ✅ ${listing.language}: ${listing.title}`);
    } catch (err) {
      console.error(`  ❌ ${listing.language}: ${err.message.substring(0, 80)}`);
    }
  }

  // 4. 이미지 업로드 (아이콘, 피처 그래픽, 스크린샷)
  console.log('\n[4/5] 이미지 업로드...');

  // 4a. 앱 아이콘
  try {
    await uploadImage(token, editId, 'en-US', 'icon', ICON_PATH);
    console.log('  ✅ 앱 아이콘 업로드');
  } catch (err) {
    console.log(`  ⚠️ 아이콘: ${err.message.substring(0, 80)}`);
  }

  // 4b. 피처 그래픽
  try {
    await uploadImage(token, editId, 'en-US', 'featureGraphic', FEATURE_PATH);
    console.log('  ✅ 피처 그래픽 업로드');
  } catch (err) {
    console.log(`  ⚠️ 피처 그래픽: ${err.message.substring(0, 80)}`);
  }

  // 4c. 스크린샷 (모든 언어에 동일)
  try {
    const screenshots = readdirSync(SCREENSHOTS_DIR)
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
      .sort();
    console.log(`  스크린샷 파일: ${screenshots.length}장`);

    for (const lang of ALL_LISTINGS.map(l => l.language)) {
      // 기존 스크린샷 삭제
      try {
        await fetch(
          `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/edits/${editId}/listings/${lang}/phoneScreenshots`,
          { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
        );
      } catch (e) { /* ignore */ }

      let uploaded = 0;
      for (const file of screenshots) {
        try {
          await uploadImage(token, editId, lang, 'phoneScreenshots', join(SCREENSHOTS_DIR, file));
          uploaded++;
        } catch (err) {
          console.log(`    ⚠️ ${lang}/${file}: ${err.message.substring(0, 60)}`);
          break;
        }
      }
      if (uploaded > 0) console.log(`  ✅ ${lang}: ${uploaded}장 스크린샷`);
    }
  } catch (err) {
    console.log(`  ⚠️ 스크린샷 디렉토리: ${err.message}`);
  }

  // 5. 커밋
  console.log('\n[5/5] 커밋...');
  try {
    const commitResult = await apiCall(token, 'POST', `/edits/${editId}:commit`);
    console.log('  ✅ 커밋 완료!');
  } catch (err) {
    console.error(`  ❌ 커밋 실패: ${err.message.substring(0, 100)}`);
  }

  console.log('\n============================================');
  console.log('  ARTLINK Google Play 자동 설정 완료!');
  console.log('============================================');
  console.log(`  스토어 등록정보: ${ALL_LISTINGS.length}개 언어`);
  console.log(`  개인정보처리방침: ${PRIVACY_URL}`);
  console.log('\n⚠️  Play Console에서 수동으로 해야 할 항목:');
  console.log('  1. 앱 액세스 권한 (로그인 필요 여부)');
  console.log('  2. 광고 (광고 포함 여부)');
  console.log('  3. 콘텐츠 등급 (IARC 설문)');
  console.log('  4. 타겟층 (만 13세 이상)');
  console.log('  5. 데이터 보안 (수집 데이터 유형)');
  console.log('  6. 내부 테스트 → 비공개 테스트 → 프로덕션');
}

main().catch(err => {
  console.error('\n오류:', err.message);
  process.exit(1);
});
