import { describe, expect, it } from 'vitest';
import {
  buildProjectPath,
  buildProjectSettingsPath,
  buildProjectsPath,
  slugifyProjectName,
} from '@/features/projects/routing/project-routing';

describe('project routing helpers', () => {
  it('builds organization-local Project routes', () => {
    expect(buildProjectPath('acme', 'risk-register')).toBe('/acme/p/risk-register');
    expect(buildProjectSettingsPath('acme', 'risk-register')).toBe(
      '/acme/p/risk-register/settings',
    );
    expect(buildProjectsPath('acme')).toBe('/acme/projects');
  });

  it('slugifies Project names for editable Project creation slugs', () => {
    expect(slugifyProjectName('SOC 2 Readiness')).toBe('soc-2-readiness');
    expect(slugifyProjectName('Controls & Evidence')).toBe('controls-evidence');
    expect(slugifyProjectName('')).toBe('');
  });
});
