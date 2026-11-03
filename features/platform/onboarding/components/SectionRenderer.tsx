import React from 'react';
import { SectionDefinition } from '../config/templates';
import { getItemsFromJsonData } from '../utils/dataUtils';

interface Props {
  sections: SectionDefinition[];
  isLoading: boolean;
  loadingItems: Record<string, string[]>;
  completedItems: Record<string, string[]>;
  itemErrors: Record<string, Record<string, string | undefined>>;
  step: 'template' | 'progress' | 'done';
  currentJsonData?: any;
}

const dot = (status: string) =>
  status === 'completed' ? 'bg-emerald-500' : status === 'loading' ? 'bg-amber-500 animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-muted-foreground/40';

export const SectionRenderer: React.FC<Props> = ({ sections, isLoading, loadingItems, completedItems, itemErrors, step, currentJsonData }) => (
  <div className="space-y-5">
    {sections.map((section) => {
      const items = currentJsonData ? getItemsFromJsonData(currentJsonData, section.type) : [];
      if (!items.length) return null;
      const done = items.filter((i) => step === 'done' || completedItems[section.type]?.includes(i)).length;
      const failed = items.find((i) => itemErrors[section.type]?.[i]);
      const status = failed ? 'error' : done === items.length ? 'completed' : isLoading && loadingItems[section.type]?.length ? 'loading' : 'normal';
      return (
        <section key={section.type}>
          <div className="flex items-center gap-2">
            <span className={`size-2 shrink-0 rounded-full ${dot(status)}`} />
            <h4 className="font-mono text-xs uppercase tracking-wide">{section.label}</h4>
            <span className="font-mono text-xs text-muted-foreground">{done}/{items.length}</span>
          </div>
          {failed ? <p className="mt-1 break-words text-xs text-red-600">{failed}: {itemErrors[section.type][failed]}</p> : null}
          <p className="mt-1 break-words text-xs text-muted-foreground">{items.slice(0, 12).join(', ')}{items.length > 12 ? ` and ${items.length - 12} more` : ''}</p>
        </section>
      );
    })}
  </div>
);
