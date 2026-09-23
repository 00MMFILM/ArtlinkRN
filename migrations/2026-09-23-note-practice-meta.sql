-- Review and run in the server database before releasing 1.11.7.
-- No existing note contents are removed. The app can save notes without this
-- column, but cross-device practice-chain restoration requires it.
ALTER TABLE public.user_notes ADD COLUMN IF NOT EXISTS practice_meta jsonb;

-- Deletion is final: an older device/app must not resurrect a tombstoned row.
-- The app also handles tombstones locally; this protects mixed app versions and
-- races between a delete on one device and an upload on another.
CREATE OR REPLACE FUNCTION public.keep_user_note_deleted()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.deleted = true THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS user_notes_keep_deleted ON public.user_notes;
CREATE TRIGGER user_notes_keep_deleted BEFORE UPDATE ON public.user_notes
FOR EACH ROW EXECUTE FUNCTION public.keep_user_note_deleted();
