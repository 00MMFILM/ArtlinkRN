import { supabase } from "./supabaseClient";
import { SERVER_URL, getApiHeaders } from "./apiConfig";
import { safeStorageGet, STORAGE_KEYS } from "../utils/storage";

// 프로필 소유권 토큰 (user-register가 발급, AppContext가 저장)을 읽어옴
async function getProfileToken() {
  try {
    return await safeStorageGet(STORAGE_KEYS.PROFILE_TOKEN);
  } catch {
    return null;
  }
}

// ─── Upsert artist profile (서버 경유: 소유권 검증) ─────────────
export async function upsertArtistProfile(userId, profileData) {
  const profileToken = await getProfileToken();
  const res = await fetch(`${SERVER_URL}/api/profile-sync`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify({ userId, profileToken, profile: profileData }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "profile sync failed");
  }
  return res.json().catch(() => ({}));
}

// ─── 서버가 돌려준 정답 통계로 로컬 표시값을 병합 (순수 함수, 테스트용) ─
// local: computeArtistProfile()이 만든 artistProfile (radarValues/streak 등 포함)
// server: profile-sync 응답 { score, mileage, level } 또는 null/undefined
export function mergeServerStats(local, server) {
  if (!local) return local;
  if (!server) return local;
  return {
    ...local,
    overallScore: server.score ?? local.overallScore,
    mileage: server.mileage ?? local.mileage,
    level: server.level ?? local.level,
  };
}

// ─── Fetch public profiles for B2B (서버 경유: 이메일 제거) ─────
export async function fetchArtistProfiles(filters = {}) {
  const res = await fetch(`${SERVER_URL}/api/artist-browse`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify(filters),
  });
  if (!res.ok) throw new Error("browse failed");
  const data = await res.json();
  return data.profiles || [];
}

// ─── Upload single photo to storage ─────────────────────────
async function uploadSinglePhoto(userId, localUri, index) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const arrayBuf = await new Response(blob).arrayBuffer();
  const filePath = `${userId}_${index}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("profile-photos")
    .upload(filePath, arrayBuf, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from("profile-photos")
    .getPublicUrl(filePath);
  return `${urlData.publicUrl}?t=${Date.now()}`;
}

// ─── Upload profile photos (서버 경유로 DB 반영) ────────────────
export async function uploadProfilePhotos(userId, localUris) {
  const urls = await Promise.all(
    localUris.map((uri, i) => uploadSinglePhoto(userId, uri, i))
  );
  const profileToken = await getProfileToken();
  // 사진 URL만 반영하는 부분 업데이트 — profile-sync에 photos만 전달
  await fetch(`${SERVER_URL}/api/profile-sync`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify({
      userId,
      profileToken,
      profile: { photos: urls, photoUrl: urls[0] || null, _photosOnly: true },
    }),
  });
  return urls;
}

// ─── Legacy single upload ───────────────────────────────────
export async function uploadProfilePhoto(userId, localUri) {
  const [url] = await uploadProfilePhotos(userId, [localUri]);
  return url;
}

// ─── Delete profile (서버 경유: 소유권 검증) ────────────────────
export async function deleteArtistProfile(userId) {
  const profileToken = await getProfileToken();
  const res = await fetch(`${SERVER_URL}/api/profile-delete`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify({ userId, profileToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "profile delete failed");
  }
}
