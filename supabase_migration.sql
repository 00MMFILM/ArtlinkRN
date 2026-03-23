-- Feature 3: Height/weight privacy toggles
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS height_private boolean DEFAULT false;
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS weight_private boolean DEFAULT false;

-- Feature 4: Proposals table for casting/collaboration
CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id uuid NOT NULL REFERENCES users(id),
  recipient_id uuid NOT NULL REFERENCES users(id),
  type text NOT NULL DEFAULT 'casting',  -- 'casting' | 'collaboration'
  title text NOT NULL,
  content text NOT NULL,
  sender_name text NOT NULL,
  sender_field text,
  status text NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'declined'
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_proposals_recipient ON proposals(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_sender ON proposals(sender_id, created_at DESC);

-- Stats columns for B2B dashboard
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS notes_count integer DEFAULT 0;
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS streak_days integer DEFAULT 0;
-- score column should already exist; add if missing
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS score integer DEFAULT 0;

-- Feature 5: Proposal replies (messaging after accepted)
CREATE TABLE IF NOT EXISTS proposal_replies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  sender_name text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_replies_proposal ON proposal_replies(proposal_id, created_at ASC);
