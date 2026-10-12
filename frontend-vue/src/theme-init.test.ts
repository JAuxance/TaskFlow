import { expect, it } from 'vitest';
import original from '../../frontend/js/theme-init.js?raw';
import copy from '../public/theme-init.js?raw';

// The script is duplicated because it must be a plain file served before the
// stylesheet. Until the current frontend is retired, both copies stay identical.
it('uses the same theme script as the current frontend', () => {
    expect(copy.length).toBeGreaterThan(100);
    expect(copy).toBe(original);
});
