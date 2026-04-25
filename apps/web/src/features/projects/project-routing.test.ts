import { describe, expect, it } from 'vitest';
import { buildProjectPath, buildProjectSettingsPath, buildProjectsPath } from './project-routing';

describe('project routing helpers', () => {
  it('builds organization-local Project routes', () => {
    expect(buildProjectPath('acme', 'risk-register')).toBe('/acme/p/risk-register');
    expect(buildProjectSettingsPath('acme', 'risk-register')).toBe(
      '/acme/p/risk-register/settings',
    );
    expect(buildProjectsPath('acme')).toBe('/acme/projects');
  });
});
