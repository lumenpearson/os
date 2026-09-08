import { defineVitestConfig } from '@lumen/config-vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig(defineVitestConfig({ dom: true }));
