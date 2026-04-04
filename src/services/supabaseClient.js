import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const SUPABASE_URL = "https://ayvfdomoghppgrleugnk.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5dmZkb21vZ2hwcGdybGV1Z25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTM4NjksImV4cCI6MjA4NzU4OTg2OX0.2F4Ra531WJZv8jGvD51V7dOf1yOmFdxaD09V7fJjkd0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
