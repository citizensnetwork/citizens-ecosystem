import { describe, expect, it, vi } from 'vitest';
import { MemoryRealtimeBus, type RealtimeEvent } from '../src/realtime';

function typingEvent(overrides: Partial<Extract<RealtimeEvent, { kind: 'conversation.typing' }>> = {}) {
  return {
    kind: 'conversation.typing' as const,
    conversationId: 'cnv_001',
    userId: 'usr_001',
    at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('MemoryRealtimeBus', () => {
  it('delivers a published event to a subscriber on the same topic', () => {
    const bus = new MemoryRealtimeBus();
    const heard: RealtimeEvent[] = [];
    bus.subscribe('conv:cnv_001', (e) => heard.push(e));

    const event = typingEvent();
    bus.publish('conv:cnv_001', event);

    expect(heard).toEqual([event]);
  });

  it('never delivers to a subscriber on a different topic', () => {
    const bus = new MemoryRealtimeBus();
    const listener = vi.fn();
    bus.subscribe('conv:cnv_002', listener);

    bus.publish('conv:cnv_001', typingEvent());

    expect(listener).not.toHaveBeenCalled();
  });

  it('publishing with no subscribers is a no-op, not an error', () => {
    const bus = new MemoryRealtimeBus();
    expect(() => bus.publish('conv:cnv_999', typingEvent())).not.toThrow();
  });

  it('isolates a throwing listener so the rest of the fan-out still runs', () => {
    const bus = new MemoryRealtimeBus();
    const calls: string[] = [];
    bus.subscribe('conv:cnv_001', () => {
      calls.push('broken');
      throw new Error('boom');
    });
    bus.subscribe('conv:cnv_001', () => calls.push('healthy'));

    expect(() => bus.publish('conv:cnv_001', typingEvent())).not.toThrow();
    expect(calls).toEqual(['broken', 'healthy']);
  });

  it('unsubscribe stops further delivery to that listener only', () => {
    const bus = new MemoryRealtimeBus();
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = bus.subscribe('conv:cnv_001', a);
    bus.subscribe('conv:cnv_001', b);

    unsubA();
    bus.publish('conv:cnv_001', typingEvent());

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('calling the same unsubscribe twice is safe (idempotent)', () => {
    const bus = new MemoryRealtimeBus();
    const unsub = bus.subscribe('conv:cnv_001', vi.fn());

    unsub();
    expect(() => unsub()).not.toThrow();
  });
});
