import { supabase } from "./supabaseClient";

// ─── Send a proposal (casting or collaboration) ─────────────
export async function sendProposal({ senderId, recipientId, type, title, content, senderName, senderField }) {
  const row = {
    sender_id: senderId,
    recipient_id: recipientId,
    type: type || "casting",
    title,
    content,
    sender_name: senderName,
    sender_field: senderField || null,
    status: "pending",
  };

  const { data, error } = await supabase
    .from("proposals")
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Fetch received proposals ────────────────────────────────
export async function fetchReceivedProposals(userId) {
  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

// ─── Fetch sent proposals ────────────────────────────────────
export async function fetchSentProposals(userId) {
  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("sender_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

// ─── Update proposal status (accept/decline) ────────────────
// 수신자만 상태 변경 가능 (클라이언트 방어강화 — TODO: Supabase RLS로 실제 방어선 필요, 이번 범위 밖)
export async function updateProposalStatus(proposalId, status, recipientId) {
  const { data, error } = await supabase
    .from("proposals")
    .update({ status })
    .eq("id", proposalId)
    .eq("recipient_id", recipientId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Fetch replies for a proposal ────────────────────────────
export async function fetchReplies(proposalId) {
  const { data, error } = await supabase
    .from("proposal_replies")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

// ─── Delete a proposal ──────────────────────────────────────
// 발신자/수신자 본인만 삭제 가능 (클라이언트 방어강화 — TODO: Supabase RLS로 실제 방어선 필요, 이번 범위 밖)
export async function deleteProposal(proposalId, userId) {
  const { error } = await supabase
    .from("proposals")
    .delete()
    .eq("id", proposalId)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);

  if (error) throw error;
}

// ─── Reply to a proposal ────────────────────────────────────
export async function replyToProposal(proposalId, senderId, senderName, content) {
  const { data, error } = await supabase
    .from("proposal_replies")
    .insert({
      proposal_id: proposalId,
      sender_id: senderId,
      sender_name: senderName,
      content,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
