/* ============================================================
   NBANA APP — cloud settings (Supabase, free plan)
   ------------------------------------------------------------
   Both values come from the Supabase dashboard:
     Project Settings -> API Keys

   `key` is the PUBLISHABLE key. It is designed to live in website
   code, so it is safe in this file. Never put the SECRET key here.

   Set `enabled: false` to run the portal purely offline again
   (everything falls back to this browser's localStorage).
   ============================================================ */
window.NBANA_CLOUD = {
  url: 'https://ukquexncxvgsyzwutpmq.supabase.co',
  key: 'sb_publishable_vEuLBFKLNBVLFNnD5515Iw_hRGnmpCt',
  enabled: true
};
