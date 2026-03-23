import { supabase } from "./supabaseClient";

// ─── Upsert artist profile ─────────────────────────────────
export async function upsertArtistProfile(userId, profileData) {
  const row = {
    user_id: userId,
    name: profileData.name || "익명",
    email: profileData.email || null,
    user_type: profileData.userType || null,
    fields: profileData.fields || [],
    gender: profileData.gender || null,
    birth_date: profileData.birthDate || null,
    height: profileData.height || null,
    weight: profileData.weight || null,
    height_private: profileData.heightPrivate || false,
    weight_private: profileData.weightPrivate || false,
    specialties: profileData.specialties || [],
    school: profileData.school || null,
    location: profileData.location || null,
    agency: profileData.agency || null,
    career: profileData.career || [],
    bio: profileData.bio || null,
    role_models: profileData.roleModels || [],
    interests: profileData.interests || [],
    photo_url: profileData.photoUrl || null,
    photos: profileData.photos || [],
    score: profileData.score || 0,
    notes_count: profileData.notesCount || 0,
    streak_days: profileData.streakDays || 0,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("artist_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Fetch public profiles for B2B ─────────────────────────
export async function fetchArtistProfiles({ gender, ageMin, ageMax, heightMin, heightMax, field, specialties, location, search } = {}) {
  let query = supabase
    .from("artist_profiles")
    .select("*")
    .order("score", { ascending: false })
    .limit(50);

  if (gender) query = query.eq("gender", gender);
  if (heightMin) query = query.gte("height", Number(heightMin));
  if (heightMax) query = query.lte("height", Number(heightMax));
  if (field) query = query.contains("fields", [field]);
  if (specialties && specialties.length > 0) query = query.overlaps("specialties", specialties);
  if (location) query = query.ilike("location", `%${location}%`);
  if (search) query = query.or(`name.ilike.%${search}%,agency.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) throw error;

  // Client-side age filter (computed from birth_date)
  if (ageMin || ageMax) {
    return data.filter((p) => {
      if (!p.birth_date) return false;
      const age = calculateAge(p.birth_date);
      if (!age) return false;
      if (ageMin && age < Number(ageMin)) return false;
      if (ageMax && age > Number(ageMax)) return false;
      return true;
    });
  }

  return data;
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

// ─── Upload profile photos (multiple) ───────────────────────
export async function uploadProfilePhotos(userId, localUris) {
  const urls = await Promise.all(
    localUris.map((uri, i) => uploadSinglePhoto(userId, uri, i))
  );

  // Update DB with photo URLs
  const { error: dbError } = await supabase
    .from("artist_profiles")
    .update({ photos: urls, photo_url: urls[0] || null })
    .eq("user_id", userId);
  if (dbError) throw dbError;

  return urls;
}

// ─── Legacy single upload (backward compat) ─────────────────
export async function uploadProfilePhoto(userId, localUri) {
  const url = await uploadSinglePhoto(userId, localUri, 0);
  const { error: dbError } = await supabase
    .from("artist_profiles")
    .update({ photo_url: url })
    .eq("user_id", userId);
  if (dbError) throw dbError;
  return url;
}

// ─── Delete profile (opt-out) ───────────────────────────────
export async function deleteArtistProfile(userId) {
  const { error } = await supabase
    .from("artist_profiles")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}

// ─── Helper ─────────────────────────────────────────────────
function calculateAge(birthDate) {
  if (!birthDate) return null;
  const parts = birthDate.split("-");
  if (parts.length < 3) return null;
  const birth = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age > 0 ? age : null;
}
