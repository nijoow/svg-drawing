/** Text editing keeps native shortcuts; canvas commands must leave it alone. */
export function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]')))
  )
}
