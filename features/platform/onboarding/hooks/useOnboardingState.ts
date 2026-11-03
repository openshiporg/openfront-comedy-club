import { useState, useEffect } from 'react';
import { getSeedForTemplate, getItemsFromJsonData } from '../utils/dataUtils';
import seedData from '../lib/seed.json';

export type OnboardingStep = 'template' | 'progress' | 'done';
export type TemplateType = 'full' | 'minimal';

export interface OnboardingSettingsReview {
  reused: boolean;
  checkedFields: string[];
  mismatchedFields: string[];
}

export interface OnboardingState {
  step: OnboardingStep;
  selectedTemplate: TemplateType;
  currentJsonData: any;
  customJsonApplied: boolean;
  progressMessage: string;
  loadingItems: Record<string, string[]>;
  completedItems: Record<string, string[]>;
  error: string | null;
  settingsReview: OnboardingSettingsReview | null;
  itemErrors: Record<string, Record<string, string | undefined>>;
  isLoading: boolean;
}

const initialItemsState: Record<string, string[]> = {
  venue: [], rooms: [], sections: [], tables: [], comedians: [], menuItems: [], templates: [], promoCodes: [], paymentProviders: [], operations: [],
};

export function useOnboardingState() {
  const [state, setState] = useState<OnboardingState>({
    step: 'template',
    selectedTemplate: 'full',
    currentJsonData: null,
    customJsonApplied: false,
    progressMessage: '',
    loadingItems: { ...initialItemsState },
    completedItems: { ...initialItemsState },
    error: null,
    settingsReview: null,
    itemErrors: {},
    isLoading: false,
  });

  // Load JSON data when template changes
  useEffect(() => {
    const templateData = getSeedForTemplate(state.selectedTemplate, seedData);
    setState(prev => ({ ...prev, currentJsonData: templateData, customJsonApplied: false }));
  }, [state.selectedTemplate]);

  const setStep = (step: OnboardingStep) => {
    setState(prev => ({ ...prev, step }));
  };

  const setSelectedTemplate = (template: TemplateType) => {
    setState(prev => ({ ...prev, selectedTemplate: template }));
  };

  const setCurrentJsonData = (data: any) => {
    setState(prev => ({ ...prev, currentJsonData: data }));
  };

  const setCustomJsonApplied = (applied: boolean) => {
    setState(prev => ({ ...prev, customJsonApplied: applied }));
  };

  const setIsLoading = (loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  };

  const setError = (error: string | null) => {
    setState(prev => ({ ...prev, error }));
  };

  const setSettingsReview = (settingsReview: OnboardingSettingsReview | null) => {
    setState(prev => ({ ...prev, settingsReview }));
  };

  const setProgressMessage = (message: string) => {
    setState(prev => ({ ...prev, progressMessage: message }));
  };

  const getDisplayNamesFromData = (data: any) => Object.fromEntries(Object.keys(initialItemsState).map((k) => [k, getItemsFromJsonData(data, k)]));

  // Progress text is descriptive; only persisted record acknowledgements complete items.
  const setProgress = (message: string) => setProgressMessage(message);

  const setLoadingItems = (items: Record<string, string[]>) => {
    setState(prev => ({ ...prev, loadingItems: items }));
  };

  const setCompletedItems = (items: Record<string, string[]>) => {
    setState(prev => ({ ...prev, completedItems: items }));
  };

  const setItemErrors = (errors: Record<string, Record<string, string | undefined>>) => {
    setState(prev => ({ ...prev, itemErrors: errors }));
  };

  const setItemLoading = (type: string, item: string) => {
    setState(prev => ({
      ...prev,
      loadingItems: {
        ...prev.loadingItems,
        [type]: [...(prev.loadingItems[type] || []), item],
      },
      itemErrors: {
        ...prev.itemErrors,
        [type]: prev.itemErrors[type] ? {
          ...prev.itemErrors[type],
          [item]: undefined
        } : {}
      }
    }));
  };

  const setItemCompleted = (type: string, item: string) => {
    setState(prev => ({
      ...prev,
      loadingItems: {
        ...prev.loadingItems,
        [type]: (prev.loadingItems[type] || []).filter((i) => i !== item),
      },
      completedItems: {
        ...prev.completedItems,
        [type]: Array.from(new Set([...(prev.completedItems[type] || []), item])),
      },
      itemErrors: {
        ...prev.itemErrors,
        [type]: prev.itemErrors[type] ? {
          ...prev.itemErrors[type],
          [item]: undefined
        } : {}
      }
    }));
  };

  const setItemError = (type: string, item: string, errorMessage: string) => {
    setState(prev => ({
      ...prev,
      loadingItems: {
        ...prev.loadingItems,
        [type]: (prev.loadingItems[type] || []).filter((i) => i !== item),
      },
      itemErrors: {
        ...prev.itemErrors,
        [type]: {
          ...(prev.itemErrors[type] || {}),
          [item]: errorMessage,
        }
      }
    }));
  };

  const resetOnboardingState = () => {
    setState(prev => ({
      ...prev,
      error: null,
      settingsReview: null,
      itemErrors: {},
      loadingItems: { ...initialItemsState },
      completedItems: { ...initialItemsState },
    }));
  };

  return {
    ...state,
    setStep,
    setSelectedTemplate,
    setCurrentJsonData,
    setCustomJsonApplied,
    setIsLoading,
    setError,
    setSettingsReview,
    setProgress,
    setLoadingItems,
    setCompletedItems,
    setItemErrors,
    setItemLoading,
    setItemCompleted,
    setItemError,
    resetOnboardingState,
    getDisplayNamesFromData,
  };
}
