// The theme: dark, like Blender's. Kept as a signal so canvas drawing (the
// frame meter) redraws if a theme is ever added back.
import { signal } from '@preact/signals';

document.documentElement.dataset.theme = 'dark';
export const theme = signal('dark');
