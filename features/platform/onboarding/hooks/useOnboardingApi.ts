import { useRef } from "react";
import { GraphQLClient } from 'graphql-request';
import { requestSeedRecord, runSeedPhases, validateClubSeed } from "../utils/seedRecords";
import { startOnboarding, completeOnboarding } from '../actions/onboarding';
import type { TemplateType, OnboardingStep } from './useOnboardingState';

const GRAPHQL_ENDPOINT = '/api/graphql';

interface OnboardingApiProps {
  selectedTemplate: TemplateType;
  currentJsonData: any;
  completedItems: Record<string, string[]>;
  setProgress: (message: string) => void;
  setItemLoading: (type: string, item: string) => void;
  setItemCompleted: (type: string, item: string) => void;
  setItemError: (type: string, item: string, errorMessage: string) => void;
  setStep: (step: OnboardingStep) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  resetOnboardingState: () => void;
}

const message = (e: any) => e?.response?.errors?.map((x: any) => x.message).join('\n') || e?.message || 'Unknown error';

export function useOnboardingApi(p: OnboardingApiProps) {
  const running = useRef(false);
  const { currentJsonData: data, selectedTemplate } = p;

  const each = async (type: string, label: string, records: any[], entity: string, name: (r: any) => string, map: (r: any) => any = (r) => r) => {
    p.setProgress(`Saving ${label}...`);
    for (const record of records) {
      const item = name(record);
      p.setItemLoading(type, item);
      try { await requestSeedRecord(client(), entity, map(record)); p.setItemCompleted(type, item); }
      catch (e) { p.setItemError(type, item, message(e)); throw e; }
    }
  };
  const client = () => new GraphQLClient(typeof window === 'undefined' ? GRAPHQL_ENDPOINT : window.location.origin + GRAPHQL_ENDPOINT, { headers: { 'Content-Type': 'application/json' } });

  const runOnboarding = async () => {
    if (running.current) return;
    running.current = true;
    p.setIsLoading(true); p.setError(null); p.resetOnboardingState(); p.setStep('progress'); p.setProgress('Starting setup...');
    try {
      validateClubSeed(data);
      await runSeedPhases(startOnboarding, [
        () => each('venue', 'venue', [data.venue], 'Venue', (v) => v.name),
        () => requestSeedRecord(client(), 'VenueSettings', data.settings),
        () => each('rooms', 'rooms', data.rooms, 'Room', (r) => r.name),
        () => each('sections', 'sections', data.sections, 'Section', (s) => `${s.room} · ${s.name}`),
        () => each('tables', 'tables', data.tables, 'Table', (t) => `${t.section} ${t.label}`),
        () => each('comedians', 'comedians', data.comedians, 'Comedian', (c) => c.stageName),
        () => each('menuItems', 'menu', data.menuItems, 'MenuItem', (m) => m.name),
        () => each('paymentProviders', 'payment providers', data.paymentProviders, 'PaymentProvider', (x) => x.name),
        () => each('templates', 'show templates', data.templates, 'ShowTemplate', (t) => t.title),
        () => each('promoCodes', 'promo codes', data.promoCodes || [], 'PromoCode', (x) => x.code),
        async () => {
          p.setProgress('Creating shows and history...');
          p.setItemLoading('operations', data.operations);
          try {
            await client().request(`mutation Seed($t: String!) { seedClubOperations(template: $t) }`, { t: selectedTemplate });
            p.setItemCompleted('operations', data.operations);
          } catch (e) { p.setItemError('operations', data.operations, message(e)); throw e; }
        },
      ], completeOnboarding);
      p.setProgress('Setup saved.');
      p.setStep('done');
    } catch (e: any) {
      p.setError(message(e));
    } finally {
      running.current = false;
      p.setIsLoading(false);
    }
  };

  return { runOnboarding };
}
