import { useState, type ReactNode } from 'react';
import { entity } from '@/lib/data/entities';
import { useRefMaps } from '@/lib/data/hooks';
import type { TableName } from '@/lib/data/schema';
import { navigate } from '@/lib/router';
import { routeFor } from '@/lib/routes';
import { useApp } from '@/lib/app';
import { Button } from '@/components/ui';
import { RecordForm } from './EntityManager';
import { useRefTables } from './FieldInput';

/** Button that opens a pre-filled create form for another table, then jumps to the new record. */
export function QuickCreate({ table, initial, label, tone = 'secondary', icon, title, stay, size }: {
  table: TableName; initial: Record<string, unknown> | (() => Record<string, unknown>); label: ReactNode;
  tone?: 'primary' | 'secondary'; icon?: Parameters<typeof Button>[0]['icon']; title?: string; stay?: boolean; size?: 'sm' | 'md';
}) {
  const def = entity(table);
  const { can } = useApp();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const { maps } = useRefMaps(useRefTables(def.fields));
  if (!can(def.module, 'create')) return null;
  return (
    <>
      <Button tone={tone} icon={icon} size={size} onClick={() => { setValues(typeof initial === 'function' ? initial() : initial); setOpen(true); }}>{label}</Button>
      {open && (
        <RecordForm def={def} row={null} maps={maps} initial={values} title={title}
          onClose={() => setOpen(false)}
          onSaved={(id) => { setOpen(false); if (id && !stay) navigate(routeFor(table, id)); }} />
      )}
    </>
  );
}
