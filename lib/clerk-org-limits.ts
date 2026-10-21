/**
 * Member cap every Clerk organization is created with. Clerk's free plan
 * rejects anything above 20, including 0 (= unlimited), with 402 Payment
 * Required. After adding Clerk's B2B organizations add-on, set this to 0 and
 * raise existing orgs in the Clerk dashboard.
 */
export const ORG_MEMBER_LIMIT = 20;
