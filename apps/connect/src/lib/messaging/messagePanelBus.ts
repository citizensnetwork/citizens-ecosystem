export const OPEN_MESSAGE_THREAD_EVENT = "cc:open-message-thread";

export type OpenMessageThreadDetail = {
  conversationId: string;
};

export function openMessageThread(conversationId: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<OpenMessageThreadDetail>(OPEN_MESSAGE_THREAD_EVENT, {
      detail: { conversationId },
    }),
  );
}
