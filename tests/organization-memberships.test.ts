import { describe, expect, test } from 'bun:test';
import { buildOrganizationMembershipParams } from '../src/organization-memberships';

describe('buildOrganizationMembershipParams', () => {
  test('uses explicit user_uri and optional filters', () => {
    const params = buildOrganizationMembershipParams({
      user_uri: 'https://api.calendly.com/users/u1',
      organization_uri: 'https://api.calendly.com/organizations/o1',
      email: 'person@example.com',
      count: 25,
    });

    expect(params.get('user')).toBe('https://api.calendly.com/users/u1');
    expect(params.get('organization')).toBe('https://api.calendly.com/organizations/o1');
    expect(params.get('email')).toBe('person@example.com');
    expect(params.get('count')).toBe('25');
  });

  test('falls back to CALENDLY_USER_URI and CALENDLY_ORGANIZATION_URI', () => {
    const params = buildOrganizationMembershipParams(
      { email: 'person@example.com' },
      {
        CALENDLY_USER_URI: 'https://api.calendly.com/users/from-env',
        CALENDLY_ORGANIZATION_URI: 'https://api.calendly.com/organizations/from-env',
      },
    );

    expect(params.get('user')).toBe('https://api.calendly.com/users/from-env');
    expect(params.get('organization')).toBe('https://api.calendly.com/organizations/from-env');
    expect(params.get('email')).toBe('person@example.com');
  });

  test('allows optional filters without user/org', () => {
    const params = buildOrganizationMembershipParams(
      { email: 'person@example.com', count: 10 },
      { CALENDLY_USER_URI: undefined, CALENDLY_ORGANIZATION_URI: undefined },
    );

    expect(params.get('user')).toBeNull();
    expect(params.get('organization')).toBeNull();
    expect(params.get('email')).toBe('person@example.com');
    expect(params.get('count')).toBe('10');
  });

  test('returns empty params when no filters and no env fallbacks are provided', () => {
    const params = buildOrganizationMembershipParams(
      {},
      { CALENDLY_USER_URI: undefined, CALENDLY_ORGANIZATION_URI: undefined },
    );

    expect(params.toString()).toBe('');
  });
});
