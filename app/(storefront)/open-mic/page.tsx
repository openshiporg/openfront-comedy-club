import { OpenMicForm } from '@/features/storefront/components/OpenMicForm';
import { loadOpenMic } from '@/features/storefront/lib/clientActions';

export const dynamic = 'force-dynamic';
export default async function OpenMicPage() {
  const shows = await loadOpenMic();
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">Open mic</h1>{shows.length ? <OpenMicForm shows={shows} /> : <p className="text-sm text-muted-foreground">No open mic nights scheduled.</p>}</div>;
}
