// svelte-dnd-action meldet sich über diese Ereignisse, Svelte 5 kennt sie sonst nicht
declare namespace svelteHTML {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- T muss zur Deklaration von Svelte passen
  interface HTMLAttributes<T> {
    onconsider?: (e: CustomEvent<any>) => void;
    onfinalize?: (e: CustomEvent<any>) => void;
  }
}
