import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "@/lib/config";

/**
 * Removes every object that belongs to a storage folder.
 *
 * Deleting a media row removes its known path, but anything the row never knew
 * about — a poster written after a failure, or an object from an interrupted
 * upload — would be left behind. Storage has no cascading delete, so the folder
 * is swept explicitly after the rows are gone.
 */
export async function removeStorageFolder(
  supabase: SupabaseClient,
  folder: string,
  depth = 0,
): Promise<number> {
  if (depth > 3) return 0;

  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(folder, { limit: 1000 });
  if (error || !data?.length) return 0;

  const files: string[] = [];
  let removed = 0;

  for (const entry of data) {
    const path = `${folder}/${entry.name}`;
    // A folder is reported as an entry without an id.
    if (!entry.id) {
      removed += await removeStorageFolder(supabase, path, depth + 1);
    } else {
      files.push(path);
    }
  }

  if (files.length) {
    const { error: removeError } = await supabase.storage.from(MEDIA_BUCKET).remove(files);
    if (removeError) {
      console.error(`[storage] could not remove ${files.length} object(s): ${removeError.message}`);
    } else {
      removed += files.length;
    }
  }

  return removed;
}
