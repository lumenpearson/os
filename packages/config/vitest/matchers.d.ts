/**
 * Registers the jest-dom matchers (toBeInTheDocument, toHaveTextContent…)
 * with TypeScript. `setup.ts` imports them at runtime; packages that write
 * DOM assertions add this file to their tsconfig `include`.
 */
import '@testing-library/jest-dom/vitest';
