import { describe, expect, it } from 'vitest';
import { buildProjectPath, buildProjectsPath } from './project-routing';

describe('project routing helpers', () => {
  it('builds organization-local Project routes', () => {
    expect(buildProjectPath('acme', 'risk-register')).toBe('/acme/p/risk-register');
    expect(buildProjectsPath('acme')).toBe('/acme/projects');
  });
});
