import { CruxScore, IntentProfile, LifecycleStage, MacroCycle } from '../shared/types';
import { getOrComputeScore } from './index';

export type ProgressEvent = {
  stage: string;
  message: string;
  timestamp: number;
};

type ComputationState = {
  promise: Promise<CruxScore>;
  events: ProgressEvent[];
  subscribers: Set<(event: any) => void>;
};

class ComputationManager {
  private activeComputations = new Map<string, ComputationState>();

  private getCacheKey(propertyId: string, intent: string): string {
    return `${propertyId}_${intent}`;
  }

  public streamScoreComputation(
    propertyId: string,
    intent: IntentProfile,
    lifecycle: LifecycleStage,
    macroCycle: MacroCycle,
    onEvent: (event: any) => void
  ) {
    const key = this.getCacheKey(propertyId, intent);

    let state = this.activeComputations.get(key);

    if (state) {
      // Replay past events to the new subscriber
      state.events.forEach((e) => {
        onEvent({ type: 'progress', data: e });
      });
      state.subscribers.add(onEvent);
      
      // Wait for it to finish
      state.promise.then(score => {
        onEvent({ type: 'done', data: score });
      }).catch(err => {
        onEvent({ type: 'error', data: err instanceof Error ? err.message : 'Unknown error' });
      }).finally(() => {
        state?.subscribers.delete(onEvent);
      });
      return;
    }

    // Start new computation
    state = {
      promise: Promise.resolve() as any, // placeholder
      events: [],
      subscribers: new Set([onEvent]),
    };
    this.activeComputations.set(key, state);

    const onProgress = (message: string) => {
      const event: ProgressEvent = { stage: 'processing', message, timestamp: Date.now() };
      state!.events.push(event);
      state!.subscribers.forEach(sub => sub({ type: 'progress', data: event }));
    };

    onProgress('Initializing CRUX scoring pipeline...');

    // We modify getOrComputeScore to accept an onProgress callback.
    // However, it's easier to just pass onProgress to a newly exposed `computeAndPersist` equivalent or update `getOrComputeScore`.
    // We will update `getOrComputeScore` to take `onProgress` as the 5th argument.
    state.promise = getOrComputeScore(propertyId, intent, lifecycle, macroCycle, onProgress);

    state.promise.then(score => {
      state!.subscribers.forEach(sub => sub({ type: 'done', data: score }));
    }).catch(err => {
      state!.subscribers.forEach(sub => sub({ type: 'error', data: err instanceof Error ? err.message : 'Unknown error' }));
    }).finally(() => {
      this.activeComputations.delete(key);
    });
  }
}

export const computationManager = new ComputationManager();
