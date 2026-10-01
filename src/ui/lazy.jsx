// Components that load with their module the first time they're shown, so
// heavy ones (three.js, the AI layer) stay out of the window's first paint.
import { h } from 'preact';
import { signal } from '@preact/signals';

export function lazy(load, name) {
  const component = signal(null);
  let started = false;
  return function Lazy(props) {
    if (!component.value && !started) {
      started = true;
      load().then((m) => (component.value = m[name]));
    }
    return component.value ? h(component.value, props) : null;
  };
}
