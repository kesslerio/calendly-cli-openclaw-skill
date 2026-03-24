export interface MembershipQueryInput {
  user_uri?: string;
  organization_uri?: string;
  email?: string;
  count?: number | string;
}

export interface MembershipQueryEnv {
  CALENDLY_USER_URI?: string;
  CALENDLY_ORGANIZATION_URI?: string;
}

export function buildOrganizationMembershipParams(
  input: MembershipQueryInput,
  env: MembershipQueryEnv = process.env as MembershipQueryEnv,
): URLSearchParams {
  const userUri = input.user_uri ?? env.CALENDLY_USER_URI;
  const organizationUri = input.organization_uri ?? env.CALENDLY_ORGANIZATION_URI;

  const params = new URLSearchParams();
  if (userUri) params.append('user', String(userUri));
  if (organizationUri) params.append('organization', String(organizationUri));
  if (input.email) params.append('email', String(input.email));
  if (input.count !== undefined) params.append('count', String(input.count));

  return params;
}
