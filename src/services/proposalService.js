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
export async function updateProposalStatus(proposalId, status) {
  const { data, error } = await supabase
    .from("proposals")
    .update({ status })
    .eq("id", proposalId)
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
export async function deleteProposal(proposalId) {
  const { error } = await supabase
    .from("proposals")
    .delete()
    .eq("id", proposalId);

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
