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

  test('throws when both user and organization are missing', () => {
    expect(() =>
      buildOrganizationMembershipParams(
        { email: 'person@example.com' },
        { CALENDLY_USER_URI: undefined, CALENDLY_ORGANIZATION_URI: undefined },
      ),
    ).toThrow(
      'list-organization-memberships requires --user-uri or --organization-uri (or CALENDLY_USER_URI/CALENDLY_ORGANIZATION_URI).',
    );
  });
});
