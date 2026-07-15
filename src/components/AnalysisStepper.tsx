import { Check, Loader2 } from 'lucide-react';
import type { AnalysisProgressStep } from '../types';

const STEPS: { id: AnalysisProgressStep; label: string }[] = [
  { id: 'keywords', label: '키워드' },
  { id: 'video', label: '영상 분석' },
  { id: 'search', label: '레퍼런스 검색' },
  { id: 'trending', label: '유행 영상' },
  { id: 'references', label: '레퍼런스 분석' },
  { id: 'compare', label: '벤치마크' },
  { id: 'done', label: '완료' },
];

interface AnalysisStepperProps {
  currentStep: AnalysisProgressStep | null;
  message?: string;
}

export function AnalysisStepper({ currentStep, message }: AnalysisStepperProps) {
  const currentIndex = currentStep ? STEPS.findIndex((s) => s.id === currentStep) : -1;

  return (
    <div className="analysis-stepper">
      <div className="analysis-stepper-track">
        {STEPS.map((step, index) => {
          const done = currentIndex > index || currentStep === 'done';
          const active = step.id === currentStep;
          return (
            <div
              key={step.id}
              className={`analysis-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}
            >
              <span className="analysis-step-dot">
                {active && !done ? <Loader2 size={12} className="spin" /> : done ? <Check size={12} /> : index + 1}
              </span>
              <span className="analysis-step-label">{step.label}</span>
            </div>
          );
        })}
      </div>
      {message && <p className="analysis-stepper-msg">{message}</p>}
    </div>
  );
}
