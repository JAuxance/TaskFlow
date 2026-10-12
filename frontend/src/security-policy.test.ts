import { expect, it } from 'vitest';
import headers from '../../deploy/nginx/security-headers.conf?raw';

// The frontend is written for this policy: scripts and styles as files only,
// private pictures as data URLs. Loosening it must be a deliberate change.
it('runs under a policy without inline code and without blob images', () => {
    const policy = /Content-Security-Policy "([^"]+)"/.exec(headers)?.[1] ?? '';

    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("style-src 'self'");
    expect(policy).toContain("img-src 'self' data:");
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('blob:');
});
