'use client';

import React from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SectionRenderer } from './SectionRenderer';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { useOnboardingApi } from '../hooks/useOnboardingApi';
import { CLUB_TEMPLATES, SECTION_DEFINITIONS } from '../config/templates';

interface OnboardingDialogProps { isOpen: boolean; onClose: () => void }

const NEXT = [
  { href: '/dashboard/platform/tonight', label: 'Tonight' },
  { href: '/dashboard/platform/shows', label: 'Shows' },
  { href: '/dashboard/platform/payment-providers', label: 'Payment providers' },
];

const OnboardingDialog: React.FC<OnboardingDialogProps> = ({ isOpen, onClose }) => {
  const s = useOnboardingState();
  const { runOnboarding } = useOnboardingApi({
    selectedTemplate: s.selectedTemplate, currentJsonData: s.currentJsonData, completedItems: s.completedItems,
    setProgress: s.setProgress, setItemLoading: s.setItemLoading, setItemCompleted: s.setItemCompleted, setItemError: s.setItemError,
    setStep: s.setStep, setError: s.setError, setIsLoading: s.setIsLoading, resetOnboardingState: s.resetOnboardingState,
  });
  if (!isOpen) return null;
  const template = CLUB_TEMPLATES[s.selectedTemplate];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle>Club setup</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {s.step === 'template' && !s.isLoading ? (
            <div className="space-y-2">
              <Tabs value={s.selectedTemplate} onValueChange={(v) => s.setSelectedTemplate(v as 'full' | 'minimal')}>
                <TabsList className="w-full">
                  <TabsTrigger value="full" className="flex-1">Complete</TabsTrigger>
                  <TabsTrigger value="minimal" className="flex-1">Basic</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-sm text-muted-foreground">{template.description}</p>
            </div>
          ) : (
            <p className="font-mono text-xs uppercase tracking-wide">{s.step === 'done' ? 'Setup saved' : s.progressMessage}</p>
          )}
          <SectionRenderer sections={SECTION_DEFINITIONS} isLoading={s.isLoading} loadingItems={s.loadingItems} completedItems={s.completedItems} itemErrors={s.itemErrors} step={s.step} currentJsonData={s.currentJsonData} />
          {s.step === 'done' ? (
            <div className="flex flex-wrap gap-4 text-sm">
              {NEXT.map((n) => <Link key={n.href} href={n.href} className="font-medium underline underline-offset-4" onClick={onClose}>{n.label}</Link>)}
            </div>
          ) : null}
        </div>
        {s.error && !s.isLoading && s.step !== 'done' ? <p className="break-words border-t px-4 py-3 text-sm text-red-600 sm:px-6">{s.error} Saved records are reused when you retry.</p> : null}
        <div className="flex shrink-0 gap-2 border-t p-4">
          {s.step === 'done' ? (
            <DialogClose asChild><Button className="flex-1">Close</Button></DialogClose>
          ) : (
            <>
              <DialogClose asChild><Button variant="ghost" disabled={s.isLoading} className="flex-1">Cancel</Button></DialogClose>
              {s.isLoading ? <Button disabled className="flex-1"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving</Button> : <Button onClick={runOnboarding} className="flex-1">{s.error ? 'Retry setup' : 'Confirm'}</Button>}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingDialog;
